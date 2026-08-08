import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { TikTokAdsConnector } from './tiktok-ads.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TikTokAdsConnector (BE-088)', () => {
  const config = new ConfigService({
    TIKTOK_ADS_APP_ID: 'test-app-id',
    TIKTOK_ADS_APP_SECRET: 'test-secret',
    BACKEND_URL: 'http://localhost:5000/api/v1',
  });
  const connector = new TikTokAdsConnector(config);

  it('builds a real business-api.tiktok.com authorize URL using app_id, not client_id', () => {
    const url = new URL(connector.authUrl('signed-state'));
    expect(url.origin + url.pathname).toBe('https://business-api.tiktok.com/portal/auth');
    expect(url.searchParams.get('app_id')).toBe('test-app-id');
    expect(url.searchParams.get('client_id')).toBeNull();
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5000/api/v1/integrations/tiktok_ads/callback');
  });

  it("exchanges the code via a JSON POST and unwraps TikTok's {code, message, data} envelope", async () => {
    mockedAxios.post.mockResolvedValue({
      data: { code: 0, message: 'OK', data: { access_token: 'tt-token', advertiser_ids: ['123'], scope: [1] } },
    });
    const tokens = await connector.handleCallback('auth-code-value');
    expect(tokens.accessToken).toBe('tt-token');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/',
      expect.objectContaining({ app_id: 'test-app-id', secret: 'test-secret', auth_code: 'auth-code-value' }),
    );
  });

  it('refreshToken() is a no-op since TikTok Marketing API tokens have no refresh grant', async () => {
    const tokens = { accessToken: 'unchanged-token' };
    await expect(connector.refreshToken(tokens)).resolves.toBe(tokens);
  });

  it('sync() sends the token via the Access-Token header, not Authorization: Bearer', async () => {
    mockedAxios.get.mockResolvedValue({ data: { code: 0, data: {} } });
    await connector.sync({ accessToken: 'tt-token' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/',
      expect.objectContaining({ headers: { 'Access-Token': 'tt-token' } }),
    );
  });
});
