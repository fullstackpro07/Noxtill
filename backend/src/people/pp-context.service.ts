import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { TokenCipherService } from '../integrations/token-cipher.service';
import {
  PP_ERRORS,
  PpConfig,
  defaultPpConfig,
  mergePpConfig,
} from './pp.constants';

export type Tx = Prisma.TransactionClient;
export type PpRight =
  | 'recruit'
  | 'jobApprove'
  | 'interview'
  | 'offerApprove'
  | 'comp'
  | 'salary'
  | 'onboard'
  | 'leaveApprove'
  | 'leaveReason'
  | 'payroll'
  | 'payApprove'
  | 'payout'
  | 'benefits'
  | 'perf'
  | 'perfPrivate'
  | 'training'
  | 'offboard'
  | 'exitReason'
  | 'export'
  | 'pii'
  | 'audit'
  | 'settings';

export const PP_CAP: Record<PpRight, string> = {
  recruit: CAPABILITIES.PEOPLE_RECRUIT,
  jobApprove: CAPABILITIES.PEOPLE_JOB_APPROVE,
  interview: CAPABILITIES.PEOPLE_INTERVIEW,
  offerApprove: CAPABILITIES.PEOPLE_OFFER_APPROVE,
  comp: CAPABILITIES.PEOPLE_COMP,
  salary: CAPABILITIES.PEOPLE_SALARY,
  onboard: CAPABILITIES.PEOPLE_ONBOARD,
  leaveApprove: CAPABILITIES.PEOPLE_LEAVE_APPROVE,
  leaveReason: CAPABILITIES.PEOPLE_LEAVE_REASON,
  payroll: CAPABILITIES.PEOPLE_PAYROLL,
  payApprove: CAPABILITIES.PEOPLE_PAY_APPROVE,
  payout: CAPABILITIES.PEOPLE_PAYOUT,
  benefits: CAPABILITIES.PEOPLE_BENEFITS,
  perf: CAPABILITIES.PEOPLE_PERF,
  perfPrivate: CAPABILITIES.PEOPLE_PERF_PRIVATE,
  training: CAPABILITIES.PEOPLE_TRAINING,
  offboard: CAPABILITIES.PEOPLE_OFFBOARD,
  exitReason: CAPABILITIES.PEOPLE_EXIT_REASON,
  export: CAPABILITIES.PEOPLE_EXPORT,
  pii: CAPABILITIES.PEOPLE_PII,
  audit: CAPABILITIES.PEOPLE_AUDIT,
  settings: CAPABILITIES.PEOPLE_SETTINGS,
};

/** Whole-organisation scope comes with any HR / payroll administration right. */
const ORG_RIGHTS: PpRight[] = [
  'settings',
  'onboard',
  'offboard',
  'payroll',
  'payApprove',
  'benefits',
  'training',
  'audit',
  'export',
  'recruit',
];

export interface PpActor extends Record<PpRight, boolean> {
  userId: string;
  name: string;
  roleLabel: string;
  owner: boolean;
  rootId: string;
  businessId: string;
  /** org = everyone in scope · team = direct reports + self · self = only me */
  scope: 'org' | 'team' | 'self';
  user: AuthenticatedUser;
}

export interface Member {
  id: string;
  buId: string;
  buIds: string[];
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  label: string;
  businessId: string;
  active: boolean;
  hourlyRate: number | null;
  customRoleId: string | null;
}

export const num = (
  d: Prisma.Decimal | number | string | bigint | null | undefined,
) => (d == null ? 0 : Number(d));
export const corrId = () => 'corr_' + randomBytes(4).toString('hex');
export const ppErr = (
  code: string,
  msg: string,
  status = HttpStatus.BAD_REQUEST,
) => new AppException(code, msg, status);
export const notFound = (what: string) =>
  ppErr(PP_ERRORS.NOT_FOUND, `${what} not found`, HttpStatus.NOT_FOUND);
export const mask = (v: string) => {
  const s = v.replace(/\s+/g, '');
  return s.length <= 4 ? '••' + s : '••' + s.slice(-4);
};

/**
 * Shared plumbing for People & Payroll: the business group (records keyed by the group root),
 * the person's rights and scope, versioned settings, number sequences, staff (the employee
 * source), notifications, idempotency keys, encryption of bank/tax identifiers and the audit trail.
 */
@Injectable()
export class PpContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caps: CapabilitiesService,
    private readonly cipher: TokenCipherService,
  ) {}

  get db() {
    return this.prisma;
  }

  async rootOf(businessId: string) {
    const b = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    if (!b) throw notFound('Business');
    return b.parentId ?? b.id;
  }

  async branches(rootId: string) {
    const rows = await this.prisma.business.findMany({
      where: { OR: [{ id: rootId }, { parentId: rootId }] },
      select: {
        id: true,
        name: true,
        parentId: true,
        currency: true,
        timezone: true,
        address: true,
        slug: true,
        overtimeRateMultiplier: true,
        overtimeThresholdHoursPerWeek: true,
        breakThresholdHours: true,
        breakMinutesPerShift: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));
  }

  async business(rootId: string) {
    return this.prisma.business.findUniqueOrThrow({
      where: { id: rootId },
      select: {
        id: true,
        name: true,
        currency: true,
        timezone: true,
        address: true,
        slug: true,
        overtimeRateMultiplier: true,
      },
    });
  }

  async actor(user: AuthenticatedUser): Promise<PpActor> {
    const rootId = await this.rootOf(user.businessId);
    const group = await this.branches(rootId);
    const memberships = await this.prisma.businessUser.findMany({
      where: {
        userId: user.sub,
        active: true,
        businessId: { in: group.map((g) => g.id) },
      },
      include: {
        user: { select: { name: true } },
        customRole: { select: { name: true } },
      },
    });
    const here =
      memberships.find((m) => m.businessId === user.businessId) ??
      memberships[0];
    if (!here)
      throw ppErr(
        PP_ERRORS.FORBIDDEN,
        'You are not a member of this business.',
        HttpStatus.FORBIDDEN,
      );
    const role = user.role ?? here.role;
    const owner = role === Role.owner;
    const list = owner
      ? []
      : await this.caps.resolve({
          businessId: here.businessId,
          role: here.role,
          customRoleId: here.customRoleId,
        });
    const has = (c: string) => owner || (list as string[]).includes(c);
    if (!has(CAPABILITIES.PEOPLE_VIEW))
      throw ppErr(
        PP_ERRORS.FORBIDDEN,
        'Your role doesn’t include People & Payroll. An Owner can grant “people.view” in Staff › Roles.',
        HttpStatus.FORBIDDEN,
      );
    const r = Object.fromEntries(
      (Object.keys(PP_CAP) as PpRight[]).map((k) => [k, has(PP_CAP[k])]),
    ) as Record<PpRight, boolean>;
    const scope: PpActor['scope'] =
      owner || ORG_RIGHTS.some((k) => r[k])
        ? 'org'
        : r.leaveApprove || r.perf || r.interview
          ? 'team'
          : 'self';
    return {
      userId: user.sub,
      name: here.user.name,
      roleLabel:
        here.customRole?.name ??
        (owner ? 'Owner' : role === Role.manager ? 'Manager' : 'Employee'),
      owner,
      rootId,
      businessId: here.businessId,
      ...r,
      scope,
      user,
    };
  }

  need(a: PpActor, right: PpRight, what: string) {
    if (a[right]) return;
    throw ppErr(
      PP_ERRORS.FORBIDDEN,
      `PERMISSION_DENIED — ${what} needs “${PP_CAP[right]}”, which your role doesn’t have.`,
      HttpStatus.FORBIDDEN,
    );
  }

  // ── settings & numbering ──────────────────────────────────────────────

  async ensure(rootId: string) {
    const found = await this.prisma.ppSettings.findUnique({
      where: { businessId: rootId },
    });
    if (found) return found;
    try {
      return await this.prisma.ppSettings.create({
        data: {
          businessId: rootId,
          config: defaultPpConfig() as unknown as Prisma.InputJsonValue,
          version: 1,
        },
      });
    } catch {
      return this.prisma.ppSettings.findUniqueOrThrow({
        where: { businessId: rootId },
      });
    }
  }

  async config(rootId: string): Promise<PpConfig> {
    return mergePpConfig((await this.ensure(rootId)).config);
  }

  async saveConfig(a: PpActor, next: PpConfig, changed: string[], tx?: Tx) {
    const s = await this.ensure(a.rootId);
    const run = async (db: Tx) => {
      await db.ppSettings.update({
        where: { businessId: a.rootId },
        data: {
          config: next as unknown as Prisma.InputJsonValue,
          version: s.version + 1,
        },
      });
      await db.ppSettingsVersion.create({
        data: {
          businessId: a.rootId,
          version: s.version + 1,
          config: next as unknown as Prisma.InputJsonValue,
          changed,
          byUserId: a.userId,
        },
      });
      await this.audit(
        a.rootId,
        a,
        'Settings changed',
        'settings',
        a.rootId,
        `v${s.version + 1} · ${changed.join(', ')}`,
        { tx: db },
      );
    };
    if (tx) await run(tx);
    else await this.prisma.$transaction(run);
    return s.version + 1;
  }

  async number(
    rootId: string,
    kind:
      | 'job'
      | 'cand'
      | 'int'
      | 'offer'
      | 'onb'
      | 'leave'
      | 'rule'
      | 'cycle'
      | 'review'
      | 'course'
      | 'ta'
      | 'ofb',
    tx?: Tx,
  ) {
    await this.ensure(rootId);
    const map = {
      job: ['nextJob', 'JOB-', 3],
      cand: ['nextCand', 'CAN-', 3],
      int: ['nextInt', 'INT-', 3],
      offer: ['nextOffer', 'OFF-', 3],
      onb: ['nextOnb', 'ONB-', 3],
      leave: ['nextLeave', 'LV-', 4],
      rule: ['nextRule', 'BR-', 3],
      cycle: ['nextCycle', 'CYC-', 2],
      review: ['nextReview', 'REV-', 3],
      course: ['nextCourse', 'TRN-', 2],
      ta: ['nextTa', 'TA-', 3],
      ofb: ['nextOfb', 'OFB-', 3],
    } as const;
    const [col, prefix, pad] = map[kind];
    const s = await (tx ?? this.prisma).ppSettings.update({
      where: { businessId: rootId },
      data: { [col]: { increment: 1 } },
    });
    return (
      prefix +
      String((s as unknown as Record<string, number>)[col] - 1).padStart(
        pad,
        '0',
      )
    );
  }

  // ── people (Staff is the source) ──────────────────────────────────────

  async members(rootId: string, includeInactive = false): Promise<Member[]> {
    const group = await this.branches(rootId);
    const rows = await this.prisma.businessUser.findMany({
      where: {
        businessId: { in: group.map((g) => g.id) },
        ...(includeInactive ? {} : { active: true }),
      },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        customRole: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const seen = new Map<string, Member>();
    for (const r of rows) {
      const m = seen.get(r.userId);
      if (m) {
        m.buIds.push(r.id);
        if (r.active) m.active = true;
        continue;
      }
      seen.set(r.userId, {
        id: r.userId,
        buId: r.id,
        buIds: [r.id],
        name: r.user.name,
        email: r.user.email,
        phone: r.user.phone,
        role: r.role,
        label:
          r.customRole?.name ??
          (r.role === Role.owner
            ? 'Owner'
            : r.role === Role.manager
              ? 'Manager'
              : 'Staff'),
        businessId: r.businessId,
        active: r.active,
        hourlyRate: r.hourlyRate == null ? null : Number(r.hourlyRate),
        customRoleId: r.customRoleId,
      });
    }
    return [...seen.values()];
  }

  encrypt(v: string) {
    try {
      return this.cipher.encrypt(v);
    } catch {
      throw ppErr(
        PP_ERRORS.NOT_CONFIGURED,
        'Encryption key isn’t configured on the server (INTEGRATIONS_TOKEN_KEY) — bank and tax numbers can’t be stored safely.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  decrypt(v: string | null) {
    if (!v) return null;
    try {
      return this.cipher.decrypt(v);
    } catch {
      return null;
    }
  }

  async notify(
    rootId: string,
    userIds: (string | null | undefined)[],
    title: string,
    body: string,
    link: string,
    exceptUserId?: string,
  ) {
    const group = await this.branches(rootId);
    const ids = [...new Set(userIds.filter(Boolean) as string[])];
    if (!ids.length) return 0;
    const rows = await this.prisma.businessUser.findMany({
      where: {
        userId: { in: ids },
        businessId: { in: group.map((g) => g.id) },
        active: true,
      },
      select: { userId: true, businessId: true },
    });
    const done = new Set<string>();
    for (const r of rows) {
      if (r.userId === exceptUserId || done.has(r.userId)) continue;
      done.add(r.userId);
      await this.prisma.notification
        .create({
          data: {
            businessId: r.businessId,
            userId: r.userId,
            title,
            body,
            link,
          },
        })
        .catch(() => null);
    }
    return done.size;
  }

  async ownerIds(rootId: string) {
    return (await this.members(rootId))
      .filter((m) => m.role === Role.owner)
      .map((m) => m.id);
  }

  async audit(
    rootId: string,
    a: PpActor | 'System' | { name: string },
    action: string,
    entityType: string,
    entityId: string,
    detail: string,
    o?: { corr?: string; tx?: Tx },
  ) {
    const db = o?.tx ?? this.prisma;
    const isActor = typeof a === 'object' && 'userId' in a;
    await db.ppAudit.create({
      data: {
        businessId: rootId,
        actorId: isActor ? a.userId : 'System',
        actorName: (a === 'System'
          ? 'System'
          : isActor
            ? `${a.name} (${a.roleLabel})`
            : a.name
        ).slice(0, 160),
        action: action.slice(0, 80),
        entityType: entityType.slice(0, 16),
        entityId,
        detail: detail.slice(0, 4000),
        correlation: o?.corr ?? corrId(),
      },
    });
  }

  /** Runs `fn` once per key — a finished key replays its result, a running one is refused. */
  async once<T>(
    rootId: string,
    key: string | undefined | null,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!key) return fn();
    const k = key.slice(0, 120);
    const prev = await this.prisma.ppIdem.findUnique({
      where: { businessId_key: { businessId: rootId, key: k } },
    });
    if (prev?.status === 'done') return prev.result as T;
    if (
      prev?.status === 'in_flight' &&
      Date.now() - prev.updatedAt.getTime() < 60_000
    )
      throw ppErr(
        PP_ERRORS.DUPLICATE,
        `DUPLICATE_OPERATION — already in progress (${k}).`,
        HttpStatus.CONFLICT,
      );
    if (prev)
      await this.prisma.ppIdem.update({
        where: { id: prev.id },
        data: { status: 'in_flight' },
      });
    else
      try {
        await this.prisma.ppIdem.create({
          data: { businessId: rootId, key: k, status: 'in_flight' },
        });
      } catch {
        throw ppErr(
          PP_ERRORS.DUPLICATE,
          `DUPLICATE_OPERATION — already in progress (${k}).`,
          HttpStatus.CONFLICT,
        );
      }
    try {
      const r = await fn();
      await this.prisma.ppIdem.update({
        where: { businessId_key: { businessId: rootId, key: k } },
        data: {
          status: 'done',
          result:
            r == null
              ? Prisma.JsonNull
              : (JSON.parse(JSON.stringify(r)) as Prisma.InputJsonValue),
        },
      });
      return r;
    } catch (e) {
      await this.prisma.ppIdem
        .update({
          where: { businessId_key: { businessId: rootId, key: k } },
          data: { status: 'failed' },
        })
        .catch(() => null);
      throw e;
    }
  }
}
