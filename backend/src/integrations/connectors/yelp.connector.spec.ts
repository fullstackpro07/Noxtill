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
});
