import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { MerchantCenterConnector } from './merchant-center.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('MerchantCenterConnector (BE-086)', () => {
  const config = new ConfigService({ GOOGLE_OAUTH_CLIENT_ID: 'test-client-id' });
  const connector = new MerchantCenterConnector(config);

  it('requests the Content API scope', () => {
    const url = new URL(connector.authUrl('state'));
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/content');
  });

  it('sync() calls the real accounts/authinfo endpoint', async () => {
    mockedAxios.get.mockResolvedValue({ data: { accountIdentifiers: [] } });
    await connector.sync({ accessToken: 'fake-token' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://shoppingcontent.googleapis.com/content/v2.1/accounts/authinfo',
      expect.objectContaining({ headers: { Authorization: 'Bearer fake-token' } }),
    );
  });
});
