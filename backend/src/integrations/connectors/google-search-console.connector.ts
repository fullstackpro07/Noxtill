import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { IntegrationProvider } from '@prisma/client';
import { OAuthTokens } from '../connector.interface';
import { GoogleOAuth2Connector } from './google-oauth2.connector';

export interface GoogleSearchConsoleProperty {
  siteUrl: string;
  permissionLevel: string;
}

export interface GoogleSearchConsolePerformance {
  clicks: string;
  impressions: string;
  clickThroughRate: number;
  averagePosition: number;
}

export interface GoogleSearchConsoleKeywordPerformance extends GoogleSearchConsolePerformance {
  query: string;
}

export interface GoogleSearchConsolePagePerformance extends GoogleSearchConsolePerformance {
  pageUrl: string;
}

export interface GoogleSearchConsoleUrlInspection {
  inspectionResultLink: string | null;
  verdict: string | null;
  coverageState: string | null;
  indexingState: string | null;
  robotsTxtState: string | null;
  pageFetchState: string | null;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  sitemaps: string[];
  referringUrls: string[];
}

interface GoogleSearchConsoleSiteList {
  siteEntry?: Array<{
    siteUrl?: unknown;
    permissionLevel?: unknown;
  }>;
}

interface GoogleSearchConsoleQueryResponse {
  rows?: Array<{
    keys?: unknown[];
    clicks?: unknown;
    impressions?: unknown;
    ctr?: unknown;
    position?: unknown;
  }>;
}

interface GoogleSearchConsoleUrlInspectionResponse {
  inspectionResult?: {
    inspectionResultLink?: unknown;
    indexStatusResult?: {
      verdict?: unknown;
      coverageState?: unknown;
      indexingState?: unknown;
      robotsTxtState?: unknown;
      pageFetchState?: unknown;
      lastCrawlTime?: unknown;
      googleCanonical?: unknown;
      userCanonical?: unknown;
      sitemap?: unknown;
      referringUrls?: unknown;
    };
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 2048 ? value : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === 'string' && item.length <= 2048,
  );
}

/**
 * Google Search Console is read-only here: list properties, query property/query-level
 * performance, and inspect Google's stored index status for a requested page. Query strings are
 * transiently mapped to the business's own tracked terms; raw query strings and inspected URLs
 * are not persisted by this connector.
 */
@Injectable()
export class GoogleSearchConsoleConnector extends GoogleOAuth2Connector {
  readonly provider = IntegrationProvider.google_search_console;
  protected readonly scope =
    'https://www.googleapis.com/auth/webmasters.readonly';

  constructor(config: ConfigService) {
    super(config);
  }

  async sync(tokens: OAuthTokens): Promise<GoogleSearchConsoleProperty[]> {
    const response = await axios.get<GoogleSearchConsoleSiteList>(
      'https://www.googleapis.com/webmasters/v3/sites',
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    return (response.data.siteEntry ?? [])
      .filter(
        (site): site is { siteUrl: string; permissionLevel: string } =>
          typeof site.siteUrl === 'string' &&
          site.siteUrl.length > 0 &&
          site.siteUrl.length <= 2048 &&
          typeof site.permissionLevel === 'string',
      )
      .map((site) => ({
        siteUrl: site.siteUrl,
        permissionLevel: site.permissionLevel,
      }))
      .sort((left, right) => left.siteUrl.localeCompare(right.siteUrl));
  }

  async queryPropertyPerformance(
    tokens: OAuthTokens,
    siteUrl: string,
    startDate: string,
    endDate: string,
  ): Promise<GoogleSearchConsolePerformance | null> {
    const response = await axios.post<GoogleSearchConsoleQueryResponse>(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        startDate,
        endDate,
        type: 'web',
        dataState: 'final',
        aggregationType: 'byProperty',
        rowLimit: 1,
      },
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'content-type': 'application/json',
        },
      },
    );

    const row = response.data.rows?.[0];
    if (!row) return null;
    const clicks = Number(row.clicks);
    const impressions = Number(row.impressions);
    const clickThroughRate = Number(row.ctr);
    const averagePosition = Number(row.position);
    if (
      !Number.isSafeInteger(clicks) ||
      clicks < 0 ||
      !Number.isSafeInteger(impressions) ||
      impressions < 0 ||
      !Number.isFinite(clickThroughRate) ||
      clickThroughRate < 0 ||
      !Number.isFinite(averagePosition) ||
      averagePosition < 0 ||
      !/^\d+$/.test(String(row.clicks)) ||
      !/^\d+$/.test(String(row.impressions))
    ) {
      throw new Error('Google Search Console returned an invalid metric row.');
    }
    return {
      clicks: String(clicks),
      impressions: String(impressions),
      clickThroughRate,
      averagePosition,
    };
  }

  async queryKeywordPerformance(
    tokens: OAuthTokens,
    siteUrl: string,
    startDate: string,
    endDate: string,
  ): Promise<GoogleSearchConsoleKeywordPerformance[]> {
    const response = await axios.post<GoogleSearchConsoleQueryResponse>(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        startDate,
        endDate,
        type: 'web',
        dataState: 'final',
        dimensions: ['query'],
        rowLimit: 25_000,
      },
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'content-type': 'application/json',
        },
      },
    );

    return (response.data.rows ?? []).flatMap((row) => {
      const query = row.keys?.[0];
      if (
        typeof query !== 'string' ||
        query.length === 0 ||
        query.length > 2048
      ) {
        return [];
      }
      const clicks = Number(row.clicks);
      const impressions = Number(row.impressions);
      const clickThroughRate = Number(row.ctr);
      const averagePosition = Number(row.position);
      if (
        !Number.isSafeInteger(clicks) ||
        clicks < 0 ||
        !Number.isSafeInteger(impressions) ||
        impressions < 0 ||
        !Number.isFinite(clickThroughRate) ||
        clickThroughRate < 0 ||
        !Number.isFinite(averagePosition) ||
        averagePosition < 0 ||
        !/^\d+$/.test(String(row.clicks)) ||
        !/^\d+$/.test(String(row.impressions))
      ) {
        throw new Error(
          'Google Search Console returned an invalid keyword metric row.',
        );
      }
      return [
        {
          query,
          clicks: String(clicks),
          impressions: String(impressions),
          clickThroughRate,
          averagePosition,
        },
      ];
    });
  }

  async queryPagePerformance(
    tokens: OAuthTokens,
    siteUrl: string,
    pageUrl: string,
    startDate: string,
    endDate: string,
  ): Promise<GoogleSearchConsolePagePerformance | null> {
    const response = await axios.post<GoogleSearchConsoleQueryResponse>(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        startDate,
        endDate,
        type: 'web',
        dataState: 'final',
        dimensions: ['page'],
        dimensionFilterGroups: [
          {
            groupType: 'and',
            filters: [
              { dimension: 'page', operator: 'equals', expression: pageUrl },
            ],
          },
        ],
        aggregationType: 'auto',
        rowLimit: 1,
      },
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'content-type': 'application/json',
        },
      },
    );

    const row = response.data.rows?.[0];
    const returnedPageUrl = row?.keys?.[0];
    if (
      !row ||
      typeof returnedPageUrl !== 'string' ||
      returnedPageUrl.length > 2048
    ) {
      return null;
    }
    const clicks = Number(row.clicks);
    const impressions = Number(row.impressions);
    const clickThroughRate = Number(row.ctr);
    const averagePosition = Number(row.position);
    if (
      !Number.isSafeInteger(clicks) ||
      clicks < 0 ||
      !Number.isSafeInteger(impressions) ||
      impressions < 0 ||
      !Number.isFinite(clickThroughRate) ||
      clickThroughRate < 0 ||
      !Number.isFinite(averagePosition) ||
      averagePosition < 0 ||
      !/^\d+$/.test(String(row.clicks)) ||
      !/^\d+$/.test(String(row.impressions))
    ) {
      throw new Error(
        'Google Search Console returned an invalid page metric row.',
      );
    }
    return {
      pageUrl: returnedPageUrl,
      clicks: String(clicks),
      impressions: String(impressions),
      clickThroughRate,
      averagePosition,
    };
  }

  async inspectUrl(
    tokens: OAuthTokens,
    siteUrl: string,
    inspectionUrl: string,
  ): Promise<GoogleSearchConsoleUrlInspection> {
    const response = await axios.post<GoogleSearchConsoleUrlInspectionResponse>(
      'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
      { inspectionUrl, siteUrl, languageCode: 'en-US' },
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
          'content-type': 'application/json',
        },
      },
    );
    const result = response.data.inspectionResult;
    const indexStatus = result?.indexStatusResult;
    if (!result || !indexStatus) {
      throw new Error('Google Search Console returned no URL index status.');
    }
    return {
      inspectionResultLink: optionalString(result.inspectionResultLink),
      verdict: optionalString(indexStatus.verdict),
      coverageState: optionalString(indexStatus.coverageState),
      indexingState: optionalString(indexStatus.indexingState),
      robotsTxtState: optionalString(indexStatus.robotsTxtState),
      pageFetchState: optionalString(indexStatus.pageFetchState),
      lastCrawlTime: optionalString(indexStatus.lastCrawlTime),
      googleCanonical: optionalString(indexStatus.googleCanonical),
      userCanonical: optionalString(indexStatus.userCanonical),
      sitemaps: stringList(indexStatus.sitemap),
      referringUrls: stringList(indexStatus.referringUrls),
    };
  }
}
