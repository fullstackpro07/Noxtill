import { HttpStatus, Injectable } from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { IntegrationsService } from '../integrations/integrations.service';
import {
  GoogleSearchConsoleConnector,
  type GoogleSearchConsoleProperty,
  type GoogleSearchConsoleKeywordPerformance,
  type GoogleSearchConsolePagePerformance,
  type GoogleSearchConsolePerformance,
  type GoogleSearchConsoleUrlInspection,
} from '../integrations/connectors/google-search-console.connector';

const PROVIDER = IntegrationProvider.google_search_console;
const META_PROPERTIES_KEY = 'searchConsoleProperties';
const META_SELECTED_PROPERTY_KEY = 'searchConsoleSelectedProperty';
const PERFORMANCE_WINDOW_DAYS = 28;

type IntegrationMetadata = Prisma.JsonObject & {
  [META_PROPERTIES_KEY]?: unknown;
  [META_SELECTED_PROPERTY_KEY]?: unknown;
};

function asMetadata(
  value: Prisma.JsonValue | null | undefined,
): IntegrationMetadata {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value;
}

function storedProperties(value: unknown): GoogleSearchConsoleProperty[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) return [];
    const row = candidate as Record<string, unknown>;
    return typeof row.siteUrl === 'string' &&
      row.siteUrl.length > 0 &&
      typeof row.permissionLevel === 'string'
      ? [{ siteUrl: row.siteUrl, permissionLevel: row.permissionLevel }]
      : [];
  });
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + days,
    ),
  );
}

function normalizeInspectionUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) {
    throw new AppException(
      'SEO_GSC_INSPECTION_URL_INVALID',
      'Enter a URL up to 2,048 characters.',
      HttpStatus.BAD_REQUEST,
    );
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new AppException(
      'SEO_GSC_INSPECTION_URL_INVALID',
      'Enter a fully qualified http or https URL.',
      HttpStatus.BAD_REQUEST,
    );
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new AppException(
      'SEO_GSC_INSPECTION_URL_INVALID',
      'Use a public http or https URL without credentials or a fragment.',
      HttpStatus.BAD_REQUEST,
    );
  }
  return url.href;
}

function isUrlInSearchConsoleProperty(inspectionUrl: string, siteUrl: string) {
  const inspected = new URL(inspectionUrl);
  if (siteUrl.startsWith('sc-domain:')) {
    const domain = siteUrl.slice('sc-domain:'.length).toLowerCase();
    const hostname = inspected.hostname.toLowerCase().replace(/\.$/, '');
    return (
      Boolean(domain) &&
      (hostname === domain || hostname.endsWith(`.${domain}`))
    );
  }
  let property: URL;
  try {
    property = new URL(siteUrl);
  } catch {
    return false;
  }
  if (inspected.origin !== property.origin) return false;
  const propertyPath = property.pathname.endsWith('/')
    ? property.pathname
    : `${property.pathname}/`;
  return (
    inspected.pathname === property.pathname ||
    inspected.pathname.startsWith(propertyPath)
  );
}

function displaySnapshot(snapshot: {
  id: string;
  propertyUrl: string;
  startDate: string;
  endDate: string;
  clicks: bigint | null;
  impressions: bigint | null;
  clickThroughRate: Prisma.Decimal | null;
  averagePosition: Prisma.Decimal | null;
  dataState: string;
  fetchedAt: Date;
}) {
  return {
    id: snapshot.id,
    propertyUrl: snapshot.propertyUrl,
    startDate: snapshot.startDate,
    endDate: snapshot.endDate,
    clicks: snapshot.clicks?.toString() ?? null,
    impressions: snapshot.impressions?.toString() ?? null,
    clickThroughRate: snapshot.clickThroughRate?.toNumber() ?? null,
    averagePosition: snapshot.averagePosition?.toNumber() ?? null,
    dataState: snapshot.dataState,
    fetchedAt: snapshot.fetchedAt,
  };
}

function normalizeTrackedKeyword(value: string) {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function aggregateTrackedKeywordRows(
  rows: GoogleSearchConsoleKeywordPerformance[],
  trackedKeywords: Array<{ id: string; keyword: string }>,
) {
  const trackedByKey = new Map<
    string,
    Array<{ id: string; keyword: string }>
  >();
  for (const tracked of trackedKeywords) {
    const key = normalizeTrackedKeyword(tracked.keyword);
    const current = trackedByKey.get(key) ?? [];
    current.push(tracked);
    trackedByKey.set(key, current);
  }
  const aggregates = new Map<
    string,
    { clicks: bigint; impressions: bigint; weightedPosition: number }
  >();
  for (const row of rows) {
    const matches = trackedByKey.get(normalizeTrackedKeyword(row.query)) ?? [];
    for (const tracked of matches) {
      const current = aggregates.get(tracked.id) ?? {
        clicks: 0n,
        impressions: 0n,
        weightedPosition: 0,
      };
      const impressions = BigInt(row.impressions);
      current.clicks += BigInt(row.clicks);
      current.impressions += impressions;
      current.weightedPosition += row.averagePosition * Number(impressions);
      aggregates.set(tracked.id, current);
    }
  }
  return aggregates;
}

@Injectable()
export class SeoSearchConsoleService {
  private readonly connector: GoogleSearchConsoleConnector;

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    connectors: ConnectorRegistry,
  ) {
    this.connector = connectors.get(PROVIDER) as GoogleSearchConsoleConnector;
  }

  async summary(businessId: string) {
    const integration = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider: PROVIDER } },
      select: { status: true, meta: true, lastSyncAt: true },
    });
    const metadata = asMetadata(integration?.meta);
    const selectedProperty =
      typeof metadata[META_SELECTED_PROPERTY_KEY] === 'string'
        ? metadata[META_SELECTED_PROPERTY_KEY]
        : null;
    const snapshots = selectedProperty
      ? await this.tenantPrisma.client.seoSearchConsoleSnapshot.findMany({
          where: {
            businessId,
            propertyHash: this.propertyHash(selectedProperty),
          },
          orderBy: [{ endDate: 'desc' }, { fetchedAt: 'desc' }],
          take: 4,
        })
      : [];
    const latestByWindow = new Map<string, (typeof snapshots)[number]>();
    for (const snapshot of snapshots) {
      if (!latestByWindow.has(`${snapshot.startDate}:${snapshot.endDate}`)) {
        latestByWindow.set(
          `${snapshot.startDate}:${snapshot.endDate}`,
          snapshot,
        );
      }
    }

    return {
      status: integration?.status ?? IntegrationStatus.not_connected,
      properties: storedProperties(metadata[META_PROPERTIES_KEY]),
      selectedProperty,
      lastPropertyRefreshAt:
        typeof metadata.searchConsolePropertiesRefreshedAt === 'string'
          ? metadata.searchConsolePropertiesRefreshedAt
          : null,
      lastSyncAt: integration?.lastSyncAt ?? null,
      snapshots: [...latestByWindow.values()].slice(0, 2).map(displaySnapshot),
      windowDays: PERFORMANCE_WINDOW_DAYS,
    };
  }

  async keywordPerformanceSummary(businessId: string) {
    const integration = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider: PROVIDER } },
      select: { status: true, meta: true },
    });
    const metadata = asMetadata(integration?.meta);
    const selectedProperty =
      typeof metadata[META_SELECTED_PROPERTY_KEY] === 'string'
        ? metadata[META_SELECTED_PROPERTY_KEY]
        : null;
    const trackedKeywords =
      await this.tenantPrisma.client.trackedKeyword.findMany({
        where: { businessId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, keyword: true },
      });
    const snapshots = selectedProperty
      ? await this.tenantPrisma.client.seoSearchConsoleKeywordSnapshot.findMany(
          {
            where: {
              businessId,
              propertyHash: this.propertyHash(selectedProperty),
              keywordId: { in: trackedKeywords.map((keyword) => keyword.id) },
            },
            orderBy: [{ endDate: 'desc' }, { fetchedAt: 'desc' }],
            take: trackedKeywords.length * 2,
          },
        )
      : [];
    const byKeyword = new Map<string, typeof snapshots>();
    for (const snapshot of snapshots) {
      const current = byKeyword.get(snapshot.keywordId) ?? [];
      if (current.length < 2) current.push(snapshot);
      byKeyword.set(snapshot.keywordId, current);
    }
    const windows = trackedKeywords.map((keyword) => ({
      id: keyword.id,
      keyword: keyword.keyword,
      snapshots: (byKeyword.get(keyword.id) ?? []).map((snapshot) => ({
        id: snapshot.id,
        startDate: snapshot.startDate,
        endDate: snapshot.endDate,
        clicks: snapshot.clicks?.toString() ?? null,
        impressions: snapshot.impressions?.toString() ?? null,
        clickThroughRate: snapshot.clickThroughRate?.toNumber() ?? null,
        averagePosition: snapshot.averagePosition?.toNumber() ?? null,
        dataState: snapshot.dataState,
        fetchedAt: snapshot.fetchedAt,
      })),
    }));
    const latestWindowEnd = Math.max(
      0,
      ...snapshots.map((snapshot) =>
        Date.parse(`${snapshot.endDate}T00:00:00Z`),
      ),
    );
    const latestWindow = snapshots.filter(
      (snapshot) =>
        Date.parse(`${snapshot.endDate}T00:00:00Z`) === latestWindowEnd,
    );
    return {
      status: integration?.status ?? IntegrationStatus.not_connected,
      selectedProperty,
      trackedKeywordCount: trackedKeywords.length,
      latestWindowEnd: latestWindowEnd
        ? new Date(latestWindowEnd).toISOString().slice(0, 10)
        : null,
      matchedKeywordCount: latestWindow.filter(
        (snapshot) => snapshot.dataState === 'final',
      ).length,
      notReportedKeywordCount: latestWindow.filter(
        (snapshot) => snapshot.dataState === 'not_returned',
      ).length,
      windows,
    };
  }

  async inspectUrl(businessId: string, requestedUrl: string) {
    const integration = await this.requireConnectedIntegration(businessId);
    const metadata = asMetadata(integration.meta);
    const selectedProperty = metadata[META_SELECTED_PROPERTY_KEY];
    if (typeof selectedProperty !== 'string' || !selectedProperty) {
      throw new AppException(
        'SEO_GSC_PROPERTY_NOT_SELECTED',
        'Choose a Search Console property in SEO Settings before inspecting a URL.',
        HttpStatus.CONFLICT,
      );
    }
    const inspectionUrl = normalizeInspectionUrl(requestedUrl);
    if (!isUrlInSearchConsoleProperty(inspectionUrl, selectedProperty)) {
      throw new AppException(
        'SEO_GSC_INSPECTION_URL_OUTSIDE_PROPERTY',
        'The URL must belong to the selected Search Console property.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const tokens = await this.freshTokens(businessId);
    const properties = await this.fetchProperties(tokens);
    if (!properties.some((property) => property.siteUrl === selectedProperty)) {
      throw new AppException(
        'SEO_GSC_PROPERTY_NOT_ACCESSIBLE',
        'The selected Search Console property is no longer available. Choose an accessible property.',
        HttpStatus.CONFLICT,
      );
    }
    let result: GoogleSearchConsoleUrlInspection;
    try {
      result = await this.connector.inspectUrl(
        tokens,
        selectedProperty,
        inspectionUrl,
      );
    } catch {
      throw new AppException(
        'SEO_GSC_URL_INSPECTION_FAILED',
        'Google Search Console could not inspect this URL. Check that URL Inspection API access is enabled for the connected account and property.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    const windowEnd = addDays(
      new Date(
        `${dateInTimeZone(new Date(), 'America/Los_Angeles')}T00:00:00.000Z`,
      ),
      -1,
    );
    const windowStart = addDays(windowEnd, -(PERFORMANCE_WINDOW_DAYS - 1));
    const performanceWindow = {
      startDate: isoDate(windowStart),
      endDate: isoDate(windowEnd),
    };
    let pageMetrics: GoogleSearchConsolePagePerformance | null = null;
    let pageMetricsUnavailable = false;
    try {
      pageMetrics = await this.connector.queryPagePerformance(
        tokens,
        selectedProperty,
        inspectionUrl,
        performanceWindow.startDate,
        performanceWindow.endDate,
      );
    } catch {
      pageMetricsUnavailable = true;
    }
    return {
      ...result,
      propertyUrl: selectedProperty,
      inspectionUrl,
      inspectedAt: new Date(),
      source: 'google_search_console_index',
      searchPerformance: {
        status: pageMetricsUnavailable
          ? 'unavailable'
          : pageMetrics
            ? 'final'
            : 'no_data_returned',
        ...performanceWindow,
        pageUrl: pageMetrics?.pageUrl ?? null,
        clicks: pageMetrics?.clicks ?? null,
        impressions: pageMetrics?.impressions ?? null,
        clickThroughRate: pageMetrics?.clickThroughRate ?? null,
        averagePosition: pageMetrics?.averagePosition ?? null,
      },
      searchPerformanceDisclosure:
        'Final Google web-search performance for this page over the shown dates. Clicks and impressions are not visits, conversions, orders or revenue attribution.',
      disclosure:
        'This is Google’s stored index version, not a live-page test. It does not request indexing or confirm a recent change.',
    };
  }

  async refreshProperties(businessId: string) {
    const integration = await this.requireConnectedIntegration(businessId);
    const tokens = await this.freshTokens(businessId);
    const properties = await this.fetchProperties(tokens);
    const metadata = asMetadata(integration.meta);
    const refreshedAt = new Date();
    await this.tenantPrisma.client.integration.update({
      where: { businessId_provider: { businessId, provider: PROVIDER } },
      data: {
        meta: {
          ...metadata,
          [META_PROPERTIES_KEY]: properties,
          searchConsolePropertiesRefreshedAt: refreshedAt.toISOString(),
        },
      },
    });
    return { id: businessId, properties, refreshedAt };
  }

  async selectProperty(businessId: string, siteUrl: string) {
    const integration = await this.requireConnectedIntegration(businessId);
    const tokens = await this.freshTokens(businessId);
    const properties = await this.fetchProperties(tokens);
    if (!properties.some((property) => property.siteUrl === siteUrl)) {
      throw new AppException(
        'SEO_GSC_PROPERTY_NOT_ACCESSIBLE',
        'That Search Console property is not available to the connected Google account.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const metadata = asMetadata(integration.meta);
    const refreshedAt = new Date();
    await this.tenantPrisma.client.integration.update({
      where: { businessId_provider: { businessId, provider: PROVIDER } },
      data: {
        meta: {
          ...metadata,
          [META_PROPERTIES_KEY]: properties,
          [META_SELECTED_PROPERTY_KEY]: siteUrl,
          searchConsolePropertiesRefreshedAt: refreshedAt.toISOString(),
        },
      },
    });
    return {
      id: businessId,
      selectedProperty: siteUrl,
      availableProperties: properties.length,
    };
  }

  async syncPerformance(businessId: string) {
    const integration = await this.requireConnectedIntegration(businessId);
    const metadata = asMetadata(integration.meta);
    const selectedProperty = metadata[META_SELECTED_PROPERTY_KEY];
    if (typeof selectedProperty !== 'string' || !selectedProperty) {
      throw new AppException(
        'SEO_GSC_PROPERTY_NOT_SELECTED',
        'Choose an accessible Search Console property before syncing performance.',
        HttpStatus.CONFLICT,
      );
    }

    const tokens = await this.freshTokens(businessId);
    const trackedKeywords =
      await this.tenantPrisma.client.trackedKeyword.findMany({
        where: { businessId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, keyword: true },
      });
    const properties = await this.fetchProperties(tokens);
    if (!properties.some((property) => property.siteUrl === selectedProperty)) {
      throw new AppException(
        'SEO_GSC_PROPERTY_NOT_ACCESSIBLE',
        'The selected Search Console property is no longer available. Choose an accessible property.',
        HttpStatus.CONFLICT,
      );
    }

    // Search Console's date boundaries are Pacific Time, not the server's timezone.
    const pacificToday = new Date(
      `${dateInTimeZone(new Date(), 'America/Los_Angeles')}T00:00:00.000Z`,
    );
    const currentEnd = addDays(pacificToday, -1);
    const currentStart = addDays(currentEnd, -(PERFORMANCE_WINDOW_DAYS - 1));
    const previousEnd = addDays(currentStart, -1);
    const previousStart = addDays(previousEnd, -(PERFORMANCE_WINDOW_DAYS - 1));
    const windows = [
      { startDate: isoDate(currentStart), endDate: isoDate(currentEnd) },
      { startDate: isoDate(previousStart), endDate: isoDate(previousEnd) },
    ];

    let metricsByWindow: (GoogleSearchConsolePerformance | null)[];
    let keywordMetricsByWindow: GoogleSearchConsoleKeywordPerformance[][];
    try {
      const [propertyMetrics, keywordMetrics] = await Promise.all([
        Promise.all(
          windows.map((window) =>
            this.connector.queryPropertyPerformance(
              tokens,
              selectedProperty,
              window.startDate,
              window.endDate,
            ),
          ),
        ),
        trackedKeywords.length
          ? Promise.all(
              windows.map((window) =>
                this.connector.queryKeywordPerformance(
                  tokens,
                  selectedProperty,
                  window.startDate,
                  window.endDate,
                ),
              ),
            )
          : Promise.resolve(windows.map(() => [])),
      ]);
      metricsByWindow = propertyMetrics;
      keywordMetricsByWindow = keywordMetrics;
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(
        'SEO_GSC_PROVIDER_REQUEST_FAILED',
        'Google Search Console could not return performance data. Check the connection and API access, then try again.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    let results: Array<{
      startDate: string;
      endDate: string;
      snapshot: ReturnType<typeof displaySnapshot>;
    }>;
    try {
      results = await this.tenantPrisma.client.$transaction(async (tx) =>
        Promise.all(
          windows.map(async (window, index) => {
            const metrics = metricsByWindow[index];
            const propertyHash = this.propertyHash(selectedProperty);
            const snapshot = await tx.seoSearchConsoleSnapshot.upsert({
              where: {
                businessId_propertyHash_startDate_endDate: {
                  businessId,
                  propertyHash,
                  startDate: window.startDate,
                  endDate: window.endDate,
                },
              },
              create: {
                businessId,
                propertyUrl: selectedProperty,
                propertyHash,
                ...window,
                clicks: metrics ? BigInt(metrics.clicks) : null,
                impressions: metrics ? BigInt(metrics.impressions) : null,
                clickThroughRate: metrics
                  ? new Prisma.Decimal(metrics.clickThroughRate)
                  : null,
                averagePosition: metrics
                  ? new Prisma.Decimal(metrics.averagePosition)
                  : null,
                dataState: metrics ? 'final' : 'no_data_returned',
              },
              update: {
                clicks: metrics ? BigInt(metrics.clicks) : null,
                impressions: metrics ? BigInt(metrics.impressions) : null,
                clickThroughRate: metrics
                  ? new Prisma.Decimal(metrics.clickThroughRate)
                  : null,
                averagePosition: metrics
                  ? new Prisma.Decimal(metrics.averagePosition)
                  : null,
                dataState: metrics ? 'final' : 'no_data_returned',
                fetchedAt: new Date(),
              },
            });
            const keywordAggregates = aggregateTrackedKeywordRows(
              keywordMetricsByWindow[index] ?? [],
              trackedKeywords,
            );
            await Promise.all(
              trackedKeywords.map((keyword) => {
                const aggregate = keywordAggregates.get(keyword.id);
                return tx.seoSearchConsoleKeywordSnapshot.upsert({
                  where: {
                    businessId_keywordId_propertyHash_startDate_endDate: {
                      businessId,
                      keywordId: keyword.id,
                      propertyHash,
                      startDate: window.startDate,
                      endDate: window.endDate,
                    },
                  },
                  create: {
                    businessId,
                    keywordId: keyword.id,
                    propertyHash,
                    ...window,
                    clicks: aggregate?.clicks ?? null,
                    impressions: aggregate?.impressions ?? null,
                    clickThroughRate:
                      aggregate && aggregate.impressions > 0n
                        ? new Prisma.Decimal(
                            Number(aggregate.clicks) /
                              Number(aggregate.impressions),
                          )
                        : null,
                    averagePosition:
                      aggregate && aggregate.impressions > 0n
                        ? new Prisma.Decimal(
                            aggregate.weightedPosition /
                              Number(aggregate.impressions),
                          )
                        : null,
                    dataState: aggregate ? 'final' : 'not_returned',
                  },
                  update: {
                    clicks: aggregate?.clicks ?? null,
                    impressions: aggregate?.impressions ?? null,
                    clickThroughRate:
                      aggregate && aggregate.impressions > 0n
                        ? new Prisma.Decimal(
                            Number(aggregate.clicks) /
                              Number(aggregate.impressions),
                          )
                        : null,
                    averagePosition:
                      aggregate && aggregate.impressions > 0n
                        ? new Prisma.Decimal(
                            aggregate.weightedPosition /
                              Number(aggregate.impressions),
                          )
                        : null,
                    dataState: aggregate ? 'final' : 'not_returned',
                    fetchedAt: new Date(),
                  },
                });
              }),
            );
            return {
              ...window,
              snapshot: displaySnapshot(snapshot),
              matchedTrackedKeywords: keywordAggregates.size,
              trackedKeywords: trackedKeywords.length,
            };
          }),
        ),
      );
    } catch {
      throw new AppException(
        'SEO_GSC_SNAPSHOT_SAVE_FAILED',
        'Search Console returned data, but Noxtill could not save the snapshot. Try again.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const fetchedAt = new Date();
    await this.tenantPrisma.client.integration.update({
      where: { businessId_provider: { businessId, provider: PROVIDER } },
      data: { lastSyncAt: fetchedAt },
    });
    return { id: businessId, selectedProperty, fetchedAt, windows: results };
  }

  private async requireConnectedIntegration(businessId: string) {
    const integration = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider: PROVIDER } },
      select: { status: true, meta: true },
    });
    if (integration?.status !== IntegrationStatus.connected) {
      throw new AppException(
        'SEO_GSC_NOT_CONNECTED',
        'Connect Google Search Console from Integrations before using search performance.',
        HttpStatus.CONFLICT,
      );
    }
    return integration;
  }

  private async freshTokens(businessId: string) {
    const tokens = await this.integrations.getFreshTokens(businessId, PROVIDER);
    if (!tokens) {
      throw new AppException(
        'SEO_GSC_NOT_CONNECTED',
        'Connect Google Search Console from Integrations before using search performance.',
        HttpStatus.CONFLICT,
      );
    }
    return tokens;
  }

  private async fetchProperties(
    tokens: Awaited<ReturnType<typeof this.freshTokens>>,
  ) {
    try {
      return await this.connector.sync(tokens);
    } catch {
      throw new AppException(
        'SEO_GSC_PROPERTY_LIST_FAILED',
        'Google Search Console could not list properties for this account. Check the connection and API access.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private propertyHash(siteUrl: string): string {
    return createHash('sha256').update(siteUrl).digest('hex');
  }
}
