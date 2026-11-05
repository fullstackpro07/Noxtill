import { ConfigService } from '@nestjs/config';
import { IntegrationProvider } from '@prisma/client';
import axios from 'axios';
import { GoogleAnalyticsConnector } from './google-analytics.connector';

describe('GoogleAnalyticsConnector', () => {
  const connector = new GoogleAnalyticsConnector({
    get: (key: string) =>
      key === 'GOOGLE_OAUTH_CLIENT_ID'
        ? 'client-id'
        : key === 'BACKEND_URL'
          ? 'https://api.noxtill.test/api/v1'
          : undefined,
  } as unknown as ConfigService);
  const tokens = { accessToken: 'access-token' };

  afterEach(() => jest.restoreAllMocks());

  it('requests read-only Analytics scope and lists accessible GA4 properties', async () => {
    const url = connector.authUrl('signed-state');
    expect(url).toContain('analytics.readonly');
    expect(url).not.toContain('analytics.edit');
    expect(connector.provider).toBe(IntegrationProvider.google_analytics);

    const get = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        accountSummaries: [
          {
            account: 'accounts/7',
            displayName: 'Company Analytics',
            propertySummaries: [
              {
                property: 'properties/123456',
                displayName: 'Main website',
                propertyType: 'PROPERTY_TYPE_ORDINARY',
              },
              { property: 'properties/not-an-id', displayName: 'Bad row' },
            ],
          },
        ],
      },
    });

    await expect(connector.sync(tokens)).resolves.toEqual([
      {
        property: 'properties/123456',
        displayName: 'Main website',
        propertyType: 'PROPERTY_TYPE_ORDINARY',
        account: 'accounts/7',
        accountDisplayName: 'Company Analytics',
      },
    ]);
    expect(get).toHaveBeenCalledWith(
      'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
      {
        headers: { Authorization: 'Bearer access-token' },
        params: { pageSize: 200 },
      },
    );
  });

  it('clears previous-account metadata after a successful Google reauthorization', async () => {
    jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
      },
    });
    await expect(connector.handleCallback('oauth-code')).resolves.toMatchObject(
      {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        providerMeta: {},
      },
    );
  });

  it('paginates account summaries and returns unique property rows in stable order', async () => {
    const get = jest.spyOn(axios, 'get');
    get
      .mockResolvedValueOnce({
        data: {
          accountSummaries: [
            {
              account: 'accounts/1',
              displayName: 'Account',
              propertySummaries: [
                { property: 'properties/2', displayName: 'Zulu' },
                { property: 'properties/1', displayName: 'Alpha' },
              ],
            },
          ],
          nextPageToken: 'next-page',
        },
      })
      .mockResolvedValueOnce({
        data: {
          accountSummaries: [
            {
              account: 'accounts/1',
              displayName: 'Account',
              propertySummaries: [
                { property: 'properties/1', displayName: 'Alpha duplicate' },
                { property: 'properties/3', displayName: 'Beta' },
              ],
            },
          ],
        },
      });

    await expect(connector.sync(tokens)).resolves.toEqual([
      {
        property: 'properties/1',
        displayName: 'Alpha',
        propertyType: null,
        account: 'accounts/1',
        accountDisplayName: 'Account',
      },
      {
        property: 'properties/3',
        displayName: 'Beta',
        propertyType: null,
        account: 'accounts/1',
        accountDisplayName: 'Account',
      },
      {
        property: 'properties/2',
        displayName: 'Zulu',
        propertyType: null,
        account: 'accounts/1',
        accountDisplayName: 'Account',
      },
    ]);
    expect(get).toHaveBeenNthCalledWith(
      2,
      'https://analyticsadmin.googleapis.com/v1beta/accountSummaries',
      {
        headers: { Authorization: 'Bearer access-token' },
        params: { pageSize: 200, pageToken: 'next-page' },
      },
    );
  });

  it('reads property currency and only requests aggregate Organic Search metrics', async () => {
    const get = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        displayName: 'Main website',
        currencyCode: 'USD',
        timeZone: 'America/New_York',
      },
    });
    await expect(
      connector.getPropertyDetails(tokens, 'properties/123456'),
    ).resolves.toEqual({
      displayName: 'Main website',
      currencyCode: 'USD',
      timeZone: 'America/New_York',
    });
    expect(get).toHaveBeenCalledWith(
      'https://analyticsadmin.googleapis.com/v1beta/properties/123456',
      { headers: { Authorization: 'Bearer access-token' } },
    );

    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        metricHeaders: [
          { name: 'sessions' },
          { name: 'keyEvents' },
          { name: 'totalRevenue' },
        ],
        rows: [
          {
            metricValues: [
              { value: '124' },
              { value: '9.5' },
              { value: '2500.75' },
            ],
          },
        ],
      },
    });
    await expect(
      connector.queryOrganicSearch(
        tokens,
        'properties/123456',
        '2026-10-01',
        '2026-10-28',
      ),
    ).resolves.toEqual({
      sessions: '124',
      keyEvents: '9.5',
      totalRevenue: '2500.75',
    });
    expect(post).toHaveBeenCalledWith(
      'https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport',
      {
        dateRanges: [{ startDate: '2026-10-01', endDate: '2026-10-28' }],
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
      { headers: { Authorization: 'Bearer access-token' } },
    );
  });

  it('returns null when Google has no aggregate row and does not coerce malformed values', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValueOnce({
      data: { rows: [] },
    });
    await expect(
      connector.queryOrganicSearch(
        tokens,
        'properties/123456',
        '2026-10-01',
        '2026-10-28',
      ),
    ).resolves.toBeNull();

    post.mockResolvedValueOnce({
      data: {
        metricHeaders: [
          { name: 'sessions' },
          { name: 'keyEvents' },
          { name: 'totalRevenue' },
        ],
        rows: [
          { metricValues: [{ value: 'NaN' }, { value: '4' }, { value: '' }] },
        ],
      },
    });
    await expect(
      connector.queryOrganicSearch(
        tokens,
        'properties/123456',
        '2026-10-01',
        '2026-10-28',
      ),
    ).resolves.toEqual({ sessions: null, keyEvents: '4', totalRevenue: null });
  });

  it('reads Organic Search landing-page metrics using path-only dimensions', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        dimensionHeaders: [{ name: 'landingPage' }],
        metricHeaders: [
          { name: 'sessions' },
          { name: 'keyEvents' },
          { name: 'totalRevenue' },
        ],
        rowCount: 4,
        rows: [
          {
            dimensionValues: [
              { value: '/products/widget?email=private@example.com' },
            ],
            metricValues: [{ value: '42' }, { value: '3' }, { value: '90.00' }],
          },
          {
            dimensionValues: [{ value: '/customers/123-456-7890' }],
            metricValues: [{ value: '10' }, { value: '1' }, { value: '5.00' }],
          },
          {
            dimensionValues: [{ value: '/account/private@example.com' }],
            metricValues: [{ value: '2' }, { value: '0' }, { value: '0' }],
          },
        ],
      },
    });

    await expect(
      connector.queryOrganicSearchLandingPages(
        tokens,
        'properties/123456',
        '2026-10-01',
        '2026-10-28',
      ),
    ).resolves.toEqual({
      rows: [
        {
          landingPage: '/products/widget',
          sessions: '42',
          keyEvents: '3',
          totalRevenue: '90.00',
        },
        {
          landingPage: '/customers/[redacted]',
          sessions: '10',
          keyEvents: '1',
          totalRevenue: '5.00',
        },
        {
          landingPage: '/account/[redacted]',
          sessions: '2',
          keyEvents: '0',
          totalRevenue: '0',
        },
      ],
      totalRows: 4,
      truncated: true,
    });
    expect(post).toHaveBeenCalledWith(
      'https://analyticsdata.googleapis.com/v1beta/properties/123456:runReport',
      {
        dateRanges: [{ startDate: '2026-10-01', endDate: '2026-10-28' }],
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
      { headers: { Authorization: 'Bearer access-token' } },
    );
  });

  it('rejects malformed property ids before making a provider request', async () => {
    const get = jest.spyOn(axios, 'get');
    const post = jest.spyOn(axios, 'post');
    await expect(
      connector.getPropertyDetails(tokens, 'properties/1?x=bad'),
    ).rejects.toThrow('Google Analytics property ID is invalid.');
    await expect(
      connector.queryOrganicSearch(
        tokens,
        'properties/1/../../businesses',
        '2026-10-01',
        '2026-10-28',
      ),
    ).rejects.toThrow('Google Analytics property ID is invalid.');
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
