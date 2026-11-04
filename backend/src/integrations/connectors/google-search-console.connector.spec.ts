import { ConfigService } from '@nestjs/config';
import { IntegrationProvider } from '@prisma/client';
import axios from 'axios';
import { GoogleSearchConsoleConnector } from './google-search-console.connector';

describe('GoogleSearchConsoleConnector', () => {
  const connector = new GoogleSearchConsoleConnector({
    get: (key: string) =>
      key === 'GOOGLE_OAUTH_CLIENT_ID'
        ? 'client-id'
        : key === 'BACKEND_URL'
          ? 'https://api.noxtill.test/api/v1'
          : undefined,
  } as unknown as ConfigService);
  const tokens = { accessToken: 'access-token' };

  afterEach(() => jest.restoreAllMocks());

  it('requests read-only Search Console OAuth and returns accessible properties', async () => {
    const url = connector.authUrl('signed-state');
    expect(url).toContain('webmasters.readonly');
    expect(connector.provider).toBe(IntegrationProvider.google_search_console);
    const get = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        siteEntry: [
          { siteUrl: 'https://z.test/', permissionLevel: 'siteOwner' },
          { siteUrl: 'sc-domain:a.test', permissionLevel: 'siteFullUser' },
          { siteUrl: '', permissionLevel: 'siteOwner' },
        ],
      },
    });

    await expect(connector.sync(tokens)).resolves.toEqual([
      { siteUrl: 'https://z.test/', permissionLevel: 'siteOwner' },
      { siteUrl: 'sc-domain:a.test', permissionLevel: 'siteFullUser' },
    ]);
    expect(get).toHaveBeenCalledWith(
      'https://www.googleapis.com/webmasters/v3/sites',
      { headers: { Authorization: 'Bearer access-token' } },
    );
  });

  it('queries only property-level final aggregate metrics and preserves counts', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        rows: [
          {
            clicks: 9007199254740991,
            impressions: 200,
            ctr: 0.25,
            position: 4.5,
          },
        ],
      },
    });
    const result = await connector.queryPropertyPerformance(
      tokens,
      'https://search-console.test/',
      '2026-09-01',
      '2026-09-28',
    );

    expect(result).toEqual({
      clicks: '9007199254740991',
      impressions: '200',
      clickThroughRate: 0.25,
      averagePosition: 4.5,
    });
    expect(post.mock.calls[0][0]).toBe(
      'https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fsearch-console.test%2F/searchAnalytics/query',
    );
    expect(post.mock.calls[0][1]).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-28',
      type: 'web',
      dataState: 'final',
      aggregationType: 'byProperty',
      rowLimit: 1,
    });
  });

  it('does not convert an empty result set into fabricated zeroes', async () => {
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { rows: [] } });
    await expect(
      connector.queryPropertyPerformance(
        tokens,
        'sc-domain:search-console.test',
        '2026-09-01',
        '2026-09-28',
      ),
    ).resolves.toBeNull();
  });

  it('requests query-level metrics without page dimensions and validates returned terms', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        rows: [
          {
            keys: [' tracked term '],
            clicks: 3,
            impressions: 30,
            ctr: 0.1,
            position: 2.5,
          },
          {
            keys: [null],
            clicks: 9,
            impressions: 90,
            ctr: 0.1,
            position: 4,
          },
        ],
      },
    });

    await expect(
      connector.queryKeywordPerformance(
        tokens,
        'https://search-console.test/',
        '2026-09-01',
        '2026-09-28',
      ),
    ).resolves.toEqual([
      {
        query: ' tracked term ',
        clicks: '3',
        impressions: '30',
        clickThroughRate: 0.1,
        averagePosition: 2.5,
      },
    ]);
    expect(post.mock.calls[0][1]).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-28',
      type: 'web',
      dataState: 'final',
      dimensions: ['query'],
      rowLimit: 25_000,
    });
  });

  it('requests stored index status for the requested URL and sanitizes optional fields', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        inspectionResult: {
          inspectionResultLink:
            'https://search.google.com/search-console/inspect',
          indexStatusResult: {
            verdict: 'PASS',
            coverageState: 'Submitted and indexed',
            indexingState: 'INDEXING_ALLOWED',
            robotsTxtState: 'ALLOWED',
            pageFetchState: 'SUCCESSFUL',
            lastCrawlTime: '2026-10-30T12:00:00Z',
            googleCanonical: 'https://search-console.test/page',
            userCanonical: null,
            sitemap: ['https://search-console.test/sitemap.xml', 7],
            referringUrls: ['https://search-console.test/'],
          },
        },
      },
    });

    await expect(
      connector.inspectUrl(
        tokens,
        'https://search-console.test/',
        'https://search-console.test/page',
      ),
    ).resolves.toEqual({
      inspectionResultLink: 'https://search.google.com/search-console/inspect',
      verdict: 'PASS',
      coverageState: 'Submitted and indexed',
      indexingState: 'INDEXING_ALLOWED',
      robotsTxtState: 'ALLOWED',
      pageFetchState: 'SUCCESSFUL',
      lastCrawlTime: '2026-10-30T12:00:00Z',
      googleCanonical: 'https://search-console.test/page',
      userCanonical: null,
      sitemaps: ['https://search-console.test/sitemap.xml'],
      referringUrls: ['https://search-console.test/'],
    });
    expect(post).toHaveBeenCalledWith(
      'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
      {
        inspectionUrl: 'https://search-console.test/page',
        siteUrl: 'https://search-console.test/',
        languageCode: 'en-US',
      },
      {
        headers: {
          Authorization: 'Bearer access-token',
          'content-type': 'application/json',
        },
      },
    );
  });

  it('rejects an inspection response without index status instead of returning empty success', async () => {
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: { inspectionResult: {} },
    });

    await expect(
      connector.inspectUrl(
        tokens,
        'https://search-console.test/',
        'https://search-console.test/page',
      ),
    ).rejects.toThrow('Google Search Console returned no URL index status.');
  });

  it('queries finalized page metrics for only the exact URL and preserves the canonical row URL', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        rows: [
          {
            keys: ['https://search-console.test/canonical-page'],
            clicks: 12,
            impressions: 345,
            ctr: 12 / 345,
            position: 6.25,
          },
        ],
      },
    });

    await expect(
      connector.queryPagePerformance(
        tokens,
        'https://search-console.test/',
        'https://search-console.test/page',
        '2026-10-01',
        '2026-10-28',
      ),
    ).resolves.toEqual({
      pageUrl: 'https://search-console.test/canonical-page',
      clicks: '12',
      impressions: '345',
      clickThroughRate: 12 / 345,
      averagePosition: 6.25,
    });
    expect(post.mock.calls[0][1]).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-28',
      type: 'web',
      dataState: 'final',
      dimensions: ['page'],
      dimensionFilterGroups: [
        {
          groupType: 'and',
          filters: [
            {
              dimension: 'page',
              operator: 'equals',
              expression: 'https://search-console.test/page',
            },
          ],
        },
      ],
      aggregationType: 'auto',
      rowLimit: 1,
    });
  });

  it('returns no page metrics when Search Console has no finalized row', async () => {
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { rows: [] } });

    await expect(
      connector.queryPagePerformance(
        tokens,
        'https://search-console.test/',
        'https://search-console.test/page',
        '2026-10-01',
        '2026-10-28',
      ),
    ).resolves.toBeNull();
  });
});
