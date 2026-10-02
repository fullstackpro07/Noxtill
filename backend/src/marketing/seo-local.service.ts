import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, SeoContentFormat } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SeoContentService } from './seo-content.service';
import { NAP_FIELDS } from '../listings/listing-sync.service';
import type { SeoAuditPage } from './seo-site-audit.util';

const SEO_LOCAL_ERRORS = {
  BUSINESS_NOT_FOUND: 'SEO_LOCAL_BUSINESS_NOT_FOUND',
  LOCATION_NOT_FOUND: 'SEO_LOCAL_LOCATION_NOT_FOUND',
} as const;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasHours(value: unknown): boolean {
  return Object.values(record(value)).some((day) => {
    if (Array.isArray(day)) return day.length > 0;
    if (day && typeof day === 'object') return Object.keys(day).length > 0;
    return nonEmpty(day);
  });
}

function categoryNames(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => nonEmpty(item))
        .map((item) => item.trim())
    : [];
}

function fieldExclusions(value: unknown): Record<string, string[]> {
  const raw = record(value);
  return Object.fromEntries(
    Object.entries(raw).map(([provider, fields]) => [
      provider,
      Array.isArray(fields)
        ? fields.filter((field): field is string => typeof field === 'string')
        : [],
    ]),
  );
}

function auditPages(value: Prisma.JsonValue | null): SeoAuditPage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (page): page is Prisma.JsonObject =>
      page !== null &&
      typeof page === 'object' &&
      !Array.isArray(page) &&
      typeof page.url === 'string',
  ) as unknown as SeoAuditPage[];
}

function mentionsCity(page: SeoAuditPage, city: string): string[] {
  const needle = city.trim().toLocaleLowerCase();
  if (!needle) return [];
  const fields: [string, string | null | undefined][] = [
    ['title', page.title],
    ['description', page.description],
    ['h1', page.h1],
  ];
  return fields
    .filter(([, value]) => value?.toLocaleLowerCase().includes(needle))
    .map(([field]) => field);
}

/**
 * Local SEO read model. Cross-location reads use explicit business ids from the caller's own
 * branch group (the tenant extension intentionally scopes ordinary queries to one business).
 * Canonical listings/reviews remain owned by Business Listings and Reviews; this service only
 * reads their records and creates location-page briefs through SeoContentService.
 */
@Injectable()
export class SeoLocalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: SeoContentService,
  ) {}

  private async locationsFor(businessId: string) {
    const caller = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    if (!caller) {
      throw new AppException(
        SEO_LOCAL_ERRORS.BUSINESS_NOT_FOUND,
        'Business was not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    const rootId = caller.parentId ?? caller.id;
    return this.prisma.business.findMany({
      where: {
        OR: [{ id: rootId }, { parentId: rootId, active: true }],
      },
      select: { id: true, name: true, parentId: true, active: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async overview(businessId: string) {
    const locations = await this.locationsFor(businessId);
    const ids = locations.map((location) => location.id);
    if (ids.length === 0) {
      return {
        generatedAt: new Date().toISOString(),
        summary: this.emptySummary(),
        locations: [],
        disclosures: this.disclosures(),
      };
    }

    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [
      listings,
      settings,
      citations,
      reviews,
      keywords,
      latestHeatmaps,
      crawls,
    ] = await Promise.all([
      this.prisma.masterListing.findMany({
        where: { businessId: { in: ids } },
      }),
      this.prisma.listingSettings.findMany({
        where: { businessId: { in: ids } },
        select: { businessId: true, fieldMapping: true },
      }),
      this.prisma.citation.findMany({
        where: { businessId: { in: ids } },
        orderBy: [{ syncedAt: 'desc' }, { provider: 'asc' }],
      }),
      this.prisma.externalReview.groupBy({
        by: ['businessId'],
        where: { businessId: { in: ids }, createdAt: { gte: since } },
        _count: { _all: true },
        _avg: { stars: true },
      }),
      this.prisma.trackedKeyword.findMany({
        where: { businessId: { in: ids }, intent: 'local' },
        select: {
          id: true,
          businessId: true,
          keyword: true,
          intent: true,
          snapshots: {
            orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
            take: 2,
            select: { rank: true, capturedAt: true },
          },
        },
        orderBy: [{ businessId: 'asc' }, { keyword: 'asc' }],
      }),
      Promise.all(
        locations.map(async (location) => {
          const latest = await this.prisma.seoHeatmapPoint.findFirst({
            where: { businessId: location.id },
            orderBy: [{ scannedAt: 'desc' }, { id: 'desc' }],
            select: {
              businessId: true,
              scanId: true,
              keyword: true,
              scannedAt: true,
            },
          });
          return latest;
        }),
      ),
      Promise.all(
        locations.map(async (location) => {
          const latest = await this.prisma.seoAuditRun.findFirst({
            where: {
              businessId: location.id,
              status: { in: ['completed', 'partial'] },
            },
            orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
            select: {
              businessId: true,
              id: true,
              startedAt: true,
              pages: true,
            },
          });
          return latest;
        }),
      ),
    ]);

    const latestScans = latestHeatmaps.filter(
      (scan): scan is NonNullable<typeof scan> => scan !== null,
    );
    const scanPoints = latestScans.length
      ? await this.prisma.seoHeatmapPoint.findMany({
          where: {
            OR: latestScans.map(({ businessId: id, scanId }) => ({
              businessId: id,
              scanId,
            })),
          },
          orderBy: [{ businessId: 'asc' }, { scannedAt: 'asc' }, { id: 'asc' }],
        })
      : [];

    const listingById = new Map(
      listings.map((listing) => [listing.businessId, listing]),
    );
    const settingsById = new Map(settings.map((row) => [row.businessId, row]));
    const reviewsById = new Map(reviews.map((row) => [row.businessId, row]));
    const citationsById = new Map<string, typeof citations>();
    for (const citation of citations) {
      const rows = citationsById.get(citation.businessId) ?? [];
      rows.push(citation);
      citationsById.set(citation.businessId, rows);
    }
    const keywordsById = new Map<string, typeof keywords>();
    for (const keyword of keywords) {
      const rows = keywordsById.get(keyword.businessId) ?? [];
      rows.push(keyword);
      keywordsById.set(keyword.businessId, rows);
    }
    const scanById = new Map(
      latestScans.map((scan) => [scan.businessId, scan]),
    );
    const pointsByLocation = new Map<string, typeof scanPoints>();
    for (const point of scanPoints) {
      const rows = pointsByLocation.get(point.businessId) ?? [];
      rows.push(point);
      pointsByLocation.set(point.businessId, rows);
    }
    const crawlById = new Map(
      crawls.map((crawl) => [crawl?.businessId, crawl]),
    );

    const rows = locations.map((location) => {
      const listing = listingById.get(location.id) ?? null;
      const excludedByProvider = fieldExclusions(
        settingsById.get(location.id)?.fieldMapping,
      );
      const missingFields = NAP_FIELDS.filter(
        (field) => !nonEmpty(listing?.[field]),
      );
      const locationCitations = (citationsById.get(location.id) ?? []).map(
        (citation) => {
          const snapshot = record(citation.snapshot);
          const excluded = new Set(excludedByProvider[citation.provider] ?? []);
          const mismatchedFields = NAP_FIELDS.filter(
            (field) =>
              !excluded.has(field) &&
              (snapshot[field] ?? null) !== (listing?.[field] ?? null),
          );
          return {
            provider: citation.provider,
            syncedAt: citation.syncedAt,
            ageDays: Math.max(
              0,
              Math.floor(
                (Date.now() - citation.syncedAt.getTime()) / 86_400_000,
              ),
            ),
            mismatchedFields,
            status: mismatchedFields.length ? 'stale' : 'matches_snapshot',
          };
        },
      );
      const citationMismatches = locationCitations.reduce(
        (total, citation) => total + citation.mismatchedFields.length,
        0,
      );
      const reviewAggregate = reviewsById.get(location.id);
      const localKeywords = (keywordsById.get(location.id) ?? []).map(
        (keyword) => {
          const current = keyword.snapshots[0] ?? null;
          const previous = keyword.snapshots[1] ?? null;
          let movement:
            | 'improving'
            | 'declining'
            | 'unchanged'
            | 'newly_found'
            | 'not_found'
            | 'not_comparable' = 'not_comparable';
          let positionsGained: number | null = null;
          if (current && previous) {
            if (current.rank === null && previous.rank !== null)
              movement = 'not_found';
            else if (current.rank !== null && previous.rank === null)
              movement = 'newly_found';
            else if (current.rank !== null && previous.rank !== null) {
              positionsGained = previous.rank - current.rank;
              movement =
                positionsGained > 0
                  ? 'improving'
                  : positionsGained < 0
                    ? 'declining'
                    : 'unchanged';
            }
          }
          return {
            id: keyword.id,
            keyword: keyword.keyword,
            currentRank: current?.rank ?? null,
            previousRank: previous?.rank ?? null,
            positionsGained,
            movement,
            checkedAt: current?.capturedAt ?? null,
            comparedAt: previous?.capturedAt ?? null,
          };
        },
      );
      const scan = scanById.get(location.id) ?? null;
      const points = pointsByLocation.get(location.id) ?? [];
      const visiblePoints = points.filter(
        (point) => point.rank !== null,
      ).length;
      const heatmap = scan
        ? {
            scanId: scan.scanId,
            keyword: scan.keyword,
            scannedAt: scan.scannedAt,
            visiblePoints,
            totalPoints: points.length,
            sharePercent:
              points.length > 0
                ? Math.round((visiblePoints / points.length) * 1000) / 10
                : null,
          }
        : null;
      const crawl = crawlById.get(location.id) ?? null;
      const city = listing?.city?.trim() ?? '';
      const cityPages = crawl
        ? auditPages(crawl.pages)
            .filter(
              (page) =>
                page.statusCode >= 200 &&
                page.statusCode < 300 &&
                typeof page.contentType === 'string' &&
                page.contentType.toLowerCase().includes('text/html'),
            )
            .map((page) => ({
              url: page.url,
              title: page.title,
              mentionFields: mentionsCity(page, city),
            }))
            .filter((page) => page.mentionFields.length > 0)
        : [];
      const missingHours = !hasHours(listing?.hours);
      const missingCategories = categoryNames(listing?.categories).length === 0;

      return {
        businessId: location.id,
        locationName: location.name,
        listingName: listing?.name ?? null,
        city: city || null,
        address: listing
          ? [
              listing.addressLine1,
              listing.addressLine2,
              listing.city,
              listing.state,
              listing.postalCode,
              listing.country,
            ]
              .filter(nonEmpty)
              .join(', ') || null
          : null,
        listing: {
          configured: listing !== null,
          missingFields,
          missingHours,
          missingCategories,
          categories: categoryNames(listing?.categories),
          listingUrl: '/listings',
          issues:
            missingFields.length +
            Number(missingHours) +
            Number(missingCategories) +
            locationCitations.filter((citation) => citation.status === 'stale')
              .length,
        },
        citations: {
          total: locationCitations.length,
          stale: locationCitations.filter(
            (citation) => citation.status === 'stale',
          ).length,
          mismatchCount: citationMismatches,
          records: locationCitations,
          sourceNote:
            'Compared with the last successful Noxtill sync snapshot, not a live read from the directory.',
        },
        reviews90Days: {
          since: since.toISOString(),
          count: reviewAggregate?._count._all ?? 0,
          averageStars:
            reviewAggregate?._avg.stars == null
              ? null
              : Math.round(reviewAggregate._avg.stars * 10) / 10,
        },
        localKeywords: {
          tracked: localKeywords.length,
          improving: localKeywords.filter(
            (keyword) => keyword.movement === 'improving',
          ).length,
          declining: localKeywords.filter(
            (keyword) => keyword.movement === 'declining',
          ).length,
          unchanged: localKeywords.filter(
            (keyword) => keyword.movement === 'unchanged',
          ).length,
          records: localKeywords,
        },
        localPack: heatmap,
        cityMentions: {
          crawlStartedAt: crawl?.startedAt ?? null,
          pageCount: crawl ? cityPages.length : null,
          pages: cityPages,
          checkedFields: ['title', 'description', 'h1'],
        },
      };
    });

    const allReviews = rows.reduce(
      (sum, row) => sum + row.reviews90Days.count,
      0,
    );
    const weightedReviewStars = rows.reduce(
      (sum, row) =>
        sum + (row.reviews90Days.averageStars ?? 0) * row.reviews90Days.count,
      0,
    );
    const allHeatmapPoints = rows.reduce(
      (sum, row) => sum + (row.localPack?.totalPoints ?? 0),
      0,
    );
    const visibleHeatmapPoints = rows.reduce(
      (sum, row) => sum + (row.localPack?.visiblePoints ?? 0),
      0,
    );

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        locations: rows.length,
        locationsWithListingIssues: rows.filter((row) => row.listing.issues > 0)
          .length,
        missingListingFields: rows.reduce(
          (sum, row) => sum + row.listing.missingFields.length,
          0,
        ),
        staleCitations: rows.reduce((sum, row) => sum + row.citations.stale, 0),
        citationSnapshots: rows.reduce(
          (sum, row) => sum + row.citations.total,
          0,
        ),
        reviewCount90Days: allReviews,
        averageReviewStars90Days:
          allReviews > 0
            ? Math.round((weightedReviewStars / allReviews) * 10) / 10
            : null,
        localKeywords: rows.reduce(
          (sum, row) => sum + row.localKeywords.tracked,
          0,
        ),
        improvingLocalKeywords: rows.reduce(
          (sum, row) => sum + row.localKeywords.improving,
          0,
        ),
        decliningLocalKeywords: rows.reduce(
          (sum, row) => sum + row.localKeywords.declining,
          0,
        ),
        localPack: {
          visiblePoints: visibleHeatmapPoints,
          totalPoints: allHeatmapPoints,
          sharePercent:
            allHeatmapPoints > 0
              ? Math.round((visibleHeatmapPoints / allHeatmapPoints) * 1000) /
                10
              : null,
          locationsWithScan: rows.filter((row) => row.localPack !== null)
            .length,
        },
      },
      locations: rows,
      disclosures: this.disclosures(),
    };
  }

  async createLocalPageBrief(
    businessId: string,
    actorUserId: string,
    locationId: string,
  ) {
    const locations = await this.locationsFor(businessId);
    const location = locations.find((row) => row.id === locationId);
    if (!location) {
      throw new AppException(
        SEO_LOCAL_ERRORS.LOCATION_NOT_FOUND,
        'That location is not an active location in your business group.',
        HttpStatus.NOT_FOUND,
      );
    }
    const listing = await this.prisma.masterListing.findUnique({
      where: { businessId: locationId },
      select: {
        name: true,
        city: true,
        state: true,
        country: true,
        addressLine1: true,
      },
    });
    const place = [listing?.city, listing?.state, listing?.country]
      .filter(nonEmpty)
      .join(', ');
    const subject = place || listing?.name || location.name;
    const sourceNotes = [
      listing?.name ? `Canonical location name: ${listing.name}.` : null,
      place ? `Canonical service location: ${place}.` : null,
      listing?.addressLine1
        ? `Canonical street address: ${listing.addressLine1}.`
        : null,
      'Use only the supplied canonical location facts; ask the business for any other claims.',
    ]
      .filter((line): line is string => line !== null)
      .join(' ');

    return this.content.createBrief(businessId, actorUserId, {
      topic: `Local page for ${subject}`,
      intent: 'local',
      format: SeoContentFormat.location_page,
      sourceNotes,
    });
  }

  private emptySummary() {
    return {
      locations: 0,
      locationsWithListingIssues: 0,
      missingListingFields: 0,
      staleCitations: 0,
      citationSnapshots: 0,
      reviewCount90Days: 0,
      averageReviewStars90Days: null,
      localKeywords: 0,
      improvingLocalKeywords: 0,
      decliningLocalKeywords: 0,
      localPack: {
        visiblePoints: 0,
        totalPoints: 0,
        sharePercent: null,
        locationsWithScan: 0,
      },
    };
  }

  private disclosures() {
    return {
      localSchema: 'Not tracked',
      listingChanges:
        'Open Business Listings to edit canonical listing information.',
      reviews:
        'Review records remain in Reviews; this view shows aggregates only.',
      citations:
        'Citation status compares the latest successful Noxtill sync snapshot with canonical listing data; it is not a live directory check.',
      localPack:
        'Share is calculated only from saved SEO heatmap scan points. No scan means Not tracked.',
      cityMentions:
        'City mentions are checked in crawled page titles, descriptions and H1 headings; the crawler does not store full page text.',
    };
  }
}
