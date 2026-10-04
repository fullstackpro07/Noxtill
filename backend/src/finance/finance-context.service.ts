import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { FinAccount, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  COA_TEMPLATE,
  LATE_SYSTEM_KEYS,
  FIN_ERRORS,
  FinanceConfig,
  MONTHS,
  defaultConfig,
  mergeConfig,
} from './finance.constants';

export type FinTitle =
  'Owner/Controller' | 'Finance Manager' | 'Preparer' | 'Read only';

export interface FinActor {
  userId: string;
  name: string;
  role: 'Owner' | 'Manager' | 'Staff';
  title: FinTitle;
  view: boolean;
  manage: boolean;
  approve: boolean;
  admin: boolean;
  /** Group root business id: the ledger. */
  rootId: string;
  businessId: string;
  /** An outside accountant's grant limited to these branches; null = whole group. */
  scopeBranches: string[] | null;
}

/** The posting engine acts as this when nobody clicked anything (sweep, depreciation job). */
export const SYSTEM_ACTOR = 'System';

export interface Branch {
  id: string;
  name: string;
  currency: string;
}

export type Tx = Prisma.TransactionClient;

/** Upper bound for "balance as of now" queries (a valid MySQL DATE). */
export const FAR_FUTURE = new Date(Date.UTC(9999, 11, 31));

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const num = (d: Prisma.Decimal | number | string | null | undefined) =>
  d == null ? 0 : Number(d);

/** A calendar date (no time) as UTC midnight — every `@db.Date` column is written this way. */
export function dayOf(d: Date | string): Date {
  const x = typeof d === 'string' ? new Date(d) : d;
  return new Date(
    Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()),
  );
}
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function monthKey(d: Date) {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
export function monthStart(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1));
}
export function monthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0));
}
export function monthLabel(year: number, month: number) {
  return `${MONTHS[month - 1]} ${year}`;
}

/**
 * Shared plumbing for every Finance service: which ledger a request belongs to (the business
 * group's root), who the person is in accounting terms, the seeded chart of accounts, numbering,
 * periods, exchange rates and the Finance audit trail.
 */
@Injectable()
export class FinanceContextService {
  private readonly logger = new Logger(FinanceContextService.name);

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
        FIN_ERRORS.NOT_FOUND,
        'Business not found',
        HttpStatus.NOT_FOUND,
      );
    return b.parentId ?? b.id;
  }

  async branches(rootId: string): Promise<Branch[]> {
    const rows = await this.prisma.business.findMany({
      where: { OR: [{ id: rootId }, { parentId: rootId }] },
      select: { id: true, name: true, parentId: true, currency: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows
      .sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0))
      .map((r) => ({ id: r.id, name: r.name, currency: r.currency }));
  }

  async business(rootId: string) {
    return this.prisma.business.findUniqueOrThrow({
      where: { id: rootId },
      select: {
        id: true,
        name: true,
        currency: true,
        timezone: true,
        taxLabel: true,
        taxRate: true,
        taxFilingDay: true,
        country: true,
      },
    });
  }

  async baseCurrency(rootId: string): Promise<string> {
    return (await this.business(rootId)).currency;
  }

  // ── people & permissions ─────────────────────────────────────────────────

  async actor(user: AuthenticatedUser): Promise<FinActor> {
    const rootId = await this.rootOf(user.businessId);
    const groupIds = (await this.branches(rootId)).map((b) => b.id);
    const memberships = await this.prisma.businessUser.findMany({
      where: { userId: user.sub, active: true, businessId: { in: groupIds } },
      include: { user: { select: { name: true } } },
    });
    const here =
      memberships.find((m) => m.businessId === user.businessId) ??
      memberships[0];
    if (!here)
      throw new AppException(
        FIN_ERRORS.FORBIDDEN,
        'You are not a member of this business.',
        HttpStatus.FORBIDDEN,
      );
    const role = user.role ?? here.role;
    let view = true;
    let manage = true;
    let approve = true;
    let admin = true;
    if (role !== Role.owner) {
      const caps = (await this.caps.resolve({
        businessId: here.businessId,
        role: here.role,
        customRoleId: here.customRoleId,
      })) as string[];
      admin = caps.includes(CAPABILITIES.FINANCE_ADMIN);
      approve = admin || caps.includes(CAPABILITIES.FINANCE_APPROVE);
      manage = approve || caps.includes(CAPABILITIES.FINANCE_MANAGE);
      view = manage || caps.includes(CAPABILITIES.FINANCE_VIEW);
    }
    if (!view)
      throw new AppException(
        FIN_ERRORS.FORBIDDEN,
        'Your role doesn’t include Finance & Accounting. Ask an Owner to grant “finance.view” in Staff › Roles.',
        HttpStatus.FORBIDDEN,
      );
    const grant = await this.prisma.finAccessGrant.findFirst({
      where: {
        businessId: rootId,
        userId: user.sub,
        status: { in: ['Invited', 'Active'] },
      },
    });
    if (grant && grant.status === 'Invited')
      await this.prisma.finAccessGrant.update({
        where: { id: grant.id },
        data: { status: 'Active', lastSeenAt: new Date() },
      });
    else if (grant)
      await this.prisma.finAccessGrant.update({
        where: { id: grant.id },
        data: { lastSeenAt: new Date() },
      });
    const gb = grant ? ((grant.branches as string[] | null) ?? []) : [];
    return {
      scopeBranches: role !== Role.owner && gb.length ? gb : null,
      userId: user.sub,
      name: here.user.name,
      role:
        role === Role.owner
          ? 'Owner'
          : role === Role.manager
            ? 'Manager'
            : 'Staff',
      title: admin
        ? 'Owner/Controller'
        : approve
          ? 'Finance Manager'
          : manage
            ? 'Preparer'
            : 'Read only',
      view,
      manage,
      approve,
      admin,
      rootId,
      businessId: user.businessId,
    };
  }

  need(
    actor: FinActor,
    level: 'manage' | 'approve' | 'admin',
    what: string,
  ): void {
    if (actor[level]) return;
    const label = {
      manage: 'prepare entries (finance.manage)',
      approve: 'approve (finance.approve)',
      admin: 'act as Owner/Controller (finance.admin)',
    }[level];
    throw new AppException(
      FIN_ERRORS.FORBIDDEN,
      `${what} needs permission to ${label}, which your role doesn’t have.`,
      HttpStatus.FORBIDDEN,
    );
  }

  async userNames(ids: (string | null | undefined)[]) {
    const uniq = [
      ...new Set(ids.filter((x): x is string => !!x && x !== SYSTEM_ACTOR)),
    ];
    if (!uniq.length) return new Map<string, string>();
    const rows = await this.prisma.user.findMany({
      where: { id: { in: uniq } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** Owners (and finance admins) across the group: who gets approval notifications. */
  async approvers(rootId: string, level: 'approve' | 'admin') {
    const groupIds = (await this.branches(rootId)).map((b) => b.id);
    const members = await this.prisma.businessUser.findMany({
      where: { businessId: { in: groupIds }, active: true },
      select: {
        userId: true,
        businessId: true,
        role: true,
        customRoleId: true,
      },
    });
    const out: { userId: string; businessId: string }[] = [];
    const seen = new Set<string>();
    for (const m of members) {
      if (seen.has(m.userId)) continue;
      let ok = m.role === Role.owner;
      if (!ok) {
        const caps = (await this.caps.resolve(m)) as string[];
        ok =
          caps.includes(CAPABILITIES.FINANCE_ADMIN) ||
          (level === 'approve' && caps.includes(CAPABILITIES.FINANCE_APPROVE));
      }
      if (ok) {
        seen.add(m.userId);
        out.push({ userId: m.userId, businessId: m.businessId });
      }
    }
    return out;
  }

  async notify(
    rootId: string,
    level: 'approve' | 'admin',
    title: string,
    body: string,
    link: string,
    exceptUserId?: string,
  ) {
    for (const a of await this.approvers(rootId, level)) {
      if (a.userId === exceptUserId) continue;
      await this.prisma.notification
        .create({
          data: {
            businessId: a.businessId,
            userId: a.userId,
            title,
            body,
            link,
          },
        })
        .catch((e: Error) =>
          this.logger.warn(`finance notification failed: ${e.message}`),
        );
    }
  }

  // ── settings, seeding, numbering ─────────────────────────────────────────

  /** The ledger's settings row; first use seeds the chart of accounts, tax codes and periods. */
  async settingsRow(rootId: string) {
    const existing = await this.prisma.finSettings.findUnique({
      where: { businessId: rootId },
    });
    if (existing) return existing;
    const biz = await this.business(rootId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.finSettings.create({
          data: {
            businessId: rootId,
            config: defaultConfig() as unknown as Prisma.InputJsonValue,
          },
        });
        if (!(await tx.finAccount.count({ where: { businessId: rootId } }))) {
          const ids = new Map<string, string>();
          for (const [
            code,
            name0,
            type,
            subtype,
            parent,
            control,
            key,
            rec,
            header,
          ] of COA_TEMPLATE) {
            const name =
              key === 'output_tax' ? `${biz.taxLabel || 'Tax'} Payable` : name0;
            const a = await tx.finAccount.create({
              data: {
                businessId: rootId,
                code,
                name,
                type,
                subtype,
                parentId: parent ? (ids.get(parent) ?? null) : null,
                control,
                systemKey: key,
                reconcilable: rec,
                isHeader: header,
              },
            });
            ids.set(code, a.id);
          }
          const label = biz.taxLabel || 'Tax';
          const rate = num(biz.taxRate);
          await tx.finTaxCode.createMany({
            data: [
              {
                businessId: rootId,
                code: 'OUT',
                name: `${label} ${rate}% (sales)`,
                rate,
                kind: 'output',
                accountId: ids.get('2200')!,
              },
              {
                businessId: rootId,
                code: 'IN',
                name: `${label} ${rate}% (purchases)`,
                rate,
                kind: 'input',
                accountId: ids.get('2210')!,
              },
              {
                businessId: rootId,
                code: 'EXEMPT',
                name: 'Exempt / no tax',
                rate: 0,
                kind: 'input',
                accountId: ids.get('2210')!,
              },
            ],
          });
        }
        return row;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        return this.prisma.finSettings.findUniqueOrThrow({
          where: { businessId: rootId },
        });
      throw e;
    }
  }

  async config(rootId: string): Promise<FinanceConfig> {
    return mergeConfig((await this.settingsRow(rootId)).config);
  }

  async nextNumber(
    tx: Tx,
    rootId: string,
    kind: 'journal' | 'bill' | 'asset' | 'tax',
    year: number,
  ): Promise<string> {
    const field = {
      journal: 'journalSeq',
      bill: 'billSeq',
      asset: 'assetSeq',
      tax: 'taxSeq',
    }[kind] as 'journalSeq';
    const row = await tx.finSettings.update({
      where: { businessId: rootId },
      data: { [field]: { increment: 1 } },
    });
    const n = row[field];
    if (kind === 'journal') return `JE-${year}-${String(n).padStart(5, '0')}`;
    if (kind === 'bill') return `BILL-${String(n).padStart(4, '0')}`;
    if (kind === 'asset') return `FA-${String(n).padStart(3, '0')}`;
    return `TX-${year}-${String(n).padStart(3, '0')}`;
  }

  // ── accounts ─────────────────────────────────────────────────────────────

  async accounts(rootId: string): Promise<FinAccount[]> {
    await this.settingsRow(rootId);
    return this.prisma.finAccount.findMany({
      where: { businessId: rootId },
      orderBy: { code: 'asc' },
    });
  }

  /** Adds system accounts introduced after this ledger was seeded (e.g. Repairs & Maintenance). */
  private async ensureLateAccounts(rootId: string, all: FinAccount[]) {
    const missing = COA_TEMPLATE.filter(
      (t) =>
        t[6] &&
        LATE_SYSTEM_KEYS.includes(t[6]) &&
        !all.some((a) => a.systemKey === t[6]),
    );
    if (!missing.length) return false;
    for (const [
      code,
      name,
      type,
      subtype,
      parent,
      control,
      key,
      rec,
      header,
    ] of missing) {
      let c = code;
      while (all.some((a) => a.code === c)) c = String(Number(c) + 1);
      const par = parent ? all.find((a) => a.code === parent) : null;
      await this.prisma.finAccount
        .create({
          data: {
            businessId: rootId,
            code: c,
            name,
            type,
            subtype,
            parentId: par?.id ?? null,
            control,
            systemKey: key,
            reconcilable: rec,
            isHeader: header,
          },
        })
        .catch(() => null);
    }
    return true;
  }

  async accountMaps(rootId: string) {
    let all = await this.accounts(rootId);
    if (await this.ensureLateAccounts(rootId, all))
      all = await this.accounts(rootId);
    return {
      all,
      byId: new Map(all.map((a) => [a.id, a])),
      byCode: new Map(all.map((a) => [a.code, a])),
      byKey: new Map(
        all.filter((a) => a.systemKey).map((a) => [a.systemKey!, a]),
      ),
    };
  }

  // ── periods ──────────────────────────────────────────────────────────────

  async period(rootId: string, year: number, month: number, tx?: Tx) {
    const db = tx ?? this.prisma;
    const found = await db.finPeriod.findUnique({
      where: { businessId_year_month: { businessId: rootId, year, month } },
    });
    if (found) return found;
    try {
      return await db.finPeriod.create({
        data: { businessId: rootId, year, month, status: 'open' },
      });
    } catch {
      return db.finPeriod.findUniqueOrThrow({
        where: { businessId_year_month: { businessId: rootId, year, month } },
      });
    }
  }

  /** The earliest month on or after `from` that is not locked (system postings land there). */
  async firstOpenFrom(rootId: string, from: Date, tx?: Tx) {
    let { year, month } = monthKey(from);
    for (let i = 0; i < 240; i++) {
      const p = await this.period(rootId, year, month, tx);
      if (p.status !== 'locked') return p;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    throw new AppException(
      FIN_ERRORS.PERIOD_LOCKED,
      'No open period found.',
      HttpStatus.CONFLICT,
    );
  }

  // ── exchange rates ───────────────────────────────────────────────────────

  async rateOn(
    rootId: string,
    currency: string,
    on: Date,
    base?: string,
  ): Promise<number | null> {
    const b = base ?? (await this.baseCurrency(rootId));
    if (!currency || currency === b) return 1;
    const row = await this.prisma.finExchangeRate.findFirst({
      where: { businessId: rootId, currency, effectiveOn: { lte: dayOf(on) } },
      orderBy: { effectiveOn: 'desc' },
    });
    return row ? Number(row.rate) : null;
  }

  async mustRate(rootId: string, currency: string, on: Date): Promise<number> {
    const r = await this.rateOn(rootId, currency, on);
    if (r == null)
      throw new AppException(
        FIN_ERRORS.FX_MISSING,
        `No exchange rate for ${currency} on or before ${ymd(dayOf(on))}. Add one in Finance › Settings › Exchange rates.`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    return r;
  }

  // ── audit ────────────────────────────────────────────────────────────────

  async audit(
    rootId: string,
    actor: FinActor | null,
    action: string,
    subjectType: string,
    subjectId: string,
    detail?: string,
    tx?: Tx,
  ) {
    await (tx ?? this.prisma).finAudit.create({
      data: {
        businessId: rootId,
        actorId: actor?.userId ?? null,
        actorName: actor?.name ?? SYSTEM_ACTOR,
        action,
        subjectType,
        subjectId,
        detail: detail ?? null,
      },
    });
  }
}
