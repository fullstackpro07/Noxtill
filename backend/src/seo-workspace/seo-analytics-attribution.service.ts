import { HttpStatus, Injectable } from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus, Prisma } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { IntegrationsService } from '../integrations/integrations.service';
import {
  GoogleAnalyticsConnector,
  type GoogleAnalyticsOrganicMetrics,
  type GoogleAnalyticsLandingPagesResult,
  type GoogleAnalyticsProperty,
  type GoogleAnalyticsPropertyDetails,
} from '../integrations/connectors/google-analytics.connector';

const PROVIDER = IntegrationProvider.google_analytics;
const PROPERTIES_KEY = 'analyticsProperties';
const SELECTED_PROPERTY_KEY = 'analyticsSelectedProperty';
const PROPERTY_REFRESHED_AT_KEY = 'analyticsPropertiesRefreshedAt';
const SNAPSHOT_KEY = 'analyticsOrganicSearchSnapshot';
const WINDOW_DAYS = 28;

type AnalyticsSnapshotWindow = {
  startDate: string;
  endDate: string;
  dataState: 'returned' | 'no_data_returned';
  sessions: string | null;
  keyEvents: string | null;
  totalRevenue: string | null;
  landingPages: AnalyticsLandingPagesSnapshot | null;
};

type AnalyticsLandingPagesSnapshot = GoogleAnalyticsLandingPagesResult & {
  dataState: 'returned' | 'no_data_returned' | 'not_available';
  reason: string | null;
};

export type SeoAnalyticsAttributionSnapshot = {
  property: string;
  propertyName: string;
  currencyCode: string | null;
  timeZone: string | null;
  windowDays: number;
  current: AnalyticsSnapshotWindow;
  comparison: AnalyticsSnapshotWindow;
  fetchedAt: string;
  disclosure: string;
};

type Metadata = Prisma.InputJsonObject;

function asMetadata(value: Prisma.JsonValue | null | undefined): Metadata {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value;
}

function storedProperties(value: unknown): GoogleAnalyticsProperty[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (typeof candidate !== 'object' || candidate === null) return [];
    const row = candidate as Record<string, unknown>;
    if (
      typeof row.property !== 'string' ||
      !/^properties\/\d{1,32}$/.test(row.property) ||
      typeof row.displayName !== 'string' ||
      typeof row.account !== 'string' ||
      typeof row.accountDisplayName !== 'string'
    ) {
      return [];
    }
    return [
      {
        property: row.property,
        displayName: row.displayName,
        propertyType:
          typeof row.propertyType === 'string' ? row.propertyType : null,
        account: row.account,
        accountDisplayName: row.accountDisplayName,
      },
    ];
  });
}

function storedSnapshot(
  value: unknown,
): SeoAnalyticsAttributionSnapshot | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const window = (candidate: unknown): AnalyticsSnapshotWindow | null => {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      return null;
    }
    const fields = candidate as Record<string, unknown>;
    if (
      typeof fields.startDate !== 'string' ||
      typeof fields.endDate !== 'string' ||
      !['returned', 'no_data_returned'].includes(String(fields.dataState))
    ) {
      return null;
    }
    const metric = (field: unknown) =>
      typeof field === 'string' && /^-?\d+(?:\.\d+)?$/.test(field)
        ? field
        : null;
    const landingPages = (
      field: unknown,
    ): AnalyticsLandingPagesSnapshot | null => {
      if (typeof field !== 'object' || field === null || Array.isArray(field)) {
        return null;
      }
      const value = field as Record<string, unknown>;
      if (
        !['returned', 'no_data_returned', 'not_available'].includes(
          String(value.dataState),
        ) ||
        !Array.isArray(value.rows)
      ) {
        return null;
      }
      const rows = value.rows.flatMap((candidate) => {
        if (
          typeof candidate !== 'object' ||
          candidate === null ||
          Array.isArray(candidate)
        )
          return [];
        const row = candidate as Record<string, unknown>;
        if (
          typeof row.landingPage !== 'string' ||
          row.landingPage.length > 2_048
        )
          return [];
        return [
          {
            landingPage: row.landingPage,
            sessions: metric(row.sessions),
            keyEvents: metric(row.keyEvents),
            totalRevenue: metric(row.totalRevenue),
          },
        ];
      });
      return {
        dataState:
          value.dataState as AnalyticsLandingPagesSnapshot['dataState'],
        rows,
        totalRows:
          typeof value.totalRows === 'number' &&
          Number.isSafeInteger(value.totalRows) &&
          value.totalRows >= 0
            ? value.totalRows
            : null,
        truncated: value.truncated === true,
        reason:
          typeof value.reason === 'string' ? value.reason.slice(0, 300) : null,
      };
    };
    return {
      startDate: fields.startDate,
      endDate: fields.endDate,
      dataState: fields.dataState as AnalyticsSnapshotWindow['dataState'],
      sessions: metric(fields.sessions),
      keyEvents: metric(fields.keyEvents),
      totalRevenue: metric(fields.totalRevenue),
      landingPages: landingPages(fields.landingPages),
    };
  };
  const current = window(row.current);
  const comparison = window(row.comparison);
  if (
    typeof row.property !== 'string' ||
    !/^properties\/\d{1,32}$/.test(row.property) ||
    typeof row.propertyName !== 'string' ||
    !current ||
    !comparison ||
    typeof row.fetchedAt !== 'string'
  ) {
    return null;
  }
  return {
    property: row.property,
    propertyName: row.propertyName,
    currencyCode:
      typeof row.currencyCode === 'string' &&
      /^[A-Z]{3}$/.test(row.currencyCode)
        ? row.currencyCode
        : null,
    timeZone: typeof row.timeZone === 'string' ? row.timeZone : null,
    windowDays: WINDOW_DAYS,
    current,
    comparison,
    fetchedAt: row.fetchedAt,
    disclosure:
      typeof row.disclosure === 'string'
        ? row.disclosure
        : 'These are Google Analytics-reported Organic Search values. GA4 attribution settings apply; the values do not prove that a Noxtill or SEO change caused an outcome.',
  };
}

function safeTimeZone(value: string | null): string {
  if (!value) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return 'UTC';
  }
}

function dateInTimeZone(date: Date, timeZone: string): Date {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)),
  );
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

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function windowFrom(
  startDate: Date,
  endDate: Date,
  metrics: GoogleAnalyticsOrganicMetrics | null,
  landingPages: GoogleAnalyticsLandingPagesResult | null,
): AnalyticsSnapshotWindow {
  const landingPagesSnapshot: AnalyticsLandingPagesSnapshot = landingPages
    ? {
        ...landingPages,
        dataState:
          landingPages.rows.length > 0 ? 'returned' : 'no_data_returned',
        reason: null,
      }
    : {
        rows: [],
        totalRows: null,
        truncated: false,
        dataState: 'not_available',
        reason:
          'Google Analytics did not return a landing-page report on the latest sync.',
      };
  return {
    startDate: isoDate(startDate),
    endDate: isoDate(endDate),
    dataState: metrics ? 'returned' : 'no_data_returned',
    sessions: metrics?.sessions ?? null,
    keyEvents: metrics?.keyEvents ?? null,
    totalRevenue: metrics?.totalRevenue ?? null,
    landingPages: landingPagesSnapshot,
  };
}

@Injectable()
export class SeoAnalyticsAttributionService {
  private readonly connector: GoogleAnalyticsConnector;

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    connectors: ConnectorRegistry,
  ) {
    this.connector = connectors.get(PROVIDER) as GoogleAnalyticsConnector;
  }

  async summary(businessId: string) {
    const integration = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider: PROVIDER } },
      select: { status: true, meta: true, lastSyncAt: true },
    });
    const metadata = asMetadata(integration?.meta);
    const connected = integration?.status === IntegrationStatus.connected;
    return {
      status: integration?.status ?? IntegrationStatus.not_connected,
      properties: connected ? storedProperties(metadata[PROPERTIES_KEY]) : [],
      selectedProperty:
        connected && typeof metadata[SELECTED_PROPERTY_KEY] === 'string'
          ? metadata[SELECTED_PROPERTY_KEY]
          : null,
      lastPropertyRefreshAt:
        connected && typeof metadata[PROPERTY_REFRESHED_AT_KEY] === 'string'
          ? metadata[PROPERTY_REFRESHED_AT_KEY]
          : null,
      lastSyncAt: integration?.lastSyncAt ?? null,
      snapshot: connected ? storedSnapshot(metadata[SNAPSHOT_KEY]) : null,
      windowDays: WINDOW_DAYS,
      disclosure:
        'Organic Search is the Google Analytics session channel group. Key events and GA4 totalRevenue follow property reporting and attribution settings; totalRevenue may include purchase, subscription and advertising revenue less refunds. These values do not prove an SEO change caused an outcome or reconcile to Noxtill sales.',
    };
  }

  async refreshProperties(businessId: string) {
    const integration = await this.requireConnected(businessId);
    const tokens = await this.freshTokens(businessId);
    let properties: GoogleAnalyticsProperty[];
    try {
      properties = await this.connector.sync(tokens);
    } catch {
      throw new AppException(
        'SEO_GA4_PROPERTIES_REFRESH_FAILED',
        'Google Analytics properties could not be loaded. Check Analytics Admin API access for the connected Google account.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    const refreshedAt = new Date();
    const metadata = asMetadata(integration.meta);
    await this.saveMetadata(businessId, {
      ...metadata,
      [PROPERTIES_KEY]: properties as unknown as Prisma.InputJsonValue,
      [PROPERTY_REFRESHED_AT_KEY]: refreshedAt.toISOString(),
    });
    return { properties, refreshedAt };
  }

  async selectProperty(businessId: string, property: string) {
    const integration = await this.requireConnected(businessId);
    const tokens = await this.freshTokens(businessId);
    let properties: GoogleAnalyticsProperty[];
    try {
      properties = await this.connector.sync(tokens);
    } catch {
      throw new AppException(
        'SEO_GA4_PROPERTIES_REFRESH_FAILED',
        'Google Analytics properties could not be checked. Refresh and try again.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    if (!properties.some((candidate) => candidate.property === property)) {
      throw new AppException(
        'SEO_GA4_PROPERTY_NOT_ACCESSIBLE',
        'That Google Analytics property is not accessible to the connected Google account.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const metadata = asMetadata(integration.meta);
    const refreshedAt = new Date();
    await this.saveMetadata(businessId, {
      ...metadata,
      [PROPERTIES_KEY]: properties as unknown as Prisma.InputJsonValue,
      [SELECTED_PROPERTY_KEY]: property,
      [PROPERTY_REFRESHED_AT_KEY]: refreshedAt.toISOString(),
      [SNAPSHOT_KEY]: null,
    });
    return {
      selectedProperty: property,
      availableProperties: properties.length,
    };
  }

  async syncOrganicSearch(businessId: string) {
    const integration = await this.requireConnected(businessId);
    const metadata = asMetadata(integration.meta);
    const selectedProperty = metadata[SELECTED_PROPERTY_KEY];
    if (
      typeof selectedProperty !== 'string' ||
      !/^properties\/\d{1,32}$/.test(selectedProperty)
    ) {
      throw new AppException(
        'SEO_GA4_PROPERTY_NOT_SELECTED',
        'Choose a Google Analytics property in SEO Settings before syncing attribution.',
        HttpStatus.CONFLICT,
      );
    }
    const tokens = await this.freshTokens(businessId);
    let properties: GoogleAnalyticsProperty[];
    let details: GoogleAnalyticsPropertyDetails;
    try {
      properties = await this.connector.sync(tokens);
      const selected = properties.find(
        (property) => property.property === selectedProperty,
      );
      if (!selected) {
        throw new AppException(
          'SEO_GA4_PROPERTY_NOT_ACCESSIBLE',
          'The selected Google Analytics property is no longer accessible. Select an available property.',
          HttpStatus.CONFLICT,
        );
      }
      details = await this.connector.getPropertyDetails(
        tokens,
        selectedProperty,
      );
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException(
        'SEO_GA4_PROPERTY_READ_FAILED',
        'Google Analytics could not read the selected property. Check access and reconnect if needed.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const propertyTimeZone = safeTimeZone(details.timeZone);
    const localToday = dateInTimeZone(new Date(), propertyTimeZone);
    const currentEnd = addDays(localToday, -1);
    const currentStart = addDays(currentEnd, -(WINDOW_DAYS - 1));
    const comparisonEnd = addDays(currentStart, -1);
    const comparisonStart = addDays(comparisonEnd, -(WINDOW_DAYS - 1));
    let currentMetrics: GoogleAnalyticsOrganicMetrics | null;
    let comparisonMetrics: GoogleAnalyticsOrganicMetrics | null;
    try {
      [currentMetrics, comparisonMetrics] = await Promise.all([
        this.connector.queryOrganicSearch(
          tokens,
          selectedProperty,
          isoDate(currentStart),
          isoDate(currentEnd),
        ),
        this.connector.queryOrganicSearch(
          tokens,
          selectedProperty,
          isoDate(comparisonStart),
          isoDate(comparisonEnd),
        ),
      ]);
    } catch {
      throw new AppException(
        'SEO_GA4_REPORT_FAILED',
        'Google Analytics could not return Organic Search metrics. Check that the Analytics Data API is enabled and the account can read this property.',
        HttpStatus.BAD_GATEWAY,
      );
    }

    const landingPageResults = await Promise.allSettled([
      this.connector.queryOrganicSearchLandingPages(
        tokens,
        selectedProperty,
        isoDate(currentStart),
        isoDate(currentEnd),
      ),
      this.connector.queryOrganicSearchLandingPages(
        tokens,
        selectedProperty,
        isoDate(comparisonStart),
        isoDate(comparisonEnd),
      ),
    ]);
    const currentLandingPages =
      landingPageResults[0].status === 'fulfilled'
        ? landingPageResults[0].value
        : null;
    const comparisonLandingPages =
      landingPageResults[1].status === 'fulfilled'
        ? landingPageResults[1].value
        : null;

    const fetchedAt = new Date();
    const snapshot: SeoAnalyticsAttributionSnapshot = {
      property: selectedProperty,
      propertyName: details.displayName,
      currencyCode: details.currencyCode,
      timeZone: details.timeZone,
      windowDays: WINDOW_DAYS,
      current: windowFrom(
        currentStart,
        currentEnd,
        currentMetrics,
        currentLandingPages,
      ),
      comparison: windowFrom(
        comparisonStart,
        comparisonEnd,
        comparisonMetrics,
        comparisonLandingPages,
      ),
      fetchedAt: fetchedAt.toISOString(),
      disclosure:
        'Organic Search sessions, key events and total revenue are values reported by this GA4 property. GA4 totalRevenue may include purchase, subscription and advertising revenue less refunds. Key events and revenue follow property reporting and attribution settings; comparison does not show that SEO work caused a change or reconcile to Noxtill sales. Google may revise recent reporting data.',
    };
    await this.saveMetadata(businessId, {
      ...metadata,
      [SNAPSHOT_KEY]: snapshot as unknown as Prisma.InputJsonValue,
      analyticsCurrencyCode: details.currencyCode,
    });
    await this.tenantPrisma.client.integration.updateMany({
      where: {
        businessId,
        provider: PROVIDER,
        status: IntegrationStatus.connected,
      },
      data: { lastSyncAt: fetchedAt },
    });
    return this.summary(businessId);
  }

  async agentEvidence(businessId: string, includeIntegrationData = true) {
    if (!includeIntegrationData) {
      return {
        status: 'not_evaluated' as const,
        property: null,
        propertyName: null,
        currencyCode: null,
        windowDays: WINDOW_DAYS,
        current: null,
        comparison: null,
        landingPages: null,
        fetchedAt: null,
        disclosure:
          'Google Analytics evidence was not read because Integrations is disabled for this business.',
        unavailableReason:
          'Not evaluated because the Integrations module is disabled.',
      };
    }
    const current = await this.summary(businessId);
    const connected = current.status === IntegrationStatus.connected;
    const snapshot = connected ? current.snapshot : null;
    return {
      status: current.status,
      property: snapshot?.property ?? current.selectedProperty,
      propertyName: snapshot?.propertyName ?? null,
      currencyCode: snapshot?.currencyCode ?? null,
      windowDays: WINDOW_DAYS,
      current: snapshot?.current ?? null,
      comparison: snapshot?.comparison ?? null,
      landingPages: snapshot?.current.landingPages ?? null,
      fetchedAt: snapshot?.fetchedAt ?? null,
      disclosure: current.disclosure,
      unavailableReason: !connected
        ? 'Google Analytics is not connected.'
        : !current.selectedProperty
          ? 'No Google Analytics property is selected.'
          : !snapshot
            ? 'No Organic Search snapshot has been synced.'
            : null,
    };
  }

  private async requireConnected(businessId: string) {
    const integration = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider: PROVIDER } },
      select: { status: true, meta: true },
    });
    if (integration?.status !== IntegrationStatus.connected) {
      throw new AppException(
        'SEO_GA4_NOT_CONNECTED',
        'Connect Google Analytics 4 in Integrations before using analytics attribution.',
        HttpStatus.CONFLICT,
      );
    }
    return integration;
  }

  private async freshTokens(businessId: string) {
    const tokens = await this.integrations.getFreshTokens(businessId, PROVIDER);
    if (!tokens) {
      throw new AppException(
        'SEO_GA4_TOKENS_UNAVAILABLE',
        'Google Analytics credentials are unavailable. Reconnect the integration.',
        HttpStatus.CONFLICT,
      );
    }
    return tokens;
  }

  private async saveMetadata(businessId: string, metadata: Metadata) {
    await this.tenantPrisma.client.integration.updateMany({
      where: {
        businessId,
        provider: PROVIDER,
        status: IntegrationStatus.connected,
      },
      data: { meta: metadata },
    });
  }
}
