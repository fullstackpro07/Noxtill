import { Injectable } from '@nestjs/common';
import { SeoAuditIssueStatus } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

function hasRank(
  snapshot: { rank: number | null } | null,
): snapshot is { rank: number } {
  return snapshot !== null && snapshot.rank !== null;
}

/**
 * Read model for SEO Autopilot's overview. It intentionally derives only from canonical tracked
 * keyword snapshots already collected by the rank worker. Crawl, backlink and provider-volume
 * metrics are explicitly unavailable until corresponding verified sources exist.
 */
@Injectable()
export class SeoAutopilotService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async overview(businessId: string) {
    const checkedAt = new Date();
    const freshnessThreshold = new Date(
      checkedAt.getTime() - 7 * 24 * 60 * 60 * 1000,
    );
    const [keywords, openAuditIssues] = await Promise.all([
      this.tenantPrisma.client.trackedKeyword.findMany({
        where: { businessId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: {
          snapshots: {
            orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
            take: 2,
          },
        },
      }),
      this.tenantPrisma.client.seoAuditIssue.count({
        where: { businessId, status: SeoAuditIssueStatus.open },
      }),
    ]);

    const measurements = keywords.map((keyword) => ({
      latest: keyword.snapshots[0] ?? null,
      previous: keyword.snapshots[1] ?? null,
    }));
    const rankedKeywords = measurements.filter(({ latest }) =>
      hasRank(latest),
    ).length;
    const topTen = measurements.filter(
      ({ latest }) => hasRank(latest) && latest.rank <= 10,
    ).length;
    const improving = measurements.filter(
      ({ latest, previous }) =>
        hasRank(latest) && hasRank(previous) && latest.rank < previous.rank,
    ).length;
    const declining = measurements.filter(
      ({ latest, previous }) =>
        hasRank(latest) && hasRank(previous) && latest.rank > previous.rank,
    ).length;
    const needsFreshCheck = measurements.filter(
      ({ latest }) =>
        latest === null ||
        latest.capturedAt.getTime() < freshnessThreshold.getTime(),
    ).length;
    const lastCheckedAt = measurements.reduce<Date | null>(
      (latest, { latest: measurement }) => {
        if (!measurement) return latest;
        return !latest || measurement.capturedAt > latest
          ? measurement.capturedAt
          : latest;
      },
      null,
    );
    const dataStatus =
      keywords.length === 0
        ? 'no_data'
        : needsFreshCheck === keywords.length
          ? 'stale'
          : needsFreshCheck > 0
            ? 'partial'
            : 'available';

    return {
      checkedAt,
      dataStatus,
      trackedKeywords: keywords.length,
      rankedKeywords,
      topTen,
      improving,
      declining,
      needsFreshCheck,
      openAuditIssues,
      lastCheckedAt,
      unsupported: [
        {
          key: 'search_volume',
          reason:
            'Search-volume figures are not available from the connected rank history.',
        },
        {
          key: 'backlinks',
          reason:
            'No verified backlink source is configured for this business.',
        },
      ],
    };
  }
}
