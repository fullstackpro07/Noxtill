import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { GoogleOAuth2Connector } from './google-oauth2.connector';
import { OAuthTokens, TrafficDayInput } from '../connector.interface';
import { IntegrationProvider } from '@prisma/client';

const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta';
const DATA = 'https://analyticsdata.googleapis.com/v1beta';

interface AccountSummaries {
  accountSummaries?: Array<{
    propertySummaries?: Array<{ property: string; displayName: string }>;
  }>;
}
interface RunReport {
  rows?: Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>;
}

/**
 * Google Analytics (GA4) connector — read-only (`analytics.readonly`). It imports daily sessions
 * and conversions for the first GA4 property the connected Google account can see (or
 * `meta.propertyId` when set) into `WebTrafficDaily`.
 */
@Injectable()
export class GoogleAnalyticsConnector extends GoogleOAuth2Connector {
  readonly provider = IntegrationProvider.google_analytics;
  protected readonly scope =
    'https://www.googleapis.com/auth/analytics.readonly';

  constructor(config: ConfigService) {
    super(config);
  }

  private async property(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
  ): Promise<string> {
    const configured = meta.propertyId as string | undefined;
    if (configured)
      return configured.startsWith('properties/')
        ? configured
        : `properties/${configured}`;
    const response = await axios.get<AccountSummaries>(
      `${ADMIN}/accountSummaries`,
      {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      },
    );
    const property = response.data.accountSummaries
      ?.flatMap((a) => a.propertySummaries ?? [])
      .at(0)?.property;
    if (!property) {
      throw new Error('This Google account has no Google Analytics 4 property');
    }
    return property;
  }

  async sync(tokens: OAuthTokens): Promise<unknown> {
    return { property: await this.property(tokens, {}) };
  }

  async fetchTraffic(
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    days: number,
  ): Promise<TrafficDayInput[]> {
    const property = await this.property(tokens, meta);
    const response = await axios.post<RunReport>(
      `${DATA}/${property}:runReport`,
      {
        dateRanges: [
          { startDate: `${Math.max(1, days - 1)}daysAgo`, endDate: 'today' },
        ],
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'sessions' }, { name: 'conversions' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      },
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return (response.data.rows ?? []).map((row) => {
      const raw = row.dimensionValues[0].value; // YYYYMMDD
      return {
        day: `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`,
        sessions: Math.round(Number(row.metricValues[0].value)),
        conversions: Math.round(Number(row.metricValues[1].value)),
      };
    });
  }
}
