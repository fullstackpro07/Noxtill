import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { MetaAdsConnector } from './meta-ads.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MetaAdsConnector (BE-087)', () => {
  const config = new ConfigService({
    META_ADS_APP_ID: 'test-app-id',
    BACKEND_URL: 'http://localhost:5000/api/v1',
  });
  const connector = new MetaAdsConnector(config);

  it('builds a real facebook.com authorize URL with the ads_management scope', () => {
    const url = new URL(connector.authUrl('signed-state'));
    expect(url.origin + url.pathname).toBe(
      'https://www.facebook.com/v19.0/dialog/oauth',
    );
    expect(url.searchParams.get('client_id')).toBe('test-app-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5000/api/v1/integrations/meta_ads/callback',
    );
    expect(url.searchParams.get('scope')).toBe(
      'ads_management,business_management',
    );
  });

  it('exchanges the code via a GET to the real Graph API token endpoint (not POST, per Meta)', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        access_token: 'meta-token',
        token_type: 'bearer',
        expires_in: 5184000,
      },
    });
    const tokens = await connector.handleCallback('some-code');
    expect(tokens.accessToken).toBe('meta-token');
    /* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment -- jest.Mocked method + expect.objectContaining types as `any` */
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://graph.facebook.com/v19.0/oauth/access_token',
      expect.objectContaining({
        params: expect.objectContaining({ code: 'some-code' }),
      }),
    );
    /* eslint-enable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
  });

  it("refreshToken() performs Meta's real fb_exchange_token long-lived-token exchange, not a standard refresh grant", async () => {
    mockedAxios.get.mockResolvedValue({
      data: { access_token: 'long-lived-token', token_type: 'bearer' },
    });
    await connector.refreshToken({ accessToken: 'short-lived-token' });
    /* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment -- jest.Mocked method + expect.objectContaining types as `any` */
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://graph.facebook.com/v19.0/oauth/access_token',
      expect.objectContaining({
        params: expect.objectContaining({
          grant_type: 'fb_exchange_token',
          fb_exchange_token: 'short-lived-token',
        }),
      }),
    );
    /* eslint-enable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment */
  });
});
