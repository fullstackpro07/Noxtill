import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  DEFAULT_METHODS,
  PAY_ERRORS,
  PayEnv,
  PayPolicy,
  bigUnit,
  defaultPolicy,
  mergePolicy,
} from './payments.constants';

export type Tx = Prisma.TransactionClient;
export type Level =
  'request' | 'recover' | 'refund' | 'dispute' | 'recon' | 'approve' | 'admin';

export interface PayActor {
  userId: string;
  name: string;
  role: 'Owner' | 'Manager' | 'Staff';
  /** Custom role name when the person has one (shown as "Viewing as"). */
  roleLabel: string;
  rootId: string;
  businessId: string;
  view: boolean;
  request: boolean;
  recover: boolean;
  refund: boolean;
  dispute: boolean;
  recon: boolean;
  approve: boolean;
  admin: boolean;
  fees: boolean;
  pii: boolean;
  export: boolean;
  /** Raw provider events and account ids (admin). */
  raw: boolean;
  /** Payout destination (approve/admin). */
  dest: boolean;
  /** Branches this person may see; null = the whole group. */
  branches: string[] | null;
  /** Staff without broader rights see only payments they took themselves. */
  ownOnly: boolean;
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const num = (d: Prisma.Decimal | number | string | null | undefined) =>
  d == null ? 0 : Number(d);
export const dec = (n: number) => new Prisma.Decimal(r2(n).toFixed(2));
export const corrId = () => 'corr_' + randomBytes(5).toString('hex');

/**
 * Shared plumbing for Payments & Billing: which business group a request belongs to, who the
 * person is in payments terms (field-level rights included), the seeded policy and method matrix,
 * numbering, FX into the base currency and the append-only audit trail.
 */
@Injectable()
export class PayContextService {
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
    if (!b)
      throw new AppException(
        PAY_ERRORS.NOT_FOUND,
        'Business not found',
        HttpStatus.NOT_FOUND,
      );
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
        country: true,
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
        country: true,
        slug: true,
        phone: true,
        address: true,
        branding: true,
      },
    });
  }

  async actor(user: AuthenticatedUser): Promise<PayActor> {
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
      throw new AppException(
        PAY_ERRORS.FORBIDDEN,
        'You are not a member of this business.',
        HttpStatus.FORBIDDEN,
      );
    const role = user.role ?? here.role;
    const owner = role === Role.owner;
    let has = (_c: string) => true;
    if (!owner) {
      const list = (await this.caps.resolve({
        businessId: here.businessId,
        role: here.role,
        customRoleId: here.customRoleId,
      })) as string[];
      has = (c) => list.includes(c);
    }
    const admin = has(CAPABILITIES.PAYMENTS_ADMIN);
    const approve = admin || has(CAPABILITIES.PAYMENTS_APPROVE);
    const view = has(CAPABILITIES.PAYMENTS_VIEW) || approve;
    if (!view)
      throw new AppException(
        PAY_ERRORS.FORBIDDEN,
        'Your role doesn’t include Payments & Billing. Ask an Owner to grant “payments.view” in Staff › Roles.',
        HttpStatus.FORBIDDEN,
      );
    const refund = approve || has(CAPABILITIES.PAYMENTS_REFUND);
    const recon = approve || has(CAPABILITIES.PAYMENTS_RECONCILE);
    const dispute = approve || has(CAPABILITIES.PAYMENTS_DISPUTE);
    const recover = refund || has(CAPABILITIES.PAYMENTS_RECOVER);
    const request = recover || has(CAPABILITIES.PAYMENTS_REQUEST);
    const fees = approve || recon || has(CAPABILITIES.PAYMENTS_FEES);
    const pii = approve || has(CAPABILITIES.PAYMENTS_PII);
    // Branch scope: the root membership sees the whole group; otherwise only the member branches.
    const memberOf = memberships.map((m) => m.businessId);
    const branches = owner || memberOf.includes(rootId) ? null : memberOf;
    const ownOnly =
      !owner && role === Role.staff && !recover && !recon && !approve;
    return {
      userId: user.sub,
      name: here.user.name,
      role: owner ? 'Owner' : role === Role.manager ? 'Manager' : 'Staff',
      roleLabel:
        here.customRole?.name ??
        (owner ? 'Owner' : role === Role.manager ? 'Manager' : 'Staff'),
      rootId,
      businessId: user.businessId,
      view: true,
      request,
      recover,
      refund,
      dispute,
      recon,
      approve,
      admin,
      fees,
      pii,
      export: approve || has(CAPABILITIES.PAYMENTS_EXPORT),
      raw: admin,
      dest: approve,
      branches,
      ownOnly,
    };
  }

  need(a: PayActor, level: Level, what: string): void {
    if (a[level]) return;
    const cap = {
      request: 'payments.request',
      recover: 'payments.recover',
      refund: 'payments.refund',
      dispute: 'payments.dispute',
      recon: 'payments.reconcile',
      approve: 'payments.approve',
      admin: 'payments.admin',
    }[level];
    throw new AppException(
      PAY_ERRORS.FORBIDDEN,
      `PERMISSION_DENIED — ${what} needs “${cap}”, which your role doesn’t have.`,
      HttpStatus.FORBIDDEN,
    );
  }

  // ── settings, policy, numbering ──────────────────────────────────────────

  async ensure(rootId: string) {
    const found = await this.prisma.paySettings.findUnique({
      where: { businessId: rootId },
    });
    if (found) return found;
    const biz = await this.business(rootId);
    const policy = defaultPolicy(biz.currency);
    try {
      const s = await this.prisma.paySettings.create({
        data: {
          businessId: rootId,
          policy: policy as unknown as Prisma.InputJsonValue,
          policyVersion: 1,
        },
      });
      await this.prisma.payPolicyVersion.create({
        data: {
          businessId: rootId,
          version: 1,
          policy: policy as unknown as Prisma.InputJsonValue,
          changed: [],
          reason: 'Defaults',
          byId: 'System',
        },
      });
      const big = bigUnit(biz.currency);
      await this.prisma.payMethodConfig.createMany({
        data: DEFAULT_METHODS(big).map((m) => ({
          businessId: rootId,
          method: m.method,
          enabled: m.enabled,
          channels: m.channels,
          primary: m.primary,
          fallback: m.fallback,
          minAmount: dec(m.minAmount),
          maxAmount: dec(m.maxAmount),
          riskPolicy: m.riskPolicy,
        })),
        skipDuplicates: true,
      });
      return s;
    } catch {
      return this.prisma.paySettings.findUniqueOrThrow({
        where: { businessId: rootId },
      });
    }
  }

  async policy(rootId: string): Promise<PayPolicy> {
    const s = await this.ensure(rootId);
    const biz = await this.business(rootId);
    return mergePolicy(defaultPolicy(biz.currency), s.policy);
  }

  async next(
    rootId: string,
    kind: 'txSeq' | 'requestSeq' | 'refundSeq' | 'ruleSeq',
    tx?: Tx,
  ) {
    await this.ensure(rootId);
    const db = tx ?? this.prisma;
    const s = await db.paySettings.update({
      where: { businessId: rootId },
      data: { [kind]: { increment: 1 } },
      select: { [kind]: true } as Record<typeof kind, true>,
    });
    const n = (s as Record<string, number>)[kind];
    return n;
  }

  async number(rootId: string, kind: 'tx' | 'request' | 'refund', tx?: Tx) {
    const n = await this.next(rootId, `${kind}Seq` as 'txSeq', tx);
    const pre = { tx: 'PAY-', request: 'PR-', refund: 'RFX-' }[kind];
    return pre + String(n).padStart(kind === 'tx' ? 6 : 4, '0');
  }

  // ── FX ────────────────────────────────────────────────────────────────

  /** Base-currency rate for `currency` on `on`, from Finance's exchange-rate table; null when missing. */
  async rateOn(
    rootId: string,
    currency: string,
    on: Date,
    base?: string,
  ): Promise<number | null> {
    const b = base ?? (await this.business(rootId)).currency;
    if (!currency || currency === b) return 1;
    const row = await this.prisma.finExchangeRate.findFirst({
      where: {
        businessId: rootId,
        currency,
        effectiveOn: {
          lte: new Date(
            Date.UTC(on.getUTCFullYear(), on.getUTCMonth(), on.getUTCDate()),
          ),
        },
      },
      orderBy: { effectiveOn: 'desc' },
    });
    return row ? Number(row.rate) : null;
  }

  // ── people ────────────────────────────────────────────────────────────

  async userNames(ids: (string | null | undefined)[]) {
    const uniq = [
      ...new Set(ids.filter((x): x is string => !!x && x !== 'System')),
    ];
    if (!uniq.length) return new Map<string, string>();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: uniq } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async members(rootId: string) {
    const group = await this.branches(rootId);
    const rows = await this.prisma.businessUser.findMany({
      where: { businessId: { in: group.map((g) => g.id) }, active: true },
      include: { user: { select: { id: true, name: true } } },
    });
    const seen = new Map<string, { id: string; name: string; role: string }>();
    for (const r of rows)
      if (!seen.has(r.userId))
        seen.set(r.userId, { id: r.userId, name: r.user.name, role: r.role });
    return [...seen.values()];
  }

  async owners(rootId: string) {
    const group = await this.branches(rootId);
    const rows = await this.prisma.businessUser.findMany({
      where: {
        businessId: { in: group.map((g) => g.id) },
        active: true,
        role: Role.owner,
      },
      select: { userId: true, businessId: true },
    });
    return rows;
  }

  async notifyOwners(
    rootId: string,
    title: string,
    body: string,
    link: string,
    exceptUserId?: string,
  ) {
    for (const o of await this.owners(rootId)) {
      if (o.userId === exceptUserId) continue;
      await this.prisma.notification
        .create({
          data: {
            businessId: o.businessId,
            userId: o.userId,
            title,
            body,
            link,
          },
        })
        .catch(() => null);
    }
  }

  // ── audit & outbox ────────────────────────────────────────────────────

  async audit(
    rootId: string,
    a: PayActor | 'System',
    action: string,
    entityType: string,
    entityId: string,
    detail: string,
    corr?: string,
    tx?: Tx,
  ) {
    const db = tx ?? this.prisma;
    await db.payAudit.create({
      data: {
        businessId: rootId,
        actorId: a === 'System' ? null : a.userId,
        actorName: a === 'System' ? 'System' : a.name,
        action: action.slice(0, 120),
        entityType,
        entityId,
        detail: detail.slice(0, 500),
        corr: corr ?? null,
      },
    });
  }

  async outbox(
    rootId: string,
    event: string,
    payload: Record<string, unknown>,
    consumers: string[],
    tx?: Tx,
  ) {
    const db = tx ?? this.prisma;
    await db.payOutbox.create({
      data: {
        businessId: rootId,
        event,
        payload: payload as Prisma.InputJsonValue,
        consumers,
        status: 'Delivered',
        deliveredAt: new Date(),
      },
    });
  }

  /** Which env a request is for (UI select). Never trusted for provider writes: connections carry their own env. */
  env(v: string | undefined | null): PayEnv {
    return v === 'test' ? 'test' : 'live';
  }
}
