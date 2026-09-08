import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { YelpConnector } from './yelp.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('YelpConnector (UPD-BE-043)', () => {
  const config = new ConfigService({
    YELP_CLIENT_ID: 'test-client-id',
    BACKEND_URL: 'http://localhost:5000/api/v1',
  });
  const connector = new YelpConnector(config);

  it('builds a real yelp.com authorize URL', () => {
    const url = new URL(connector.authUrl('signed-state'));
    expect(url.origin + url.pathname).toBe(
      'https://www.yelp.com/oauth2/authorize',
    );
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5000/api/v1/integrations/yelp/callback',
    );
  });

  it('exchanges the code via a real POST to the Yelp token endpoint', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { access_token: 'yelp-token', expires_in: 3600 },
    });
    const tokens = await connector.handleCallback('some-code');
    expect(tokens.accessToken).toBe('yelp-token');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.yelp.com/oauth2/token',
      expect.objectContaining({
        grant_type: 'authorization_code',
        code: 'some-code',
      }),
    );
  });

  it('pushListing() POSTs the real NAP fields to businesses/managed/update', async () => {
    mockedAxios.post.mockResolvedValue({ data: { ok: true } });
    await connector.pushListing(
      { accessToken: 'yelp-token' },
      { name: 'Real Biz', city: 'Springfield', categories: [], hours: {} },
      {},
    );
    const lastCall = mockedAxios.post.mock.calls.length - 1;
    const [url, body, options] = mockedAxios.post.mock.calls[lastCall] as [
      string,
      { name: string; location: { city: string } },
      { headers: Record<string, string> },
    ];
    expect(url).toBe('https://api.yelp.com/v3/businesses/managed/update');
    expect(body.name).toBe('Real Biz');
    expect(body.location.city).toBe('Springfield');
    expect(options.headers.Authorization).toBe('Bearer yelp-token');
  });

  it('pushPhoto() POSTs to the real managed-business photos endpoint (UPD-BE-124)', async () => {
    mockedAxios.post.mockResolvedValue({ data: { ok: true } });
    await connector.pushPhoto(
      { accessToken: 'yelp-token' },
      'https://cdn.example/a.jpg',
      'exterior',
      { yelpBusinessId: 'biz-1' },
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.yelp.com/v3/businesses/managed/biz-1/photos',
      { photo_url: 'https://cdn.example/a.jpg', caption: 'exterior' },
      expect.objectContaining({
        headers: { Authorization: 'Bearer yelp-token' },
      }),
    );
  });

  it('fetchListing() GETs the real managed-business endpoint and maps the response (UPD-BE-125)', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        name: 'Real Biz',
        phone: '+15551234567',
        location: { city: 'Springfield' },
      },
    });
    const result = await connector.fetchListing(
      { accessToken: 'yelp-token' },
      { yelpBusinessId: 'biz-1' },
    );
    expect(result.name).toBe('Real Biz');
    expect(result.city).toBe('Springfield');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://api.yelp.com/v3/businesses/managed/biz-1',
      expect.objectContaining({
        headers: { Authorization: 'Bearer yelp-token' },
      }),
    );
  });
});
