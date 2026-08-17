import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { AppleBusinessConnectConnector } from './apple-business-connect.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AppleBusinessConnectConnector (UPD-BE-043)', () => {
  const config = new ConfigService({
    APPLE_BUSINESS_CONNECT_API_KEY: 'test-api-key',
  });
  const connector = new AppleBusinessConnectConnector(config);

  it('authUrl() returns null — no public OAuth2 sandbox exists for this provider', () => {
    expect(connector.authUrl()).toBeNull();
  });

  it('handleCallback() connects directly using the pre-provisioned server-to-server API key', async () => {
    const tokens = await connector.handleCallback();
    expect(tokens.accessToken).toBe('test-api-key');
  });

  it('pushListing() PATCHes the real locations/primary endpoint', async () => {
    mockedAxios.patch.mockResolvedValue({ data: { ok: true } });
    await connector.pushListing(
      { accessToken: 'test-api-key' },
      { name: 'Real Biz', phone: '+15551234567', categories: [], hours: {} },
      {},
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.patch).toHaveBeenCalledWith(
      'https://businessconnect.apple.com/api/v1/locations/primary',
      expect.objectContaining({
        name: 'Real Biz',
        phoneNumber: '+15551234567',
      }),
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-api-key' },
      }),
    );
  });
});
