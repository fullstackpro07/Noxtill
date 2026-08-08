import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { GoogleAdsConnector } from './google-ads.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GoogleAdsConnector (BE-085)', () => {
  const config = new ConfigService({
    GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
    GOOGLE_ADS_DEVELOPER_TOKEN: 'dev-token',
    BACKEND_URL: 'http://localhost:5000/api/v1',
  });
  const connector = new GoogleAdsConnector(config);

  it('requests the Google Ads scope, distinct from GMB/Merchant Center', () => {
    const url = new URL(connector.authUrl('state'));
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/adwords');
  });

  it("sync() calls the real listAccessibleCustomers endpoint with a developer-token header (Google Ads' own quirk)", async () => {
    mockedAxios.get.mockResolvedValue({ data: { resourceNames: [] } });
    await connector.sync({ accessToken: 'fake-token' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v17/customers:listAccessibleCustomers',
      expect.objectContaining({
        headers: { Authorization: 'Bearer fake-token', 'developer-token': 'dev-token' },
      }),
    );
  });
});
