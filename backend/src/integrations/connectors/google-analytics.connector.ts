import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegrationProvider } from '@prisma/client';
import axios from 'axios';
import { OAuthTokens } from '../connector.interface';
import { GoogleOAuth2Connector } from './google-oauth2.connector';

const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta';
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';
const MAX_PROPERTY_PAGES = 10;
const MAX_PROPERTIES = 2_000;

export interface GoogleAnalyticsProperty {
  property: string;
  displayName: string;
  propertyType: string | null;
  account: string;
  accountDisplayName: string;
}

export interface GoogleAnalyticsPropertyDetails {
  displayName: string;
  currencyCode: string | null;
  timeZone: string | null;
}

export interface GoogleAnalyticsOrganicMetrics {
  sessions: string | null;
  keyEvents: string | null;
  totalRevenue: string | null;
}

export interface GoogleAnalyticsLandingPageMetric {
  landingPage: string;
  sessions: string | null;
  keyEvents: string | null;
  totalRevenue: string | null;
}

export interface GoogleAnalyticsLandingPagesResult {
  rows: GoogleAnalyticsLandingPageMetric[];
  totalRows: number | null;
  truncated: boolean;
}

interface AccountSummariesResponse {
  accountSummaries?: Array<{
    account?: unknown;
    displayName?: unknown;
    propertySummaries?: Array<{
      property?: unknown;
      displayName?: unknown;
      propertyType?: unknown;
    }>;
  }>;
  nextPageToken?: unknown;
}

interface PropertyResponse {
  displayName?: unknown;
  currencyCode?: unknown;
  timeZone?: unknown;
}

interface RunReportResponse {
  metricHeaders?: Array<{ name?: unknown }>;
  dimensionHeaders?: Array<{ name?: unknown }>;
  rowCount?: unknown;
  rows?: Array<{
    dimensionValues?: Array<{ value?: unknown }>;
    metricValues?: Array<{ value?: unknown }>;
  }>;
}

function boundedString(value: unknown, maxLength = 500): string | null {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength
    ? value
    : null;
}

function numericString(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 64) return null;
  return /^-?\d+(?:\.\d+)?$/.test(value) ? value : null;
}

function validProperty(value: string): boolean {
  return /^properties\/\d{1,32}$/.test(value);
}

function safeLandingPage(value: unknown): string | null {
  const input = boundedString(value, 2_048)?.trim();
  if (!input) return null;
  if (input === '(not set)') return input;
  try {
    // Use the GA4 landingPage dimension (without query strings), and strip any query/hash if a
    // provider response unexpectedly includes them. Redact common direct identifiers in paths.
    const pathname = new URL(input, 'https://analytics.invalid').pathname;
    const safeSegments = pathname.split('/').map((segment) => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // Preserve the encoded segment when malformed.
      }
      if (/\b[^\s/@]+@[^\s/@]+\.[^\s/@]+\b/.test(decoded)) {
        return '[redacted]';
      }
      if (/(?:\+?\d[\s().-]*){8,}/.test(decoded)) return '[redacted]';
      if (
        /^[a-f0-9-]{24,}$/i.test(decoded) ||
        /^[a-z0-9_-]{32,}$/i.test(decoded)
      ) {
        return '[redacted]';
      }
      return encodeURIComponent(decoded)
        .replaceAll('%3A', ':')
        .replaceAll('%40', '@');
    });
    return safeSegments.join('/').slice(0, 2_048) || '/';
  } catch {
    return null;
  }
}

/**
 * Read-only GA4 connector used by SEO Autopilot. It lists properties through the Admin API and
 * reads Google-reported Organic Search sessions, key events and revenue through the Data API.
 * No website changes, event writes, user-level data or ad operations are performed.
 */
@Injectable()
export class GoogleAnalyticsConnector extends GoogleOAuth2Connector {
  readonly provider = IntegrationProvider.google_analytics;
  protected readonly scope =
    'https://www.googleapis.com/auth/analytics.readonly';

  constructor(config: ConfigService) {
    super(config);
  }

  async handleCallback(code: string) {
    const tokens = await super.handleCallback(code);
    // Property selection and cached aggregates belong to the previous Google identity. Clearing
    // metadata at OAuth reconnection prevents a different account from seeing stale analytics.
    return { ...tokens, providerMeta: {} };
  }

  async sync(tokens: OAuthTokens): Promise<GoogleAnalyticsProperty[]> {
    const results: GoogleAnalyticsProperty[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PROPERTY_PAGES; page += 1) {
      const response = await axios.get<AccountSummariesResponse>(
        `${ADMIN_API}/accountSummaries`,
        {
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
          params: { pageSize: 200, ...(pageToken ? { pageToken } : {}) },
        },
      );
      for (const account of response.data.accountSummaries ?? []) {
        const accountName = boundedString(account.account, 191);
        const accountDisplayName = boundedString(account.displayName, 500);
        if (!accountName || !accountDisplayName) continue;
        for (const property of account.propertySummaries ?? []) {
          const propertyName = boundedString(property.property, 64);
          const displayName = boundedString(property.displayName, 500);
          if (!propertyName || !validProperty(propertyName) || !displayName)
            continue;
          results.push({
            property: propertyName,
            displayName,
            propertyType: boundedString(property.propertyType, 64),
            account: accountName,
            accountDisplayName,
          });
          if (results.length >= MAX_PROPERTIES) break;
        }
        if (results.length >= MAX_PROPERTIES) break;
      }
      if (results.length >= MAX_PROPERTIES) break;
      pageToken = boundedString(response.data.nextPageToken, 2048) ?? undefined;
      if (!pageToken) break;
    }

    const deduplicated = new Map<string, GoogleAnalyticsProperty>();
    for (const property of results) {
      // Keep the first stable account-summary entry if Google repeats a property on a later page.
      if (!deduplicated.has(property.property)) {
        deduplicated.set(property.property, property);
      }
    }
    return [...deduplicated.values()].sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
  }

  async getPropertyDetails(
    tokens: OAuthTokens,
    property: string,
  ): Promise<GoogleAnalyticsPropertyDetails> {
    if (!validProperty(property)) {
      throw new Error('Google Analytics property ID is invalid.');
    }
    const response = await axios.get<PropertyResponse>(
      `${ADMIN_API}/${property}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    const displayName = boundedString(response.data.displayName, 500);
    if (!displayName)
      throw new Error('Google Analytics returned no property name.');
    const currencyCode = boundedString(response.data.currencyCode, 3);
    return {
      displayName,
      currencyCode:
        currencyCode && /^[A-Z]{3}$/.test(currencyCode) ? currencyCode : null,
      timeZone: boundedString(response.data.timeZone, 100),
    };
  }

  async queryOrganicSearch(
    tokens: OAuthTokens,
    property: string,
    startDate: string,
    endDate: string,
  ): Promise<GoogleAnalyticsOrganicMetrics | null> {
    if (!validProperty(property)) {
      throw new Error('Google Analytics property ID is invalid.');
    }
    const response = await axios.post<RunReportResponse>(
      `${DATA_API}/${property}:runReport`,
      {
        dateRanges: [{ startDate, endDate }],
        metrics: [
          { name: 'sessions' },
          { name: 'keyEvents' },
          { name: 'totalRevenue' },
        ],
        dimensionFilter: {
          filter: {
            fieldName: 'sessionDefaultChannelGroup',
            stringFilter: { matchType: 'EXACT', value: 'Organic Search' },
          },
        },
        returnPropertyQuota: false,
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    const row = response.data.rows?.[0];
    if (!row) return null;
    const names = (response.data.metricHeaders ?? []).map((header) =>
      boundedString(header.name, 64),
    );
    const values = row.metricValues ?? [];
    const byName = (name: string) => {
      const index = names.indexOf(name);
      return index < 0 ? null : numericString(values[index]?.value);
    };
    return {
      sessions: byName('sessions'),
      keyEvents: byName('keyEvents'),
      totalRevenue: byName('totalRevenue'),
    };
  }

  async queryOrganicSearchLandingPages(
    tokens: OAuthTokens,
    property: string,
    startDate: string,
    endDate: string,
  ): Promise<GoogleAnalyticsLandingPagesResult> {
    if (!validProperty(property)) {
      throw new Error('Google Analytics property ID is invalid.');
    }
    const response = await axios.post<RunReportResponse>(
      `${DATA_API}/${property}:runReport`,
      {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: 'landingPage' }],
        metrics: [
          { name: 'sessions' },
          { name: 'keyEvents' },
          { name: 'totalRevenue' },
        ],
        dimensionFilter: {
          filter: {
            fieldName: 'sessionDefaultChannelGroup',
            stringFilter: { matchType: 'EXACT', value: 'Organic Search' },
          },
        },
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        limit: 250,
        returnPropertyQuota: false,
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );

    const dimensionNames = (response.data.dimensionHeaders ?? []).map(
      (header) => boundedString(header.name, 64),
    );
    const metricNames = (response.data.metricHeaders ?? []).map((header) =>
      boundedString(header.name, 64),
    );
    const dimensionIndex = dimensionNames.indexOf('landingPage');
    const metric = (
      values: Array<{ value?: unknown }> | undefined,
      name: string,
    ) => {
      const index = metricNames.indexOf(name);
      return index < 0 ? null : numericString(values?.[index]?.value);
    };
    const rows = (response.data.rows ?? []).flatMap((row) => {
      const landingPage = safeLandingPage(
        dimensionIndex < 0
          ? null
          : row.dimensionValues?.[dimensionIndex]?.value,
      );
      return landingPage
        ? [
            {
              landingPage,
              sessions: metric(row.metricValues, 'sessions'),
              keyEvents: metric(row.metricValues, 'keyEvents'),
              totalRevenue: metric(row.metricValues, 'totalRevenue'),
            },
          ]
        : [];
    });
    const totalRows =
      typeof response.data.rowCount === 'number' &&
      Number.isSafeInteger(response.data.rowCount) &&
      response.data.rowCount >= 0
        ? response.data.rowCount
        : null;
    return {
      rows,
      totalRows,
      truncated: totalRows !== null && totalRows > rows.length,
    };
  }
}
