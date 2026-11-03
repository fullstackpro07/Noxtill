import { Injectable } from '@nestjs/common';
import {
  ProcurementContractStatus,
  ProcurementRequestStatus,
  PurchaseOrderStatus,
} from '@prisma/client';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';

const DAY = 86_400_000;
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface AnalyticsQuery {
  days: number;
  supplierId?: string;
  department?: string;
}

/**
 * Procurement Analytics (module 38.7): procurement-domain measures computed from canonical
 * Purchase Requests, shared RFQs/quotes, Inventory purchase orders and supplier contracts. Spend
 * is purchase-order commitment; billed/paid spend and 3-way match rates need vendor bills, which
 * are not recorded anywhere in this workspace, so they are reported as not available.
 */
@Injectable()
export class ProcurementAnalyticsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  async analytics(businessId: string, q: AnalyticsQuery) {
    const since = new Date(Date.now() - q.days * DAY);
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { currency: true },
    });

    const [requests, rfqs, pos, contracts, suppliers] = await Promise.all([
      this.db.procurementRequest.findMany({
        where: {
          businessId,
          createdAt: { gte: since },
          ...(q.department ? { department: q.department } : {}),
          ...(q.supplierId ? { supplierId: q.supplierId } : {}),
        },
        select: {
          id: true,
          status: true,
          department: true,
          currency: true,
          createdAt: true,
          submittedAt: true,
          supplierId: true,
          convertedPurchaseOrder: { select: { createdAt: true } },
          items: {
            select: { quantity: true, estimatedUnitCost: true, category: true },
          },
        },
      }),
      this.db.commerceRfq.findMany({
        where: { businessId, createdAt: { gte: since } },
        select: {
          id: true,
          status: true,
          currency: true,
          sourceProcurementRequestId: true,
          sourceProcurementRequest: {
            select: {
              currency: true,
              department: true,
              items: { select: { quantity: true, estimatedUnitCost: true } },
            },
          },
          items: { select: { qty: true } },
          suppliers: {
            select: {
              supplierId: true,
              status: true,
              invitedAt: true,
              respondedAt: true,
            },
          },
          awardedQuote: {
            select: {
              supplierId: true,
              currency: true,
              freight: true,
              duties: true,
              items: { select: { quotedQty: true, unitPrice: true } },
            },
          },
        },
      }),
      this.db.purchaseOrder.findMany({
        where: {
          businessId,
          createdAt: { gte: since },
          status: { not: PurchaseOrderStatus.cancelled },
          ...(q.supplierId ? { supplierId: q.supplierId } : {}),
        },
        select: {
          id: true,
          supplierId: true,
          createdAt: true,
          items: {
            select: {
              qtyOrdered: true,
              unitCost: true,
              product: { select: { category: true } },
            },
          },
        },
      }),
      this.db.procurementSupplierContract.findMany({
        where: { businessId, status: { not: ProcurementContractStatus.draft } },
        select: { supplierId: true, effectiveFrom: true, expiresAt: true },
      }),
      this.db.supplier.findMany({
        where: { businessId },
        select: { id: true, name: true },
      }),
    ]);
    const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

    // Request funnel and cycle time (submitted → purchase order created).
    const funnel = Object.fromEntries(
      Object.values(ProcurementRequestStatus).map((s) => [
        s,
        requests.filter((r) => r.status === s).length,
      ]),
    );
    const cycleDays = requests
      .filter((r) => r.convertedPurchaseOrder && r.submittedAt)
      .map(
        (r) =>
          (r.convertedPurchaseOrder!.createdAt.getTime() -
            r.submittedAt!.getTime()) /
          DAY,
      )
      .filter((d) => d >= 0);

    // RFQ participation and supplier response time.
    const invitations = rfqs
      .flatMap((r) => r.suppliers)
      .filter((s) => s.invitedAt);
    const responded = invitations.filter((s) => s.respondedAt);
    const responseHours = responded
      .map(
        (s) => (s.respondedAt!.getTime() - s.invitedAt!.getTime()) / 3_600_000,
      )
      .filter((h) => h >= 0);

    // Sourcing savings: only like-for-like comparisons are counted.
    const savingsRows: {
      rfqId: string;
      supplier: string | null;
      baseline: number;
      awarded: number;
      savings: number;
    }[] = [];
    const exclusions: Record<string, number> = {
      no_source_request: 0,
      not_awarded: 0,
      no_estimate: 0,
      currency_differs: 0,
      scope_changed: 0,
    };
    for (const rfq of rfqs) {
      if (!rfq.sourceProcurementRequest) {
        exclusions.no_source_request++;
        continue;
      }
      if (!rfq.awardedQuote) {
        exclusions.not_awarded++;
        continue;
      }
      const req = rfq.sourceProcurementRequest;
      const baseline = req.items.reduce(
        (s, i) => s + Number(i.quantity) * Number(i.estimatedUnitCost),
        0,
      );
      if (baseline <= 0) {
        exclusions.no_estimate++;
        continue;
      }
      if (req.currency !== rfq.awardedQuote.currency) {
        exclusions.currency_differs++;
        continue;
      }
      const requestQty = req.items.reduce((s, i) => s + Number(i.quantity), 0);
      const rfqQty = rfq.items.reduce((s, i) => s + i.qty, 0);
      const quotedQty = rfq.awardedQuote.items.reduce(
        (s, i) => s + i.quotedQty,
        0,
      );
      if (Math.abs(requestQty - rfqQty) > 1e-6 || quotedQty !== rfqQty) {
        exclusions.scope_changed++;
        continue;
      }
      const awarded =
        rfq.awardedQuote.items.reduce(
          (s, i) => s + i.quotedQty * Number(i.unitPrice),
          0,
        ) +
        Number(rfq.awardedQuote.freight) +
        Number(rfq.awardedQuote.duties);
      savingsRows.push({
        rfqId: rfq.id,
        supplier: supplierName.get(rfq.awardedQuote.supplierId) ?? null,
        baseline: round(baseline),
        awarded: round(awarded),
        savings: round(baseline - awarded),
      });
    }
    const baselineTotal = savingsRows.reduce((s, r) => s + r.baseline, 0);
    const savingsTotal = savingsRows.reduce((s, r) => s + r.savings, 0);

    // Purchase-order commitments, contract coverage and category mix.
    const covered = (supplierId: string, at: Date) => {
      const day = new Date(
        Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
      );
      return contracts.some(
        (c) =>
          c.supplierId === supplierId &&
          c.effectiveFrom <= day &&
          (!c.expiresAt || c.expiresAt >= day),
      );
    };
    let committed = 0;
    let offContract = 0;
    const byCategory = new Map<string, number>();
    const bySupplier = new Map<
      string,
      { committed: number; pos: number; underContract: number }
    >();
    for (const po of pos) {
      const value = po.items.reduce(
        (s, i) => s + i.qtyOrdered * Number(i.unitCost),
        0,
      );
      committed += value;
      const isCovered = covered(po.supplierId, po.createdAt);
      if (!isCovered) offContract += value;
      for (const item of po.items) {
        const cat = item.product?.category || 'Uncategorised';
        byCategory.set(
          cat,
          (byCategory.get(cat) ?? 0) + item.qtyOrdered * Number(item.unitCost),
        );
      }
      const row = bySupplier.get(po.supplierId) ?? {
        committed: 0,
        pos: 0,
        underContract: 0,
      };
      row.committed += value;
      row.pos++;
      if (isCovered) row.underContract += value;
      bySupplier.set(po.supplierId, row);
    }
    const rfqBySupplier = new Map<
      string,
      { invited: number; responded: number; hours: number[] }
    >();
    for (const inv of invitations) {
      const row = rfqBySupplier.get(inv.supplierId) ?? {
        invited: 0,
        responded: 0,
        hours: [],
      };
      row.invited++;
      if (inv.respondedAt) {
        row.responded++;
        row.hours.push(
          (inv.respondedAt.getTime() - inv.invitedAt!.getTime()) / 3_600_000,
        );
      }
      rfqBySupplier.set(inv.supplierId, row);
    }
    const supplierIds = new Set([
      ...bySupplier.keys(),
      ...rfqBySupplier.keys(),
    ]);
    const departments = new Map<
      string,
      { requests: number; estimated: number; converted: number }
    >();
    for (const r of requests) {
      const key = r.department || 'No department';
      const row = departments.get(key) ?? {
        requests: 0,
        estimated: 0,
        converted: 0,
      };
      row.requests++;
      row.estimated += r.items.reduce(
        (s, i) => s + Number(i.quantity) * Number(i.estimatedUnitCost),
        0,
      );
      if (r.status === ProcurementRequestStatus.converted) row.converted++;
      departments.set(key, row);
    }

    return {
      currency: business.currency,
      periodDays: q.days,
      filters: {
        supplierId: q.supplierId ?? null,
        department: q.department ?? null,
      },
      options: {
        suppliers,
        departments: [
          ...new Set(
            (
              await this.db.procurementRequest.findMany({
                where: { businessId, department: { not: null } },
                select: { department: true },
                distinct: ['department'],
              })
            ).map((d) => d.department!),
          ),
        ].sort(),
      },
      kpis: {
        requestToPoCycleDays: {
          median: cycleDays.length ? round(median(cycleDays)!, 1) : null,
          average: cycleDays.length
            ? round(cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length, 1)
            : null,
          sample: cycleDays.length,
        },
        rfqParticipation: {
          invited: invitations.length,
          responded: responded.length,
          rate: invitations.length
            ? round((responded.length / invitations.length) * 100, 1)
            : null,
        },
        savingsVsBaseline: {
          amount: savingsRows.length ? round(savingsTotal) : null,
          percent:
            baselineTotal > 0
              ? round((savingsTotal / baselineTotal) * 100, 1)
              : null,
          comparedRfqs: savingsRows.length,
        },
        offContractSpend: {
          amount: round(offContract),
          shareOfCommitted:
            committed > 0 ? round((offContract / committed) * 100, 1) : null,
        },
        matchExceptionRate: {
          value: null,
          availability: 'not_available',
          detail:
            'Needs vendor bills; there is no Finance/AP module recording them.',
        },
        supplierResponseHours: {
          median: responseHours.length
            ? round(median(responseHours)!, 1)
            : null,
          sample: responseHours.length,
        },
        throughput: {
          requestsCreated: requests.length,
          requestsConverted: funnel.converted ?? 0,
          purchaseOrders: pos.length,
        },
      },
      spendByCategory: [...byCategory.entries()]
        .map(([category, amount]) => ({ category, committed: round(amount) }))
        .sort((a, b) => b.committed - a.committed),
      savings: {
        rows: savingsRows,
        exclusions,
        methodology:
          "Baseline = the source purchase request's estimated total. Awarded = the awarded quote's items plus freight and duties. Counted only when the RFQ came from a request, was awarded, the request has an estimate, currencies match and total quantities are unchanged (request = RFQ = quote).",
      },
      funnel,
      contractUtilization: {
        committed: round(committed),
        underContract: round(committed - offContract),
        percent:
          committed > 0
            ? round(((committed - offContract) / committed) * 100, 1)
            : null,
      },
      suppliers: [...supplierIds]
        .map((id) => {
          const spend = bySupplier.get(id);
          const rfq = rfqBySupplier.get(id);
          return {
            supplierId: id,
            name: supplierName.get(id) ?? 'Unknown supplier',
            committed: round(spend?.committed ?? 0),
            purchaseOrders: spend?.pos ?? 0,
            underContractPercent:
              spend && spend.committed > 0
                ? round((spend.underContract / spend.committed) * 100, 1)
                : null,
            rfqInvites: rfq?.invited ?? 0,
            rfqResponses: rfq?.responded ?? 0,
            medianResponseHours: rfq?.hours.length
              ? round(median(rfq.hours)!, 1)
              : null,
            billed: null,
          };
        })
        .sort((a, b) => b.committed - a.committed),
      departments: [...departments.entries()]
        .map(([department, d]) => ({
          department,
          requests: d.requests,
          estimated: round(d.estimated),
          converted: d.converted,
        }))
        .sort((a, b) => b.estimated - a.estimated),
      definitions: [
        {
          metric: 'Request-to-PO cycle time',
          definition:
            'Days from a request being submitted to its purchase order being created, for requests converted in the period.',
        },
        {
          metric: 'RFQ participation',
          definition:
            'Supplier invitations with a recorded response ÷ invitations sent, for RFQs created in the period.',
        },
        {
          metric: 'Savings vs baseline',
          definition:
            'See the savings methodology; unmatched scope is excluded, never counted as savings.',
        },
        {
          metric: 'Off-contract spend',
          definition:
            "Purchase-order value placed with a supplier on a date not covered by any of that supplier's contracts (draft contracts do not count).",
        },
        {
          metric: 'Committed spend',
          definition:
            'Purchase orders (not cancelled) created in the period: quantity ordered × unit cost. This is commitment, not cash paid or billed.',
        },
      ],
    };
  }
}
