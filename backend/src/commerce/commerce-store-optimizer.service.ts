import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CommerceListingDraftStatus,
  CommerceStoreImpact,
  CommerceStoreOpportunityStatus,
  CommerceStoreRuleKey,
  OrderStatus,
  Prisma,
  ProductKind,
  ReturnStatus,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  COMMERCE_STORE_ERROR_CODES as CODES,
  COMMERCE_STORE_RULES as RULES,
} from './commerce.constants';

const DAY_MS = 24 * 60 * 60 * 1000;
const SYNCABLE_CHANNELS = new Set(['shopify', 'woocommerce']);

/** Statuses a re-check can verify as fixed (dismissed findings are left alone). */
const VERIFIABLE: CommerceStoreOpportunityStatus[] = [
  CommerceStoreOpportunityStatus.open,
  CommerceStoreOpportunityStatus.in_progress,
  CommerceStoreOpportunityStatus.done,
];

const TRANSITIONS: Record<
  CommerceStoreOpportunityStatus,
  CommerceStoreOpportunityStatus[]
> = {
  open: [
    CommerceStoreOpportunityStatus.in_progress,
    CommerceStoreOpportunityStatus.done,
    CommerceStoreOpportunityStatus.dismissed,
  ],
  in_progress: [
    CommerceStoreOpportunityStatus.open,
    CommerceStoreOpportunityStatus.done,
    CommerceStoreOpportunityStatus.dismissed,
  ],
  done: [CommerceStoreOpportunityStatus.open],
  dismissed: [CommerceStoreOpportunityStatus.open],
  verified: [],
};

export interface StoreFinding {
  ruleKey: CommerceStoreRuleKey;
  productId: string | null;
  dedupeKey: string;
  title: string;
  impact: CommerceStoreImpact;
  metricValue: number | null;
  evidence: Record<string, unknown>;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Store Optimizer (Autonomous Commerce screen 10). Explainable rules over real products, orders,
 * returns, waitlist and listing records — there is no storefront traffic data in Noxtill, so
 * conversion/drop-off metrics are disclosed as not tracked rather than estimated. It never edits
 * a live store; each finding links to the canonical place to fix it, and a finding is "verified"
 * only when a re-check shows the condition is gone.
 */
@Injectable()
export class CommerceStoreOptimizerService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async detect(businessId: string, now = new Date()): Promise<StoreFinding[]> {
    const lookback = new Date(now.getTime() - RULES.lookbackDays * DAY_MS);
    const recent = new Date(now.getTime() - RULES.recentSalesDays * DAY_MS);
    const [products, soldRows, returnRows, waitlist, approvedDrafts] =
      await Promise.all([
        this.tenantPrisma.client.product.findMany({
          where: { businessId, active: true, kind: ProductKind.product },
          select: {
            id: true,
            name: true,
            photoKey: true,
            category: true,
            categoryId: true,
            stockQty: true,
            costPrice: true,
            sellingPrice: true,
          },
        }),
        this.tenantPrisma.client.orderItem.findMany({
          where: {
            productId: { not: null },
            order: {
              businessId,
              isQuotation: false,
              status: { not: OrderStatus.cancelled },
              createdAt: { gte: lookback },
            },
          },
          select: {
            productId: true,
            qty: true,
            order: { select: { createdAt: true } },
          },
        }),
        this.tenantPrisma.client.returnItem.findMany({
          where: {
            return: {
              businessId,
              status: { not: ReturnStatus.rejected },
              createdAt: { gte: lookback },
            },
          },
          select: {
            productId: true,
            qty: true,
            return: { select: { reason: true } },
          },
        }),
        this.tenantPrisma.client.productWaitlistEntry.groupBy({
          by: ['productId'],
          where: { businessId, notifiedAt: null },
          _count: { _all: true },
        }),
        this.tenantPrisma.client.commerceListingDraft.findMany({
          where: { businessId, status: CommerceListingDraftStatus.approved },
          select: {
            id: true,
            channel: true,
            productId: true,
            product: { select: { name: true } },
            channelListings: { select: { provider: true } },
          },
        }),
      ]);

    const sold90 = new Map<string, number>();
    const sold30 = new Map<string, number>();
    for (const row of soldRows) {
      const id = row.productId!;
      sold90.set(id, (sold90.get(id) ?? 0) + row.qty);
      if (row.order.createdAt >= recent)
        sold30.set(id, (sold30.get(id) ?? 0) + row.qty);
    }
    const returned = new Map<
      string,
      { units: number; reasons: Map<string, number> }
    >();
    for (const row of returnRows) {
      const entry = returned.get(row.productId) ?? {
        units: 0,
        reasons: new Map(),
      };
      entry.units += row.qty;
      const reason = row.return.reason.trim().toLowerCase();
      entry.reasons.set(reason, (entry.reasons.get(reason) ?? 0) + row.qty);
      returned.set(row.productId, entry);
    }
    const waiting = new Map(
      waitlist.map((row) => [row.productId, row._count._all]),
    );

    const findings: StoreFinding[] = [];
    for (const product of products) {
      const sold = sold90.get(product.id) ?? 0;
      if (!product.photoKey) {
        findings.push({
          ruleKey: CommerceStoreRuleKey.missing_photo,
          productId: product.id,
          dedupeKey: `missing_photo:${product.id}`,
          title: `${product.name} has no product photo`,
          impact:
            sold > 0 ? CommerceStoreImpact.high : CommerceStoreImpact.medium,
          metricValue: null,
          evidence: {
            explanation: 'Active product with no photo in Products.',
            unitsSoldLast90Days: sold,
          },
        });
      }
      if (!product.categoryId && !product.category?.trim()) {
        findings.push({
          ruleKey: CommerceStoreRuleKey.missing_category,
          productId: product.id,
          dedupeKey: `missing_category:${product.id}`,
          title: `${product.name} isn't in any category`,
          impact: CommerceStoreImpact.low,
          metricValue: null,
          evidence: {
            explanation:
              'Uncategorised products are harder to find when browsing.',
          },
        });
      }
      const ret = returned.get(product.id);
      if (ret && ret.units >= RULES.highReturnMinUnits && sold > 0) {
        const rate = round2((ret.units / sold) * 100);
        if (rate >= RULES.highReturnRatePct) {
          findings.push({
            ruleKey: CommerceStoreRuleKey.high_return_rate,
            productId: product.id,
            dedupeKey: `high_return_rate:${product.id}`,
            title: `${product.name}: ${rate}% of units sold came back`,
            impact:
              rate >= RULES.highReturnRatePct * 2
                ? CommerceStoreImpact.high
                : CommerceStoreImpact.medium,
            metricValue: rate,
            evidence: {
              explanation: `${ret.units} units returned vs ${sold} sold in the last ${RULES.lookbackDays} days (rule: at least ${RULES.highReturnMinUnits} units and ${RULES.highReturnRatePct}%).`,
              topReasons: [...ret.reasons.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([reason, units]) => ({ reason, units })),
            },
          });
        }
      }
      const recentSold = sold30.get(product.id) ?? 0;
      const waitingCount = waiting.get(product.id) ?? 0;
      if (product.stockQty <= 0 && (recentSold > 0 || waitingCount > 0)) {
        findings.push({
          ruleKey: CommerceStoreRuleKey.out_of_stock_demand,
          productId: product.id,
          dedupeKey: `out_of_stock_demand:${product.id}`,
          title: `${product.name} is out of stock but still in demand`,
          impact: CommerceStoreImpact.high,
          metricValue: recentSold,
          evidence: {
            explanation: `No stock, with ${recentSold} sold in the last ${RULES.recentSalesDays} days and ${waitingCount} customer${waitingCount === 1 ? '' : 's'} on the waitlist.`,
            stockQty: product.stockQty,
            waitlist: waitingCount,
          },
        });
      }
      const cost = Number(product.costPrice);
      const price = Number(product.sellingPrice);
      if (cost > 0 && price < cost) {
        findings.push({
          ruleKey: CommerceStoreRuleKey.below_cost_price,
          productId: product.id,
          dedupeKey: `below_cost_price:${product.id}`,
          title: `${product.name} sells below its cost price`,
          impact:
            sold > 0 ? CommerceStoreImpact.high : CommerceStoreImpact.medium,
          metricValue: round2(price - cost),
          evidence: {
            explanation: `Selling price ${price} is below cost price ${cost} in Products.`,
            unitsSoldLast90Days: sold,
          },
        });
      }
    }
    for (const draft of approvedDrafts) {
      const channel = draft.channel.trim().toLowerCase();
      if (!SYNCABLE_CHANNELS.has(channel)) continue;
      if (draft.channelListings.some((listing) => listing.provider === channel))
        continue;
      findings.push({
        ruleKey: CommerceStoreRuleKey.listing_not_synced,
        productId: draft.productId,
        dedupeKey: `listing_not_synced:${draft.id}`,
        title: `Approved ${channel} listing for ${draft.product.name} was never sent`,
        impact: CommerceStoreImpact.medium,
        metricValue: null,
        evidence: {
          explanation:
            'Content is approved in the Listing Builder but no store draft exists yet.',
          draftId: draft.id,
          channel,
        },
      });
    }
    return findings;
  }

  private audit(
    businessId: string,
    opportunityId: string,
    action: string,
    actorUserId: string | null,
    reason?: string | null,
  ) {
    return this.tenantPrisma.client.commerceStoreAudit.create({
      data: {
        businessId,
        opportunityId,
        action,
        actorUserId,
        reason: reason ?? null,
      },
    });
  }

  /**
   * Records findings idempotently and verifies fixes: any open/in-progress/done opportunity whose
   * condition no longer appears is marked `verified` with the date it was confirmed.
   */
  async runChecks(businessId: string, actorUserId: string) {
    const findings = await this.detect(businessId);
    const seen = new Set(findings.map((finding) => finding.dedupeKey));
    let created = 0;
    let refreshed = 0;
    for (const finding of findings) {
      const existing =
        await this.tenantPrisma.client.commerceStoreOpportunity.findUnique({
          where: {
            businessId_dedupeKey: { businessId, dedupeKey: finding.dedupeKey },
          },
        });
      const data = {
        title: finding.title,
        impact: finding.impact,
        evidence: finding.evidence as Prisma.InputJsonValue,
        metricValue: finding.metricValue,
        lastDetectedAt: new Date(),
      };
      if (!existing) {
        const row =
          await this.tenantPrisma.client.commerceStoreOpportunity.create({
            data: {
              ...data,
              businessId,
              ruleKey: finding.ruleKey,
              dedupeKey: finding.dedupeKey,
              productId: finding.productId,
              baselineValue: finding.metricValue,
            },
          });
        await this.audit(businessId, row.id, 'detected', actorUserId);
        created += 1;
      } else if (existing.status === CommerceStoreOpportunityStatus.verified) {
        // The problem came back after being verified fixed: reopen with a fresh baseline.
        await this.tenantPrisma.client.commerceStoreOpportunity.update({
          where: { id: existing.id, businessId },
          data: {
            ...data,
            status: CommerceStoreOpportunityStatus.open,
            verifiedAt: null,
            baselineValue: finding.metricValue,
          },
        });
        await this.audit(businessId, existing.id, 'reappeared', actorUserId);
        created += 1;
      } else {
        await this.tenantPrisma.client.commerceStoreOpportunity.update({
          where: { id: existing.id, businessId },
          data,
        });
        refreshed += 1;
      }
    }
    const stale =
      await this.tenantPrisma.client.commerceStoreOpportunity.findMany({
        where: { businessId, status: { in: VERIFIABLE } },
        select: { id: true, dedupeKey: true },
      });
    let verified = 0;
    for (const row of stale.filter((item) => !seen.has(item.dedupeKey))) {
      await this.tenantPrisma.client.commerceStoreOpportunity.update({
        where: { id: row.id, businessId },
        data: {
          status: CommerceStoreOpportunityStatus.verified,
          verifiedAt: new Date(),
        },
      });
      await this.audit(
        businessId,
        row.id,
        'verified_by_recheck',
        actorUserId,
        'The condition no longer appears in the data.',
      );
      verified += 1;
    }
    return { findings: findings.length, created, refreshed, verified };
  }

  async list(businessId: string, status?: CommerceStoreOpportunityStatus) {
    const rows =
      await this.tenantPrisma.client.commerceStoreOpportunity.findMany({
        where: { businessId, ...(status ? { status } : {}) },
        include: { product: { select: { id: true, name: true } } },
        orderBy: [
          { status: 'asc' },
          { impact: 'desc' },
          { lastDetectedAt: 'desc' },
        ],
        take: 500,
      });
    return rows.map((row) => ({
      ...row,
      metricValue: row.metricValue === null ? null : Number(row.metricValue),
      baselineValue:
        row.baselineValue === null ? null : Number(row.baselineValue),
    }));
  }

  async setStatus(
    businessId: string,
    actorUserId: string,
    id: string,
    status: CommerceStoreOpportunityStatus,
    reason?: string,
  ) {
    const existing =
      await this.tenantPrisma.client.commerceStoreOpportunity.findFirst({
        where: { id, businessId },
      });
    if (!existing) {
      throw new AppException(
        CODES.NOT_FOUND,
        'Opportunity was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!TRANSITIONS[existing.status].includes(status)) {
      throw new AppException(
        CODES.INVALID_TRANSITION,
        status === CommerceStoreOpportunityStatus.verified
          ? 'Only a re-check can verify a fix.'
          : `A ${existing.status.replace('_', ' ')} opportunity can't move to ${status.replace('_', ' ')}.`,
        HttpStatus.CONFLICT,
      );
    }
    const trimmed = reason?.trim() || null;
    if (
      status === CommerceStoreOpportunityStatus.dismissed &&
      (!trimmed || trimmed.length < 3)
    ) {
      throw new AppException(
        CODES.REASON_REQUIRED,
        'Give a reason for dismissing this opportunity.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const updated =
      await this.tenantPrisma.client.commerceStoreOpportunity.update({
        where: { id, businessId },
        data: { status, resolution: trimmed ?? existing.resolution },
      });
    await this.audit(businessId, id, `status_${status}`, actorUserId, trimmed);
    return updated;
  }

  async summary(businessId: string) {
    const rows =
      await this.tenantPrisma.client.commerceStoreOpportunity.groupBy({
        by: ['status', 'impact'],
        where: { businessId },
        _count: { _all: true },
      });
    const count = (filter: (row: (typeof rows)[number]) => boolean) =>
      rows.filter(filter).reduce((sum, row) => sum + row._count._all, 0);
    const active = (row: (typeof rows)[number]) =>
      row.status === CommerceStoreOpportunityStatus.open ||
      row.status === CommerceStoreOpportunityStatus.in_progress;
    return {
      openOpportunities: count(active),
      highImpactOpen: count(
        (row) => active(row) && row.impact === CommerceStoreImpact.high,
      ),
      markedDone: count(
        (row) => row.status === CommerceStoreOpportunityStatus.done,
      ),
      verifiedFixed: count(
        (row) => row.status === CommerceStoreOpportunityStatus.verified,
      ),
      dismissed: count(
        (row) => row.status === CommerceStoreOpportunityStatus.dismissed,
      ),
      rules: RULES,
    };
  }
}
