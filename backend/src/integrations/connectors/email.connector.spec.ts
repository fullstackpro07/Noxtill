import { EmailConnector } from './email.connector';

describe('EmailConnector (BE-083)', () => {
  const connector = new EmailConnector();

  it('returns null from authUrl — the signal IntegrationsService uses to skip the OAuth redirect', () => {
    expect(connector.authUrl()).toBeNull();
  });

  it('has no external side effects for connect/disconnect since there is no per-business credential', async () => {
    await expect(connector.handleCallback()).resolves.toEqual({ accessToken: '' });
    await expect(connector.disconnect()).resolves.toBeUndefined();
  });
});
