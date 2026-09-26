import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { GoogleAnalyticsConnector } from './google-analytics.connector';
import { GoogleCalendarConnector } from './google-calendar.connector';
import { OutlookConnector } from './outlook.connector';
import { MerchantCenterConnector } from './merchant-center.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const config = new ConfigService({
  BACKEND_URL: 'http://localhost:5000/api/v1',
  GOOGLE_OAUTH_CLIENT_ID: 'g-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'g-secret',
  MICROSOFT_GRAPH_CLIENT_ID: 'ms-id',
  MICROSOFT_GRAPH_CLIENT_SECRET: 'ms-secret',
});
const tokens = { accessToken: 'tok' };

afterEach(() => jest.resetAllMocks());

describe('GoogleAnalyticsConnector', () => {
  const connector = new GoogleAnalyticsConnector(config);

  it('asks Google for read-only analytics access', () => {
    const url = new URL(connector.authUrl('s'));
    expect(url.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/analytics.readonly',
    );
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5000/api/v1/integrations/google_analytics/callback',
    );
  });

  it('finds the first GA4 property and turns runReport rows into daily sessions and conversions', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        accountSummaries: [
          {
            propertySummaries: [
              { property: 'properties/42', displayName: 'Site' },
            ],
          },
        ],
      },
    });
    mockedAxios.post.mockResolvedValue({
      data: {
        rows: [
          {
            dimensionValues: [{ value: '20260925' }],
            metricValues: [{ value: '310' }, { value: '12' }],
          },
          {
            dimensionValues: [{ value: '20260926' }],
            metricValues: [{ value: '295' }, { value: '9' }],
          },
        ],
      },
    });
    const days = await connector.fetchTraffic(tokens, {}, 14);
    expect(days).toEqual([
      { day: '2026-09-25', sessions: 310, conversions: 12 },
      { day: '2026-09-26', sessions: 295, conversions: 9 },
    ]);
    const [url, body] = mockedAxios.post.mock.calls[0] as [
      string,
      { dateRanges: Array<{ startDate: string }> },
    ];
    expect(url).toBe(
      'https://analyticsdata.googleapis.com/v1beta/properties/42:runReport',
    );
    expect(body.dateRanges[0].startDate).toBe('13daysAgo');
  });

  it('says so plainly when the Google account has no GA4 property', async () => {
    mockedAxios.get.mockResolvedValue({ data: { accountSummaries: [] } });
    await expect(connector.fetchTraffic(tokens, {}, 14)).rejects.toThrow(
      'no Google Analytics 4 property',
    );
  });
});

describe('GoogleCalendarConnector', () => {
  const connector = new GoogleCalendarConnector(config);
  const event = {
    title: 'Haircut — Sam',
    description: 'Booked in Noxtill',
    startsAt: '2026-09-30T10:00:00.000Z',
    endsAt: '2026-09-30T11:00:00.000Z',
  };

  it('creates, updates and deletes the event in the primary calendar', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'evt1' } });
    mockedAxios.patch.mockResolvedValue({ data: {} });
    mockedAxios.delete.mockResolvedValue({ data: {} });

    expect(await connector.createCalendarEvent(tokens, {}, event)).toEqual({
      externalId: 'evt1',
    });
    const [createUrl, body] = mockedAxios.post.mock.calls[0] as [
      string,
      { summary: string; start: { dateTime: string } },
    ];
    expect(createUrl).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    );
    expect(body).toMatchObject({
      summary: 'Haircut — Sam',
      start: { dateTime: event.startsAt },
    });

    await connector.updateCalendarEvent(tokens, {}, 'evt1', event);
    expect(mockedAxios.patch.mock.calls[0][0]).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/evt1',
    );
    await connector.deleteCalendarEvent(tokens, {}, 'evt1');
    expect(mockedAxios.delete.mock.calls[0][0]).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/evt1',
    );
  });
});

describe('OutlookConnector', () => {
  const connector = new OutlookConnector(config);

  it('builds a Microsoft identity platform authorize URL for Calendars.ReadWrite', () => {
    const url = new URL(connector.authUrl('s'));
    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    );
    expect(url.searchParams.get('scope')).toContain('Calendars.ReadWrite');
  });

  it('keeps the old refresh token when Microsoft does not return a new one', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { access_token: 'new', expires_in: 3600 },
    });
    const refreshed = await connector.refreshToken({
      accessToken: 'old',
      refreshToken: 'rt-old',
    });
    expect(refreshed).toMatchObject({
      accessToken: 'new',
      refreshToken: 'rt-old',
    });
  });

  it('creates a Graph event in UTC and returns its id', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'AAMk123' } });
    const result = await connector.createCalendarEvent(
      tokens,
      {},
      {
        title: 'T',
        startsAt: '2026-09-30T10:00:00.000Z',
        endsAt: '2026-09-30T11:00:00.000Z',
      },
    );
    expect(result).toEqual({ externalId: 'AAMk123' });
    const [url, body] = mockedAxios.post.mock.calls[0] as [
      string,
      { start: { dateTime: string; timeZone: string } },
    ];
    expect(url).toBe('https://graph.microsoft.com/v1.0/me/events');
    expect(body.start).toEqual({
      dateTime: '2026-09-30T10:00:00.000',
      timeZone: 'UTC',
    });
  });
});

describe('MerchantCenterConnector.pushProducts', () => {
  const connector = new MerchantCenterConnector(config);
  const product = (sku: string) => ({
    sku,
    title: `Product ${sku}`,
    price: 12.5,
    currency: 'USD',
    link: 'https://shop.example.com',
    imageLink: 'https://img/x.png',
    inStock: true,
  });

  it('inserts each product by offerId and reports the ones Google rejects, without blocking the rest', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { accountIdentifiers: [{ merchantId: '777' }] },
    });
    mockedAxios.post.mockResolvedValueOnce({ data: {} }).mockRejectedValueOnce({
      response: { data: { error: { message: 'Missing image' } } },
    });
    const result = await connector.pushProducts(tokens, {}, [
      product('A'),
      product('B'),
    ]);
    expect(result).toEqual({
      pushed: 1,
      failed: 1,
      errors: ['B: Missing image'],
    });
    const [url, body] = mockedAxios.post.mock.calls[0] as [
      string,
      {
        offerId: string;
        price: { value: string; currency: string };
        availability: string;
      },
    ];
    expect(url).toBe(
      'https://shoppingcontent.googleapis.com/content/v2.1/777/products',
    );
    expect(body).toMatchObject({
      offerId: 'A',
      availability: 'in stock',
      price: { value: '12.50', currency: 'USD' },
    });
  });
});
