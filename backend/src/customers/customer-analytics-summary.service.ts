import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BranchScopeService } from '../common/tenancy/branch-scope.service';
import { SegmentsService } from './segments.service';
import { excludeErasedCustomers } from './segment-rules.util';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class CustomerAnalyticsSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branchScope: BranchScopeService,
    private readonly segments: SegmentsService,
  ) {}

  /** Uses the shared Analytics definitions for customer retention, LTV and feedback. */
  async customerSummary(businessId: string, branchId?: string) {
    const ids = await this.branchScope.resolveIds(businessId, branchId);
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const monthEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const customerFeedbackFrom = new Date(
      now.getTime() - 90 * 24 * 60 * 60 * 1000,
    );

    // atRiskCount intentionally uses the caller business's canonical Lapsed segment. The other
    // values respect the resolved branch scope as they did in AnalyticsService.
    const [lapsedSegment, customers, newThisMonth, customerFeedbackGroups] =
      await Promise.all([
        this.segments.getSegment('lapsed'),
        this.prisma.customer.findMany({
          where: excludeErasedCustomers({ businessId: { in: ids } }),
          select: { id: true, visitCount: true, lifetimeSpend: true },
        }),
        this.prisma.customer.count({
          where: excludeErasedCustomers({
            businessId: { in: ids },
            createdAt: { gte: monthStart, lt: monthEnd },
          }),
        }),
        this.prisma.reviewRequest.groupBy({
          by: ['stars', 'routedTo'],
          where: {
            businessId: { in: ids },
            customerId: { not: null },
            status: 'rated',
            stars: { not: null },
            respondedAt: { gte: customerFeedbackFrom, lte: now },
            customer: { isNot: { phone: { startsWith: 'erased-' } } },
          },
          _count: { _all: true },
        }),
      ]);

    const ratingCounts = [0, 0, 0, 0, 0];
    let responseCount = 0;
    let starTotal = 0;
    let publicRouteCount = 0;
    let privateRouteCount = 0;
    for (const group of customerFeedbackGroups) {
      const count = Number(group._count._all);
      responseCount += count;
      if (group.stars !== null && group.stars >= 1 && group.stars <= 5) {
        ratingCounts[group.stars - 1] += count;
        starTotal += group.stars * count;
      }
      if (group.routedTo === 'public') publicRouteCount += count;
      if (group.routedTo === 'private') privateRouteCount += count;
    }
    const customerFeedback = {
      windowDays: 90,
      from: customerFeedbackFrom.toISOString(),
      observedAt: now.toISOString(),
      responseCount,
      averageStars:
        responseCount > 0 ? round2(starTotal / responseCount) : null,
      ratingCounts: ratingCounts.map((count, index) => ({
        stars: index + 1,
        count,
      })),
      routedCounts: {
        public: publicRouteCount,
        private: privateRouteCount,
      },
      source: 'customer_linked_noxtill_review_requests',
      note: 'Only submitted Noxtill review requests linked to non-erased customer records are included. External platform reviews are not linked to CRM customers here.',
    };

    const withVisit = customers.filter((customer) => customer.visitCount >= 1);
    const returning = customers.filter((customer) => customer.visitCount > 1);
    const retentionRate =
      withVisit.length > 0
        ? round2((returning.length / withVisit.length) * 100)
        : 0;
    const spends = customers
      .map((customer) => Number(customer.lifetimeSpend))
      .sort((left, right) => left - right);
    const avgLTV = spends.length
      ? round2(spends.reduce((sum, value) => sum + value, 0) / spends.length)
      : 0;

    return {
      totalCustomers: customers.length,
      newCount: newThisMonth,
      returningCount: returning.length,
      withVisitCount: withVisit.length,
      retentionRate,
      avgLTV,
      ltvDistribution: this.buildLtvQuartiles(spends),
      atRiskCount: lapsedSegment.count,
      customerFeedback,
    };
  }

  private buildLtvQuartiles(sortedSpends: number[]) {
    if (sortedSpends.length === 0) return [];
    const quartileLabels = ['Bottom 25%', '25–50%', '50–75%', 'Top 25%'];
    const size = Math.ceil(sortedSpends.length / 4);
    return quartileLabels.map((label, index) => {
      const bucket = sortedSpends.slice(index * size, (index + 1) * size);
      return {
        label,
        count: bucket.length,
        minLtv: bucket.length ? round2(bucket[0]) : 0,
        maxLtv: bucket.length ? round2(bucket[bucket.length - 1]) : 0,
      };
    });
  }
}
