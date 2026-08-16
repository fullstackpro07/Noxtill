import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { GmbConnector } from './gmb.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GmbConnector (BE-084, via GoogleOAuth2Connector)', () => {
  const config = new ConfigService({
    GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
    BACKEND_URL: 'http://localhost:5000/api/v1',
  });
  const connector = new GmbConnector(config);

  it('builds a real, correctly-shaped Google authorize URL with the GMB scope', () => {
    const url = connector.authUrl('signed-state');
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(parsed.searchParams.get('client_id')).toBe('test-client-id');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5000/api/v1/integrations/gmb/callback',
    );
    expect(parsed.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/business.manage',
    );
    expect(parsed.searchParams.get('access_type')).toBe('offline');
    expect(parsed.searchParams.get('state')).toBe('signed-state');
  });

  it('attempts a real token exchange against the real Google token endpoint and fails cleanly with an empty client secret', async () => {
    mockedAxios.post.mockRejectedValue({
      isAxiosError: true,
      response: { status: 401, data: { error: 'invalid_client' } },
    });

    await expect(connector.handleCallback('some-code')).rejects.toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://oauth2.googleapis.com/token',
      expect.stringContaining('grant_type=authorization_code'),
      expect.any(Object),
    );
  });

  it('calls the real GMB accounts-list endpoint for sync()', async () => {
    mockedAxios.get.mockResolvedValue({ data: { accounts: [] } });
    await connector.sync({ accessToken: 'fake-token' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      expect.objectContaining({
        headers: { Authorization: 'Bearer fake-token' },
      }),
    );
  });
});
