import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  FS_ERRORS,
  FsConfig,
  defaultFsConfig,
  mergeFsConfig,
  patternNumber,
} from './fs.constants';

export type Tx = Prisma.TransactionClient;
export type FsRight =
  | 'request'
  | 'workorder'
  | 'dispatch'
  | 'execute'
  | 'parts'
  | 'approve'
  | 'plan'
  | 'agreement'
  | 'money'
  | 'pii'
  | 'export'
  | 'settings';

export interface FsActor extends Record<FsRight, boolean> {
  userId: string;
  name: string;
  roleLabel: string;
  owner: boolean;
  rootId: string;
  businessId: string;
  /** Can carry out jobs but not plan them — sees only their own work orders. */
  techOnly: boolean;
  /** Read-only analyst-style access (view only). */
  readOnly: boolean;
  user: AuthenticatedUser;
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const num = (
  d: Prisma.Decimal | number | string | bigint | null | undefined,
) => (d == null ? 0 : Number(d));
export const dec = (n: number) => new Prisma.Decimal(r2(n).toFixed(2));
export const corrId = () => 'corr_' + randomBytes(4).toString('hex');

export const FS_CAP: Record<FsRight, string> = {
  request: CAPABILITIES.FIELD_REQUEST,
  workorder: CAPABILITIES.FIELD_WORKORDER,
  dispatch: CAPABILITIES.FIELD_DISPATCH,
  execute: CAPABILITIES.FIELD_EXECUTE,
  parts: CAPABILITIES.FIELD_PARTS,
  approve: CAPABILITIES.FIELD_APPROVE,
  plan: CAPABILITIES.FIELD_PLAN,
  agreement: CAPABILITIES.FIELD_AGREEMENT,
  money: CAPABILITIES.FIELD_MONEY,
  pii: CAPABILITIES.FIELD_PII,
  export: CAPABILITIES.FIELD_EXPORT,
  settings: CAPABILITIES.FIELD_SETTINGS,
};

export const fsErr = (
  code: string,
  msg: string,
  status = HttpStatus.BAD_REQUEST,
) => new AppException(code, msg, status);
export const notFound = (what: string) =>
  fsErr(FS_ERRORS.NOT_FOUND, `${what} not found`, HttpStatus.NOT_FOUND);

/**
 * Shared plumbing for Field Service: the business group (records are keyed by the group root,
 * branches are Business children), the person's field rights, versioned settings, number
 * sequences, staff names, notifications, idempotency keys and the append-only audit trail.
 */
@Injectable()
export class FsContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caps: CapabilitiesService,
  ) {}

  get db() {
    return this.prisma;
  }

  async rootOf(businessId: string): Promise<string> {
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
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));
  }

  async business(rootId: string) {
    return this.prisma.business.findUniqueOrThrow({
      where: { id: rootId },
      select: { id: true, name: true, currency: true, timezone: true },
    });
  }

  async actor(user: AuthenticatedUser): Promise<FsActor> {
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
      throw fsErr(
        FS_ERRORS.FORBIDDEN,
        'You are not a member of this business.',
        HttpStatus.FORBIDDEN,
      );
    const role = user.role ?? here.role;
    const owner = role === Role.owner;
    let list: string[] = [];
    if (!owner)
      list = await this.caps.resolve({
        businessId: here.businessId,
        role: here.role,
        customRoleId: here.customRoleId,
      });
    const has = (c: string) => owner || list.includes(c);
    const r = Object.fromEntries(
      (Object.keys(FS_CAP) as FsRight[]).map((k) => [k, has(FS_CAP[k])]),
    ) as Record<FsRight, boolean>;
    if (
      !has(CAPABILITIES.FIELD_VIEW) &&
      !r.approve &&
      !r.settings &&
      !r.execute
    )
      throw fsErr(
        FS_ERRORS.FORBIDDEN,
        'Your role doesn’t include Field Service. An Owner can grant “field.view” (plus dispatcher or technician rights) in Staff › Roles.',
        HttpStatus.FORBIDDEN,
      );
    const label =
      here.customRole?.name ??
      (owner ? 'Owner' : role === Role.manager ? 'Manager' : 'Staff');
    const techOnly =
      !owner && r.execute && !r.dispatch && !r.approve && !r.workorder;
    const anyWrite = (Object.keys(r) as FsRight[]).some(
      (k) => r[k] && !['money', 'pii', 'export'].includes(k),
    );
    return {
      userId: user.sub,
      name: here.user.name,
      roleLabel: label,
      owner,
      rootId,
      businessId: here.businessId,
      ...r,
      techOnly,
      readOnly: !owner && !anyWrite,
      user,
    };
  }

  /** The scheduler acting for a business (preventive engine): full rights, attributed to System. */
  systemActor(rootId: string): FsActor {
    const r = Object.fromEntries(
      (Object.keys(FS_CAP) as FsRight[]).map((k) => [k, true]),
    ) as Record<FsRight, boolean>;
    return {
      userId: 'System',
      name: 'Preventive engine',
      roleLabel: 'System',
      owner: true,
      rootId,
      businessId: rootId,
      ...r,
      techOnly: false,
      readOnly: false,
      user: { sub: 'System', businessId: rootId } as AuthenticatedUser,
    };
  }

  need(a: FsActor, right: FsRight, what: string): void {
    if (a[right]) return;
    throw fsErr(
      FS_ERRORS.FORBIDDEN,
      `PERMISSION_DENIED — ${what} needs “${FS_CAP[right]}”, which your role doesn’t have.`,
      HttpStatus.FORBIDDEN,
    );
  }

  // ── settings & numbering ──────────────────────────────────────────────

  async ensure(rootId: string) {
    const found = await this.prisma.fsSettings.findUnique({
      where: { businessId: rootId },
    });
    if (found) return found;
    try {
      return await this.prisma.fsSettings.create({
        data: {
          businessId: rootId,
          config: defaultFsConfig() as unknown as Prisma.InputJsonValue,
          version: 1,
        },
      });
    } catch {
      return this.prisma.fsSettings.findUniqueOrThrow({
        where: { businessId: rootId },
      });
    }
  }

  async config(rootId: string): Promise<FsConfig> {
    return mergeFsConfig((await this.ensure(rootId)).config);
  }

  private async next(
    rootId: string,
    kind:
      | 'nextWo'
      | 'nextSr'
      | 'nextAgr'
      | 'nextWrn'
      | 'nextPm'
      | 'nextIns'
      | 'nextLab',
    tx?: Tx,
  ): Promise<number> {
    await this.ensure(rootId);
    const db = tx ?? this.prisma;
    const s = await db.fsSettings.update({
      where: { businessId: rootId },
      data: { [kind]: { increment: 1 } },
    });
    return (s as unknown as Record<string, number>)[kind] - 1;
  }

  async number(
    rootId: string,
    kind: 'wo' | 'sr' | 'agr' | 'wrn' | 'pm' | 'ins' | 'lab',
    tx?: Tx,
  ): Promise<string> {
    const cfg = await this.config(rootId);
    const key = (
      {
        wo: 'nextWo',
        sr: 'nextSr',
        agr: 'nextAgr',
        wrn: 'nextWrn',
        pm: 'nextPm',
        ins: 'nextIns',
        lab: 'nextLab',
      } as const
    )[kind];
    const n = await this.next(rootId, key, tx);
    if (kind === 'wo') return patternNumber(cfg.numbering.wo, n);
    if (kind === 'sr') return patternNumber(cfg.numbering.sr, n);
    return patternNumber(
      {
        agr: 'AGR-{00}',
        wrn: 'WRN-{00}',
        pm: 'PM-{00}',
        ins: 'INS-{0000}',
        lab: 'LAB-{000}',
      }[kind],
      n,
    );
  }

  async preview(rootId: string, kind: 'wo' | 'sr') {
    const s = await this.ensure(rootId);
    const cfg = mergeFsConfig(s.config);
    return patternNumber(
      kind === 'wo' ? cfg.numbering.wo : cfg.numbering.sr,
      kind === 'wo' ? s.nextWo : s.nextSr,
    );
  }

  // ── people ────────────────────────────────────────────────────────────

  /** Active staff across the group, one row per person (first membership wins). */
  async members(rootId: string) {
    const group = await this.branches(rootId);
    const rows = await this.prisma.businessUser.findMany({
      where: { businessId: { in: group.map((g) => g.id) }, active: true },
      include: {
        user: { select: { id: true, name: true } },
        customRole: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const seen = new Map<
      string,
      {
        id: string;
        buIds: string[];
        name: string;
        role: string;
        label: string;
        rate: number | null;
      }
    >();
    for (const r of rows) {
      const cur = seen.get(r.userId);
      if (cur) {
        cur.buIds.push(r.id);
        if (cur.rate == null && r.hourlyRate != null)
          cur.rate = Number(r.hourlyRate);
        continue;
      }
      seen.set(r.userId, {
        id: r.userId,
        buIds: [r.id],
        name: r.user.name,
        role: r.role,
        label:
          r.customRole?.name ??
          (r.role === Role.owner
            ? 'Owner'
            : r.role === Role.manager
              ? 'Manager'
              : 'Staff'),
        rate: r.hourlyRate == null ? null : Number(r.hourlyRate),
      });
    }
    return [...seen.values()];
  }

  async notify(
    rootId: string,
    userIds: string[],
    title: string,
    body: string,
    link: string,
    exceptUserId?: string,
  ) {
    const group = await this.branches(rootId);
    const rows = await this.prisma.businessUser.findMany({
      where: {
        userId: { in: [...new Set(userIds)] },
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

  /** Owners and everyone whose role carries the given capability (for approvals and alerts). */
  async usersWith(rootId: string, cap: string) {
    const group = await this.branches(rootId);
    const rows = await this.prisma.businessUser.findMany({
      where: { businessId: { in: group.map((g) => g.id) }, active: true },
      select: {
        userId: true,
        role: true,
        businessId: true,
        customRoleId: true,
      },
    });
    const out = new Set<string>();
    for (const r of rows) {
      if (r.role === Role.owner) {
        out.add(r.userId);
        continue;
      }
      const list = await this.caps.resolve({
        businessId: r.businessId,
        role: r.role,
        customRoleId: r.customRoleId,
      });
      if ((list as string[]).includes(cap)) out.add(r.userId);
    }
    return [...out];
  }

  async audit(
    rootId: string,
    a: FsActor | 'System',
    action: string,
    entityType: string,
    entityId: string,
    detail: string,
    o?: { corr?: string; tx?: Tx },
  ) {
    const db = o?.tx ?? this.prisma;
    await db.fsAudit.create({
      data: {
        businessId: rootId,
        actorId: a === 'System' ? 'System' : a.userId,
        actorName:
          a === 'System'
            ? 'System'
            : `${a.name} (${a.roleLabel})`.slice(0, 160),
        action: action.slice(0, 80),
        entityType: entityType.slice(0, 16),
        entityId,
        detail: detail.slice(0, 4000),
        correlation: o?.corr ?? corrId(),
      },
    });
  }

  /** Append a line to a work order's timeline. */
  async event(
    rootId: string,
    woId: string,
    text: string,
    by: FsActor | string,
    tx?: Tx,
  ) {
    const db = tx ?? this.prisma;
    await db.fsEvent.create({
      data: {
        businessId: rootId,
        woId,
        text: text.slice(0, 4000),
        byUserId: typeof by === 'object' ? by.userId : null,
        byName: (typeof by === 'object' ? by.name : by).slice(0, 160),
      },
    });
  }

  // ── idempotency ───────────────────────────────────────────────────────

  /**
   * Runs `fn` once per client key. A key that already finished replays its stored result; one
   * still running is refused, so a double tap or an offline replay never acts twice.
   */
  async once<T>(
    rootId: string,
    key: string | undefined | null,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!key) return fn();
    const k = key.slice(0, 120);
    const prev = await this.prisma.fsIdem.findUnique({
      where: { businessId_key: { businessId: rootId, key: k } },
    });
    if (prev?.status === 'done') return prev.result as T;
    if (
      prev?.status === 'in_flight' &&
      Date.now() - prev.updatedAt.getTime() < 60_000
    )
      throw fsErr(
        FS_ERRORS.DUPLICATE,
        `DUPLICATE_OPERATION — already in progress (${k}).`,
        HttpStatus.CONFLICT,
      );
    if (prev)
      await this.prisma.fsIdem.update({
        where: { id: prev.id },
        data: { status: 'in_flight' },
      });
    else
      try {
        await this.prisma.fsIdem.create({
          data: { businessId: rootId, key: k, status: 'in_flight' },
        });
      } catch {
        throw fsErr(
          FS_ERRORS.DUPLICATE,
          `DUPLICATE_OPERATION — already in progress (${k}).`,
          HttpStatus.CONFLICT,
        );
      }
    try {
      const r = await fn();
      await this.prisma.fsIdem.update({
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
      await this.prisma.fsIdem
        .update({
          where: { businessId_key: { businessId: rootId, key: k } },
          data: { status: 'failed' },
        })
        .catch(() => null);
      throw e;
    }
  }
}
