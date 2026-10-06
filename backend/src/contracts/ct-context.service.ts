import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  CT_ERRORS,
  CtConfig,
  ctrNumber,
  defaultCtConfig,
  mergeCtConfig,
} from './ct.constants';

export type Tx = Prisma.TransactionClient;
export type CtRight =
  | 'upload'
  | 'documents'
  | 'delete'
  | 'manage'
  | 'approve'
  | 'terminate'
  | 'evidence'
  | 'compliance'
  | 'value'
  | 'restricted'
  | 'export'
  | 'settings';

export interface CtActor extends Record<CtRight, boolean> {
  userId: string;
  name: string;
  roleLabel: string;
  owner: boolean;
  rootId: string;
  businessId: string;
  /** Branches this person may see; null = the whole group. */
  branches: string[] | null;
  /** May open contracts, templates, signatures, approvals and expiries (not just documents). */
  contracts: boolean;
  user: AuthenticatedUser;
}

export const CT_CAP: Record<CtRight, string> = {
  upload: CAPABILITIES.CONTRACTS_UPLOAD,
  documents: CAPABILITIES.CONTRACTS_DOCUMENTS,
  delete: CAPABILITIES.CONTRACTS_DELETE,
  manage: CAPABILITIES.CONTRACTS_MANAGE,
  approve: CAPABILITIES.CONTRACTS_APPROVE,
  terminate: CAPABILITIES.CONTRACTS_TERMINATE,
  evidence: CAPABILITIES.CONTRACTS_EVIDENCE,
  compliance: CAPABILITIES.CONTRACTS_COMPLIANCE,
  value: CAPABILITIES.CONTRACTS_VALUE,
  restricted: CAPABILITIES.CONTRACTS_RESTRICTED,
  export: CAPABILITIES.CONTRACTS_EXPORT,
  settings: CAPABILITIES.CONTRACTS_SETTINGS,
};

export const num = (
  d: Prisma.Decimal | number | string | bigint | null | undefined,
) => (d == null ? 0 : Number(d));
export const corrId = () => 'corr_' + randomBytes(4).toString('hex');
export const ctErr = (
  code: string,
  msg: string,
  status = HttpStatus.BAD_REQUEST,
) => new AppException(code, msg, status);
export const notFound = (what: string) =>
  ctErr(CT_ERRORS.NOT_FOUND, `${what} not found`, HttpStatus.NOT_FOUND);

export interface Party {
  kind: 'customer' | 'supplier' | 'staff';
  id: string;
  name: string;
  module: string;
  type: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  businessId: string | null;
}

/**
 * Shared plumbing for Contracts: the business group (records keyed by the group root), the person's
 * rights and branch scope, versioned settings, number sequences, canonical counterparties, staff
 * names, notifications, idempotency keys and the append-only audit trail.
 */
@Injectable()
export class CtContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caps: CapabilitiesService,
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
      },
    });
  }

  async actor(user: AuthenticatedUser): Promise<CtActor> {
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
      throw ctErr(
        CT_ERRORS.FORBIDDEN,
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
    const r = Object.fromEntries(
      (Object.keys(CT_CAP) as CtRight[]).map((k) => [k, has(CT_CAP[k])]),
    ) as Record<CtRight, boolean>;
    if (!has(CAPABILITIES.CONTRACTS_VIEW) && !r.manage && !r.settings)
      throw ctErr(
        CT_ERRORS.FORBIDDEN,
        'Your role doesn’t include Contracts. An Owner can grant “contracts.view” in Staff › Roles.',
        HttpStatus.FORBIDDEN,
      );
    const memberOf = memberships.map((m) => m.businessId);
    return {
      userId: user.sub,
      name: here.user.name,
      roleLabel:
        here.customRole?.name ??
        (owner ? 'Owner' : role === Role.manager ? 'Manager' : 'Staff'),
      owner,
      rootId,
      businessId: here.businessId,
      ...r,
      branches: owner || memberOf.includes(rootId) ? null : memberOf,
      contracts: owner || r.manage || r.approve || r.evidence || r.value,
      user,
    };
  }

  need(a: CtActor, right: CtRight, what: string) {
    if (a[right]) return;
    throw ctErr(
      CT_ERRORS.FORBIDDEN,
      `PERMISSION_DENIED — ${what} needs “${CT_CAP[right]}”, which your role doesn’t have.`,
      HttpStatus.FORBIDDEN,
    );
  }

  // ── settings & numbering ──────────────────────────────────────────────

  async ensure(rootId: string) {
    const found = await this.prisma.ctSettings.findUnique({
      where: { businessId: rootId },
    });
    if (found) return found;
    try {
      return await this.prisma.ctSettings.create({
        data: {
          businessId: rootId,
          config: defaultCtConfig() as unknown as Prisma.InputJsonValue,
          version: 1,
          ctrYear: new Date().getUTCFullYear(),
        },
      });
    } catch {
      return this.prisma.ctSettings.findUniqueOrThrow({
        where: { businessId: rootId },
      });
    }
  }

  async config(rootId: string): Promise<CtConfig> {
    return mergeCtConfig((await this.ensure(rootId)).config);
  }

  private async next(
    rootId: string,
    kind: 'nextDoc' | 'nextTpl' | 'nextSig' | 'nextApr' | 'nextCmp',
    tx?: Tx,
  ) {
    await this.ensure(rootId);
    const s = await (tx ?? this.prisma).ctSettings.update({
      where: { businessId: rootId },
      data: { [kind]: { increment: 1 } },
    });
    return (s as unknown as Record<string, number>)[kind] - 1;
  }

  async number(
    rootId: string,
    kind: 'doc' | 'tpl' | 'sig' | 'apr' | 'cmp',
    tx?: Tx,
  ) {
    const cfg = await this.config(rootId);
    const key = (
      {
        doc: 'nextDoc',
        tpl: 'nextTpl',
        sig: 'nextSig',
        apr: 'nextApr',
        cmp: 'nextCmp',
      } as const
    )[kind];
    const n = await this.next(rootId, key, tx);
    if (kind === 'doc')
      return `${cfg.numbering.docPrefix}${String(n).padStart(4, '0')}`;
    return (
      { tpl: 'TPL-', sig: 'SIG-', apr: 'APR-CT-', cmp: 'CMP-' }[kind] +
      String(n).padStart(kind === 'sig' || kind === 'apr' ? 3 : 2, '0')
    );
  }

  /** Contract number — sequence resets each year when the pattern says Yearly (atomic). */
  async contractNumber(rootId: string, tx?: Tx) {
    const cfg = await this.config(rootId);
    const year = new Date().getUTCFullYear();
    await this.ensure(rootId);
    const db = tx ?? this.prisma;
    if (cfg.numbering.reset === 'Yearly')
      await db.ctSettings.updateMany({
        where: { businessId: rootId, ctrYear: { lt: year } },
        data: { ctrYear: year, nextCtr: 1 },
      });
    const s = await db.ctSettings.update({
      where: { businessId: rootId },
      data: { nextCtr: { increment: 1 } },
    });
    return ctrNumber(cfg.numbering.ctrPattern, year, s.nextCtr - 1);
  }

  async previewContractNumber(rootId: string) {
    const s = await this.ensure(rootId);
    const cfg = mergeCtConfig(s.config);
    const year = new Date().getUTCFullYear();
    return ctrNumber(
      cfg.numbering.ctrPattern,
      year,
      cfg.numbering.reset === 'Yearly' && s.ctrYear < year ? 1 : s.nextCtr,
    );
  }

  // ── people & counterparties ───────────────────────────────────────────

  async members(rootId: string) {
    const group = await this.branches(rootId);
    const rows = await this.prisma.businessUser.findMany({
      where: { businessId: { in: group.map((g) => g.id) }, active: true },
      include: {
        user: { select: { id: true, name: true, email: true } },
        customRole: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const seen = new Map<
      string,
      {
        id: string;
        buId: string;
        name: string;
        email: string | null;
        role: Role;
        label: string;
        businessId: string;
        customRoleId: string | null;
      }
    >();
    for (const r of rows)
      if (!seen.has(r.userId))
        seen.set(r.userId, {
          id: r.userId,
          buId: r.id,
          name: r.user.name,
          email: r.user.email,
          role: r.role,
          label:
            r.customRole?.name ??
            (r.role === Role.owner
              ? 'Owner'
              : r.role === Role.manager
                ? 'Manager'
                : 'Staff'),
          businessId: r.businessId,
          customRoleId: r.customRoleId,
        });
    return [...seen.values()];
  }

  /** Canonical counterparties: CRM customers, suppliers and staff (references only — never copied). */
  async parties(rootId: string): Promise<Party[]> {
    const group = (await this.branches(rootId)).map((g) => g.id);
    const [cus, sup, staff] = await Promise.all([
      this.prisma.customer.findMany({
        where: { businessId: { in: group } },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          businessId: true,
        },
        orderBy: { name: 'asc' },
        take: 2000,
      }),
      this.prisma.supplier.findMany({
        where: { businessId: { in: group } },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          address: true,
          businessId: true,
        },
        orderBy: { name: 'asc' },
      }),
      this.members(rootId),
    ]);
    return [
      ...cus.map((c) => ({
        kind: 'customer' as const,
        id: c.id,
        name: c.name,
        module: 'Customers CRM',
        type: 'Customer',
        email: c.email,
        phone: c.phone,
        address: c.address,
        businessId: c.businessId,
      })),
      ...sup.map((s) => ({
        kind: 'supplier' as const,
        id: s.id,
        name: s.name,
        module: 'Suppliers',
        type: 'Supplier',
        email: s.email,
        phone: s.phone,
        address: s.address,
        businessId: s.businessId,
      })),
      ...staff.map((m) => ({
        kind: 'staff' as const,
        id: m.id,
        name: m.name,
        module: 'People & Payroll',
        type: 'Employee',
        email: m.email,
        phone: null,
        address: null,
        businessId: m.businessId,
      })),
    ];
  }

  /** Records a document can link to, per module (canonical references — the label is read live). */
  async linkTargets(
    rootId: string,
  ): Promise<{ module: string; id: string; label: string }[]> {
    const group = await this.branches(rootId);
    const gids = group.map((g) => g.id);
    const [parties, assets, projects, agreements, bills] = await Promise.all([
      this.parties(rootId),
      this.prisma.amAsset.findMany({
        where: { businessId: rootId },
        select: { id: true, number: true, name: true },
        orderBy: { number: 'asc' },
        take: 2000,
      }),
      this.prisma.project.findMany({
        where: { businessId: { in: gids } },
        select: { id: true, number: true, name: true },
        orderBy: { number: 'asc' },
        take: 2000,
      }),
      this.prisma.fsAgreement.findMany({
        where: { businessId: rootId },
        select: { id: true, number: true, visits: true, freq: true },
        orderBy: { number: 'asc' },
        take: 2000,
      }),
      this.prisma.finBill.findMany({
        where: { businessId: { in: gids } },
        select: { id: true, number: true, vendorName: true },
        orderBy: { number: 'desc' },
        take: 2000,
      }),
    ]);
    return [
      ...parties.map((p) => ({
        module: p.module,
        id: `${p.kind}:${p.id}`,
        label: p.name,
      })),
      ...assets.map((x) => ({
        module: 'Assets & Maintenance',
        id: x.id,
        label: `${x.number} · ${x.name}`,
      })),
      ...projects.map((x) => ({
        module: 'Projects & Tasks',
        id: x.id,
        label: `${x.number} · ${x.name}`,
      })),
      ...group.map((g) => ({ module: 'Branches', id: g.id, label: g.name })),
      ...agreements.map((x) => ({
        module: 'Field Service',
        id: x.id,
        label: `${x.number} · ${x.visits} visits · ${x.freq}`,
      })),
      ...bills.map((x) => ({
        module: 'Finance & Accounting',
        id: x.id,
        label: `${x.number} · ${x.vendorName}`,
      })),
    ];
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
    a: CtActor | 'System' | { name: string },
    action: string,
    entityType: string,
    entityId: string,
    detail: string,
    o?: { corr?: string; tx?: Tx },
  ) {
    const db = o?.tx ?? this.prisma;
    const isActor = typeof a === 'object' && 'userId' in a;
    await db.ctAudit.create({
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
    const prev = await this.prisma.ctIdem.findUnique({
      where: { businessId_key: { businessId: rootId, key: k } },
    });
    if (prev?.status === 'done') return prev.result as T;
    if (
      prev?.status === 'in_flight' &&
      Date.now() - prev.updatedAt.getTime() < 60_000
    )
      throw ctErr(
        CT_ERRORS.DUPLICATE,
        `DUPLICATE_OPERATION — already in progress (${k}).`,
        HttpStatus.CONFLICT,
      );
    if (prev)
      await this.prisma.ctIdem.update({
        where: { id: prev.id },
        data: { status: 'in_flight' },
      });
    else
      try {
        await this.prisma.ctIdem.create({
          data: { businessId: rootId, key: k, status: 'in_flight' },
        });
      } catch {
        throw ctErr(
          CT_ERRORS.DUPLICATE,
          `DUPLICATE_OPERATION — already in progress (${k}).`,
          HttpStatus.CONFLICT,
        );
      }
    try {
      const r = await fn();
      await this.prisma.ctIdem.update({
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
      await this.prisma.ctIdem
        .update({
          where: { businessId_key: { businessId: rootId, key: k } },
          data: { status: 'failed' },
        })
        .catch(() => null);
      throw e;
    }
  }
}
