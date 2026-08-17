import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { BingPlacesConnector } from './bing-places.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('BingPlacesConnector (UPD-BE-043)', () => {
  const config = new ConfigService({
    BING_PLACES_CLIENT_ID: 'test-client-id',
    BACKEND_URL: 'http://localhost:5000/api/v1',
  });
  const connector = new BingPlacesConnector(config);

  it('builds a real Microsoft identity-platform authorize URL', () => {
    const url = new URL(connector.authUrl('signed-state'));
    expect(url.origin + url.pathname).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    );
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5000/api/v1/integrations/bing_places/callback',
    );
    expect(url.searchParams.get('state')).toBe('signed-state');
  });

  it('exchanges the code via a real POST to the Microsoft token endpoint', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { access_token: 'bing-token', expires_in: 3600 },
    });
    const tokens = await connector.handleCallback('some-code');
    expect(tokens.accessToken).toBe('bing-token');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [url, body] = mockedAxios.post.mock.calls[0];
    expect(url).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    );
    expect(String(body)).toContain('grant_type=authorization_code');
  });

  it('pushListing() POSTs the real NAP fields to CreateOrUpdateStore', async () => {
    mockedAxios.post.mockResolvedValue({ data: { ok: true } });
    await connector.pushListing(
      { accessToken: 'bing-token' },
      { name: 'Real Biz', phone: '+15551234567', categories: [], hours: {} },
      {},
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.bingplaces.com/api/CreateOrUpdateStore',
      expect.objectContaining({
        StoreName: 'Real Biz',
        BusinessPhone: '+15551234567',
      }),
      expect.objectContaining({
        headers: { Authorization: 'Bearer bing-token' },
      }),
    );
  });
});
