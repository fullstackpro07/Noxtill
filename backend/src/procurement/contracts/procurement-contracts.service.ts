import { HttpStatus, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import {
  Prisma,
  ProcurementContractStatus,
  ProcurementSupplierContract,
  PurchaseOrderStatus,
  Role,
} from '@prisma/client';
import { AppException } from '../../common/filters/app.exception';
import { resolvePolicies } from '../../common/policies/policies.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

export const CONTRACT_ERRORS = {
  INVALID: 'PROCUREMENT_CONTRACT_INVALID',
  NOT_FOUND: 'PROCUREMENT_CONTRACT_NOT_FOUND',
  CONFLICT: 'PROCUREMENT_CONTRACT_CONFLICT',
} as const;

export type EffectiveContractStatus =
  | 'draft'
  | 'active'
  | 'renewal_due'
  | 'renewal_unconfirmed'
  | 'expired'
  | 'terminated';

export interface DiscountTier {
  minQty: number | null;
  minSpend: number | null;
  percent: number;
}

/** Fields that make up a contract's operational terms (versioned together). */
export interface ContractTermsInput {
  title?: string;
  documentUrl?: string | null;
  effectiveFrom?: string;
  expiresAt?: string | null;
  autoRenew?: boolean;
  noticeDays?: number | null;
  currency?: string;
  paymentTerms?: string | null;
  discountTiers?: unknown;
  priceValidUntil?: string | null;
  minimumOrderQty?: number | null;
  sla?: string | null;
  deliveryTerms?: string | null;
  incoterms?: string | null;
  warranty?: string | null;
  complianceRequirements?: string[];
  categories?: string[];
  ownerUserId?: string | null;
}

const TERM_KEYS = [
  'title',
  'documentUrl',
  'effectiveFrom',
  'expiresAt',
  'autoRenew',
  'noticeDays',
  'currency',
  'paymentTerms',
  'discountTiers',
  'priceValidUntil',
  'minimumOrderQty',
  'sla',
  'deliveryTerms',
  'incoterms',
  'warranty',
  'complianceRequirements',
  'categories',
] as const;

const DAY = 86_400_000;

function bad(message: string): never {
  throw new AppException(
    CONTRACT_ERRORS.INVALID,
    message,
    HttpStatus.BAD_REQUEST,
  );
}

function startOfUtcDay(d: Date) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function dateOnly(
  value: string | null | undefined,
  label: string,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    bad(`${label} must be a date (YYYY-MM-DD).`);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) bad(`${label} is not a valid date.`);
  return d;
}

function iso(d: Date | null) {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** The date a renewal decision must be made by (expiry minus the notice period). */
export function noticeDeadline(
  c: Pick<ProcurementSupplierContract, 'expiresAt' | 'noticeDays'>,
) {
  return c.expiresAt
    ? new Date(c.expiresAt.getTime() - (c.noticeDays ?? 0) * DAY)
    : null;
}

export function effectiveStatus(
  c: Pick<
    ProcurementSupplierContract,
    'status' | 'expiresAt' | 'autoRenew' | 'noticeDays'
  >,
  alertLeadDays: number,
  today = startOfUtcDay(new Date()),
): EffectiveContractStatus {
  if (c.status === ProcurementContractStatus.draft) return 'draft';
  if (c.status === ProcurementContractStatus.terminated) return 'terminated';
  if (c.expiresAt && c.expiresAt < today)
    return c.autoRenew ? 'renewal_unconfirmed' : 'expired';
  const deadline = noticeDeadline(c);
  if (deadline && today.getTime() >= deadline.getTime() - alertLeadDays * DAY)
    return 'renewal_due';
  return 'active';
}

/**
 * Supplier Contracts & Terms. Supplier identity stays in Products → Suppliers; purchase orders stay
 * in Inventory → Purchases. This service stores procurement metadata about agreements and measures
 * purchase-order spend against them. Spend figures are purchase-order commitments (qty × unit cost),
 * not billed or paid amounts: there is no Finance/AP module to read bills from.
 */
@Injectable()
export class ProcurementContractsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly cls: ClsService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  private async alertLeadDays(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    return (
      resolvePolicies(business).num('procurement.contractRenewalAlertDays') ??
      30
    );
  }

  private normalizeTerms(input: ContractTermsInput) {
    const data: Prisma.ProcurementSupplierContractUncheckedUpdateInput = {};
    const text = (v: string | null | undefined, max: number, label: string) => {
      if (v === undefined) return undefined;
      const t = (v ?? '').trim();
      if (t.length > max) bad(`${label} is longer than ${max} characters.`);
      return t || null;
    };
    if (input.title !== undefined) {
      const t = input.title.trim();
      if (!t || t.length > 200) bad('Title must be 1–200 characters.');
      data.title = t;
    }
    if (input.documentUrl !== undefined) {
      const url = text(input.documentUrl, 1000, 'Document link');
      if (url) {
        try {
          const u = new URL(url);
          if (u.protocol !== 'https:' && u.protocol !== 'http:')
            throw new Error();
        } catch {
          bad('Document link must be a web address (https://…).');
        }
      }
      data.documentUrl = url;
    }
    const from = dateOnly(input.effectiveFrom, 'Effective date');
    if (from === null) bad('Effective date is required.');
    if (from) data.effectiveFrom = from;
    const to = dateOnly(input.expiresAt, 'Expiry date');
    if (to !== undefined) data.expiresAt = to;
    if (input.autoRenew !== undefined) data.autoRenew = input.autoRenew;
    if (input.noticeDays !== undefined) {
      if (
        input.noticeDays !== null &&
        (!Number.isInteger(input.noticeDays) ||
          input.noticeDays < 0 ||
          input.noticeDays > 730)
      ) {
        bad('Notice period must be 0–730 days.');
      }
      data.noticeDays = input.noticeDays;
    }
    if (input.currency !== undefined) {
      if (!/^[A-Z]{3}$/.test(input.currency))
        bad('Currency must be a 3-letter code like USD.');
      data.currency = input.currency;
    }
    if (input.paymentTerms !== undefined)
      data.paymentTerms = text(input.paymentTerms, 200, 'Payment terms');
    if (input.discountTiers !== undefined) {
      if (
        !Array.isArray(input.discountTiers) ||
        input.discountTiers.length > 20
      )
        bad('Discount tiers must be a list of up to 20.');
      data.discountTiers = (
        input.discountTiers as Record<string, unknown>[]
      ).map((t, i) => {
        const percent = Number(t?.percent);
        const minQty =
          t?.minQty === null || t?.minQty === undefined || t?.minQty === ''
            ? null
            : Number(t.minQty);
        const minSpend =
          t?.minSpend === null ||
          t?.minSpend === undefined ||
          t?.minSpend === ''
            ? null
            : Number(t.minSpend);
        if (!Number.isFinite(percent) || percent <= 0 || percent > 100)
          bad(
            `Discount tier ${i + 1}: percent must be above 0 and at most 100.`,
          );
        if (minQty === null && minSpend === null)
          bad(
            `Discount tier ${i + 1}: set a minimum quantity or minimum spend.`,
          );
        if (
          (minQty !== null && (!Number.isFinite(minQty) || minQty < 0)) ||
          (minSpend !== null && (!Number.isFinite(minSpend) || minSpend < 0))
        ) {
          bad(`Discount tier ${i + 1}: minimums must be positive numbers.`);
        }
        return { minQty, minSpend, percent } satisfies DiscountTier;
      });
    }
    const pv = dateOnly(input.priceValidUntil, 'Price valid until');
    if (pv !== undefined) data.priceValidUntil = pv;
    if (input.minimumOrderQty !== undefined) {
      if (
        input.minimumOrderQty !== null &&
        (!Number.isInteger(input.minimumOrderQty) || input.minimumOrderQty < 1)
      )
        bad('MOQ must be a whole number of at least 1.');
      data.minimumOrderQty = input.minimumOrderQty;
    }
    if (input.sla !== undefined) data.sla = text(input.sla, 2000, 'SLA');
    if (input.deliveryTerms !== undefined)
      data.deliveryTerms = text(input.deliveryTerms, 300, 'Delivery terms');
    if (input.incoterms !== undefined)
      data.incoterms = text(input.incoterms, 20, 'Incoterms');
    if (input.warranty !== undefined)
      data.warranty = text(input.warranty, 300, 'Warranty');
    const list = (v: string[] | undefined, label: string) => {
      if (v === undefined) return undefined;
      if (v.length > 30) bad(`${label} can have at most 30 entries.`);
      return [
        ...new Set(
          v
            .map((x) => x.trim())
            .filter(Boolean)
            .map((x) => x.slice(0, 120)),
        ),
      ];
    };
    const compliance = list(
      input.complianceRequirements,
      'Compliance requirements',
    );
    if (compliance) data.complianceRequirements = compliance;
    const categories = list(input.categories, 'Categories');
    if (categories) data.categories = categories;
    return data;
  }

  private async validateOwner(
    businessId: string,
    ownerUserId: string | null | undefined,
  ) {
    if (!ownerUserId) return;
    const member = await this.db.businessUser.findFirst({
      where: { businessId, userId: ownerUserId, active: true },
      select: { id: true },
    });
    if (!member) bad('The contract owner must be an active team member.');
  }

  private snapshot(c: ProcurementSupplierContract) {
    const out: Record<string, unknown> = {};
    for (const key of TERM_KEYS) {
      const v = c[key];
      out[key] = v instanceof Date ? iso(v) : v;
    }
    out.ownerUserId = c.ownerUserId;
    return out;
  }

  async create(
    businessId: string,
    actorUserId: string,
    input: ContractTermsInput & { supplierId: string; reference: string },
  ) {
    const supplier = await this.db.supplier.findFirst({
      where: { id: input.supplierId, businessId },
      select: { id: true },
    });
    if (!supplier) bad('Choose a supplier from Products → Suppliers.');
    const reference = input.reference.trim();
    if (!reference || reference.length > 80)
      bad('Contract reference must be 1–80 characters.');
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { currency: true },
    });
    const data = this.normalizeTerms({ currency: business.currency, ...input });
    if (!data.title) bad('Title is required.');
    if (!data.effectiveFrom) bad('Effective date is required.');
    if (
      data.expiresAt &&
      data.effectiveFrom &&
      (data.expiresAt as Date) <= (data.effectiveFrom as Date)
    )
      bad('Expiry must be after the effective date.');
    await this.validateOwner(businessId, input.ownerUserId);
    try {
      return await this.db.$transaction(async (tx) => {
        const contract = await tx.procurementSupplierContract.create({
          data: {
            ...(data as Prisma.ProcurementSupplierContractUncheckedCreateInput),
            businessId,
            supplierId: supplier.id,
            reference,
            ownerUserId: input.ownerUserId ?? null,
            createdByUserId: actorUserId,
          },
        });
        await tx.procurementSupplierContractVersion.create({
          data: {
            businessId,
            contractId: contract.id,
            version: 1,
            terms: this.snapshot(contract) as Prisma.InputJsonValue,
            reason: 'Created',
            actorUserId,
          },
        });
        return contract;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          CONTRACT_ERRORS.CONFLICT,
          'Another contract already uses that reference.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  private async find(businessId: string, id: string) {
    const contract = await this.db.procurementSupplierContract.findFirst({
      where: { id, businessId },
    });
    if (!contract)
      throw new AppException(
        CONTRACT_ERRORS.NOT_FOUND,
        'Contract not found.',
        HttpStatus.NOT_FOUND,
      );
    return contract;
  }

  /** Records new terms as a new version. Changed terms must be confirmed again before they count. */
  async updateTerms(
    businessId: string,
    actorUserId: string,
    id: string,
    input: ContractTermsInput & { reason?: string },
  ) {
    const contract = await this.find(businessId, id);
    if (contract.status === ProcurementContractStatus.terminated) {
      throw new AppException(
        CONTRACT_ERRORS.CONFLICT,
        'A terminated contract cannot be changed.',
        HttpStatus.CONFLICT,
      );
    }
    const data = this.normalizeTerms(input);
    if (input.ownerUserId !== undefined) {
      await this.validateOwner(businessId, input.ownerUserId);
      data.ownerUserId = input.ownerUserId;
    }
    const from =
      (data.effectiveFrom as Date | undefined) ?? contract.effectiveFrom;
    const to =
      data.expiresAt === undefined
        ? contract.expiresAt
        : (data.expiresAt as Date | null);
    if (to && to <= from) bad('Expiry must be after the effective date.');
    const termsChanged = TERM_KEYS.some(
      (k) =>
        k in data &&
        JSON.stringify(
          this.snapshot({
            ...contract,
            ...data,
          } as ProcurementSupplierContract)[k],
        ) !== JSON.stringify(this.snapshot(contract)[k]),
    );
    return this.db.$transaction(async (tx) => {
      const updated = await tx.procurementSupplierContract.update({
        where: { id: contract.id },
        data: {
          ...data,
          ...(termsChanged
            ? {
                version: contract.version + 1,
                termsConfirmedAt: null,
                termsConfirmedByUserId: null,
              }
            : {}),
          // A new expiry date starts a new renewal cycle.
          ...(to?.getTime() !== contract.expiresAt?.getTime()
            ? { renewalAlertedFor: null }
            : {}),
        },
      });
      if (termsChanged) {
        await tx.procurementSupplierContractVersion.create({
          data: {
            businessId,
            contractId: contract.id,
            version: updated.version,
            terms: this.snapshot(updated) as Prisma.InputJsonValue,
            reason: input.reason?.slice(0, 300) || 'Terms updated',
            actorUserId,
          },
        });
      }
      return updated;
    });
  }

  /** Someone checked the recorded terms against the source document. */
  async confirmTerms(businessId: string, actorUserId: string, id: string) {
    const contract = await this.find(businessId, id);
    if (!contract.documentUrl)
      bad('Link the source contract document before confirming its terms.');
    return this.db.procurementSupplierContract.update({
      where: { id: contract.id },
      data: {
        termsConfirmedAt: new Date(),
        termsConfirmedByUserId: actorUserId,
      },
    });
  }

  async setStatus(
    businessId: string,
    actorUserId: string,
    id: string,
    status: ProcurementContractStatus,
    reason?: string,
  ) {
    const contract = await this.find(businessId, id);
    if (contract.status === status) return contract;
    if (contract.status === ProcurementContractStatus.terminated) {
      throw new AppException(
        CONTRACT_ERRORS.CONFLICT,
        'A terminated contract cannot be reopened. Create a new one.',
        HttpStatus.CONFLICT,
      );
    }
    if (status === ProcurementContractStatus.draft)
      bad('A contract cannot go back to draft.');
    if (status === ProcurementContractStatus.terminated && !reason?.trim())
      bad('Give a reason for terminating the contract.');
    return this.db.$transaction(async (tx) => {
      const updated = await tx.procurementSupplierContract.update({
        where: { id: contract.id },
        data: { status },
      });
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action: `procurement.contract.${status === 'active' ? 'activated' : 'terminated'}`,
          entity: 'procurement_contract',
          entityId: contract.id,
          before: { status: contract.status },
          after: { status, reason: reason?.slice(0, 300) ?? null },
        },
      });
      return updated;
    });
  }

  async versions(businessId: string, id: string) {
    await this.find(businessId, id);
    const [rows, statusEvents] = await Promise.all([
      this.db.procurementSupplierContractVersion.findMany({
        where: { contractId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
      this.db.auditLog.findMany({
        where: { businessId, entity: 'procurement_contract', entityId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const names = await this.userNames([
      ...rows.map((r) => r.actorUserId),
      ...statusEvents.map((e) => e.actorUserId),
    ]);
    return [
      ...rows.map((r) => ({
        kind: 'terms' as const,
        id: r.id,
        version: r.version,
        terms: r.terms,
        reason: r.reason,
        createdAt: r.createdAt,
        actorName: r.actorUserId ? (names.get(r.actorUserId) ?? null) : null,
      })),
      ...statusEvents.map((e) => {
        const after = (e.after ?? {}) as {
          status?: string;
          reason?: string | null;
        };
        return {
          kind: 'status' as const,
          id: e.id,
          version: null,
          terms: null,
          reason: `${after.status === 'active' ? 'Activated' : 'Terminated'}${after.reason ? `: ${after.reason}` : ''}`,
          createdAt: e.createdAt,
          actorName: e.actorUserId ? (names.get(e.actorUserId) ?? null) : null,
        };
      }),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  private async userNames(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map<string, string>();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  /**
   * Purchase-order commitments per supplier with each PO's date, used to measure spend under and
   * outside contracts. Cancelled POs are excluded.
   */
  private async purchaseOrders(businessId: string, supplierIds?: string[]) {
    const pos = await this.db.purchaseOrder.findMany({
      where: {
        businessId,
        status: { not: PurchaseOrderStatus.cancelled },
        ...(supplierIds ? { supplierId: { in: supplierIds } } : {}),
      },
      select: {
        id: true,
        supplierId: true,
        createdAt: true,
        items: { select: { qtyOrdered: true, unitCost: true } },
      },
    });
    return pos.map((po) => ({
      id: po.id,
      supplierId: po.supplierId,
      createdAt: po.createdAt,
      value: po.items.reduce(
        (s, i) => s + i.qtyOrdered * Number(i.unitCost),
        0,
      ),
    }));
  }

  private covers(c: ProcurementSupplierContract, at: Date) {
    if (c.status === ProcurementContractStatus.draft) return false;
    const day = startOfUtcDay(at);
    return c.effectiveFrom <= day && (!c.expiresAt || c.expiresAt >= day);
  }

  async list(businessId: string) {
    const lead = await this.alertLeadDays(businessId);
    const today = startOfUtcDay(new Date());
    const [contracts, business] = await Promise.all([
      this.db.procurementSupplierContract.findMany({
        where: { businessId },
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: [{ expiresAt: 'asc' }, { reference: 'asc' }],
      }),
      this.prisma.business.findUniqueOrThrow({
        where: { id: businessId },
        select: { currency: true },
      }),
    ]);
    const pos = await this.purchaseOrders(businessId, [
      ...new Set(contracts.map((c) => c.supplierId)),
    ]);
    const names = await this.userNames(
      contracts.flatMap((c) => [c.ownerUserId, c.termsConfirmedByUserId]),
    );

    const rows = contracts.map((c) => {
      const status = effectiveStatus(c, lead, today);
      const supplierPos = pos.filter((p) => p.supplierId === c.supplierId);
      const covered = supplierPos.filter((p) => this.covers(c, p.createdAt));
      // POs placed with this supplier after this contract expired and not covered by another contract.
      const afterExpiry = c.expiresAt
        ? supplierPos.filter(
            (p) =>
              startOfUtcDay(p.createdAt) > c.expiresAt! &&
              !contracts.some(
                (o) =>
                  o.supplierId === c.supplierId &&
                  o.id !== c.id &&
                  this.covers(o, p.createdAt),
              ),
          )
        : [];
      const issues: string[] = [];
      if (c.status !== ProcurementContractStatus.draft && !c.termsConfirmedAt)
        issues.push('Terms not confirmed against the source document');
      if (status === 'expired' && afterExpiry.length)
        issues.push(`${afterExpiry.length} PO(s) placed after expiry`);
      if (status === 'renewal_unconfirmed')
        issues.push('Auto-renewal date passed; record the new term');
      if (
        c.priceValidUntil &&
        c.priceValidUntil < today &&
        status !== 'expired' &&
        status !== 'terminated'
      )
        issues.push('Price schedule has expired');
      const deadline = noticeDeadline(c);
      return {
        id: c.id,
        reference: c.reference,
        title: c.title,
        supplier: c.supplier,
        status: c.status,
        effectiveStatus: status,
        documentUrl: c.documentUrl,
        effectiveFrom: iso(c.effectiveFrom),
        expiresAt: iso(c.expiresAt),
        autoRenew: c.autoRenew,
        noticeDays: c.noticeDays,
        noticeDeadline: iso(deadline),
        daysToExpiry: c.expiresAt
          ? Math.round((c.expiresAt.getTime() - today.getTime()) / DAY)
          : null,
        currency: c.currency,
        paymentTerms: c.paymentTerms,
        discountTiers: c.discountTiers as unknown as DiscountTier[],
        priceValidUntil: iso(c.priceValidUntil),
        minimumOrderQty: c.minimumOrderQty,
        sla: c.sla,
        deliveryTerms: c.deliveryTerms,
        incoterms: c.incoterms,
        warranty: c.warranty,
        complianceRequirements: (c.complianceRequirements as string[]) ?? [],
        categories: (c.categories as string[]) ?? [],
        ownerUserId: c.ownerUserId,
        ownerName: c.ownerUserId ? (names.get(c.ownerUserId) ?? null) : null,
        version: c.version,
        termsConfirmedAt: c.termsConfirmedAt,
        termsConfirmedBy: c.termsConfirmedByUserId
          ? (names.get(c.termsConfirmedByUserId) ?? null)
          : null,
        renewalAlertSent:
          !!c.renewalAlertedFor &&
          c.renewalAlertedFor.getTime() === c.expiresAt?.getTime(),
        spendUnderContract:
          Math.round(covered.reduce((s, p) => s + p.value, 0) * 100) / 100,
        posUnderContract: covered.length,
        posAfterExpiry: afterExpiry.length,
        issues,
      };
    });

    const live = rows.filter((r) =>
      ['active', 'renewal_due', 'renewal_unconfirmed'].includes(
        r.effectiveStatus,
      ),
    );
    const within = (days: number) =>
      live.filter(
        (r) =>
          r.daysToExpiry !== null &&
          r.daysToExpiry >= 0 &&
          r.daysToExpiry <= days,
      ).length;
    return {
      currency: business.currency,
      alertLeadDays: lead,
      kpis: {
        active: live.length,
        expiring30: within(30),
        expiring60: within(60),
        expiring90: within(90),
        autoRenewing: live.filter((r) => r.autoRenew).length,
        spendUnderContract:
          Math.round(rows.reduce((s, r) => s + r.spendUnderContract, 0) * 100) /
          100,
        nonCompliant: rows.filter(
          (r) => r.issues.length > 0 && r.effectiveStatus !== 'terminated',
        ).length,
      },
      contracts: rows,
      spendNote:
        'Spend = purchase-order commitments (qty × unit cost) placed with the supplier during the contract period, in the business currency. Billed and paid amounts are not available (no Finance/AP module).',
    };
  }

  /**
   * Sends one renewal alert per contract term once the alert window opens (notice deadline minus the
   * configured lead days). Runs daily; also callable for one contract from the screen.
   */
  async sendRenewalAlerts(now = new Date()) {
    const today = startOfUtcDay(now);
    const candidates = await this.prisma.procurementSupplierContract.findMany({
      where: {
        status: ProcurementContractStatus.active,
        expiresAt: { not: null, gte: today },
      },
      include: { supplier: { select: { name: true } } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    const leadByBusiness = new Map<string, number>();
    let sent = 0;
    for (const c of candidates) {
      if (
        c.renewalAlertedFor &&
        c.renewalAlertedFor.getTime() === c.expiresAt!.getTime()
      )
        continue;
      if (!leadByBusiness.has(c.businessId)) {
        const b = await this.prisma.business.findUniqueOrThrow({
          where: { id: c.businessId },
        });
        leadByBusiness.set(
          c.businessId,
          resolvePolicies(b).num('procurement.contractRenewalAlertDays') ?? 30,
        );
      }
      if (
        effectiveStatus(c, leadByBusiness.get(c.businessId)!, today) !==
        'renewal_due'
      )
        continue;
      await this.cls.run(async () => {
        this.cls.set(CLS_KEY_BUSINESS_ID, c.businessId);
        await this.alert(c.businessId, c, c.supplier.name);
      });
      sent++;
    }
    return { sent };
  }

  async sendReminderNow(businessId: string, id: string) {
    const contract = await this.db.procurementSupplierContract.findFirst({
      where: { id, businessId },
      include: { supplier: { select: { name: true } } },
    });
    if (!contract)
      throw new AppException(
        CONTRACT_ERRORS.NOT_FOUND,
        'Contract not found.',
        HttpStatus.NOT_FOUND,
      );
    const recipients = await this.alert(
      businessId,
      contract,
      contract.supplier.name,
      true,
    );
    return { notified: recipients };
  }

  private async alert(
    businessId: string,
    c: ProcurementSupplierContract,
    supplierName: string,
    manual = false,
  ) {
    const owners = c.ownerUserId
      ? [c.ownerUserId]
      : (
          await this.prisma.businessUser.findMany({
            where: { businessId, role: Role.owner, active: true },
            select: { userId: true },
          })
        ).map((u) => u.userId);
    const deadline = noticeDeadline(c);
    const body = c.expiresAt
      ? `${supplierName} contract ${c.reference} expires ${iso(c.expiresAt)}${c.noticeDays ? `; notice is due by ${iso(deadline)}` : ''}${c.autoRenew ? ' (auto-renews unless you give notice)' : ''}.`
      : `${supplierName} contract ${c.reference} has no expiry date.`;
    for (const userId of owners) {
      await this.notifications.create(businessId, userId, {
        title: manual
          ? `Contract reminder: ${c.reference}`
          : `Contract renewal due: ${c.reference}`,
        body,
        link: `/procurement/contracts?contract=${c.id}`,
      });
    }
    if (!manual && c.expiresAt) {
      await this.prisma.procurementSupplierContract.update({
        where: { id: c.id },
        data: { renewalAlertedFor: c.expiresAt },
      });
    }
    return owners.length;
  }

  async options(businessId: string) {
    const [suppliers, members] = await Promise.all([
      this.db.supplier.findMany({
        where: { businessId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      this.db.businessUser.findMany({
        where: { businessId, active: true },
        select: { userId: true, user: { select: { name: true } } },
      }),
    ]);
    return {
      suppliers,
      members: members.map((m) => ({ userId: m.userId, name: m.user.name })),
    };
  }
}
