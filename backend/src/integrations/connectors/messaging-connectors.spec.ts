import axios from 'axios';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { MailchimpConnector } from './mailchimp.connector';
import { KlaviyoConnector } from './klaviyo.connector';
import { SlackConnector } from './slack.connector';
import { ZoomConnector } from './zoom.connector';
import { WhatsAppConnector } from './whatsapp.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const config = new ConfigService({
  BACKEND_URL: 'http://localhost:5000/api/v1',
  MAILCHIMP_CLIENT_ID: 'mc-id',
  MAILCHIMP_CLIENT_SECRET: 'mc-secret',
  SLACK_CLIENT_ID: 'sl-id',
  SLACK_CLIENT_SECRET: 'sl-secret',
  ZOOM_CLIENT_ID: 'zm-id',
  ZOOM_CLIENT_SECRET: 'zm-secret',
});

afterEach(() => jest.resetAllMocks());

describe('MailchimpConnector', () => {
  const connector = new MailchimpConnector(config);

  it('exchanges the code, then asks Mailchimp for the account data-center endpoint', async () => {
    mockedAxios.post.mockResolvedValue({ data: { access_token: 'mc-tok' } });
    mockedAxios.get.mockResolvedValue({
      data: {
        dc: 'us9',
        api_endpoint: 'https://us9.api.mailchimp.com',
        login: { login_name: 'olivia' },
      },
    });
    const tokens = await connector.handleCallback('code');
    expect(tokens).toMatchObject({
      accessToken: 'mc-tok',
      providerMeta: {
        apiEndpoint: 'https://us9.api.mailchimp.com',
        dc: 'us9',
        account: 'olivia',
      },
    });
    expect(mockedAxios.get.mock.calls[0][0]).toBe(
      'https://login.mailchimp.com/oauth2/metadata',
    );
  });

  it('upserts contacts by the md5 of the lower-cased email into the first audience and counts failures', async () => {
    mockedAxios.get.mockResolvedValue({ data: { lists: [{ id: 'list1' }] } });
    mockedAxios.put
      .mockResolvedValueOnce({ data: {} })
      .mockRejectedValueOnce(new Error('400'));
    const result = await connector.pushContacts(
      {
        accessToken: 'mc-tok',
        providerMeta: { apiEndpoint: 'https://us9.api.mailchimp.com' },
      },
      {},
      [
        { email: 'Sam@Example.com', firstName: 'Sam' },
        { email: 'bad@example.com' },
        { phone: '+9200000000' },
      ],
    );
    expect(result).toEqual({ pushed: 1, failed: 1 });
    const hash = createHash('md5').update('sam@example.com').digest('hex');
    expect(mockedAxios.put.mock.calls[0][0]).toBe(
      `https://us9.api.mailchimp.com/3.0/lists/list1/members/${hash}`,
    );
  });
});

describe('KlaviyoConnector', () => {
  const connector = new KlaviyoConnector();

  it('proves the private key with a real request before storing it', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        data: [
          {
            attributes: {
              contact_information: { organization_name: 'Olivia Salon' },
            },
          },
        ],
      },
    });
    const tokens = await connector.handleCallback('', {
      privateApiKey: 'pk_123',
    });
    expect(tokens).toMatchObject({
      accessToken: 'pk_123',
      providerMeta: { account: 'Olivia Salon' },
    });
    const [url, options] = mockedAxios.get.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(url).toBe('https://a.klaviyo.com/api/accounts/');
    expect(options.headers.Authorization).toBe('Klaviyo-API-Key pk_123');
  });

  it('refuses to connect without a key', async () => {
    await expect(connector.handleCallback('', {})).rejects.toThrow(
      'private API key',
    );
  });

  it('imports each profile with the profile-import upsert', async () => {
    mockedAxios.post.mockResolvedValue({ data: {} });
    const result = await connector.pushContacts({ accessToken: 'pk_123' }, {}, [
      { email: 'a@x.com', firstName: 'A' },
      { phone: '+92300' },
      {},
    ]);
    expect(result).toEqual({ pushed: 2, failed: 0 });
    const [url, body] = mockedAxios.post.mock.calls[0] as [
      string,
      { data: { attributes: { email: string; first_name: string } } },
    ];
    expect(url).toBe('https://a.klaviyo.com/api/profile-import/');
    expect(body.data.attributes).toMatchObject({
      email: 'a@x.com',
      first_name: 'A',
    });
  });
});

describe('SlackConnector', () => {
  const connector = new SlackConnector(config);

  it('requests only the incoming-webhook scope', () => {
    expect(new URL(connector.authUrl('s')).searchParams.get('scope')).toBe(
      'incoming-webhook',
    );
  });

  it('keeps the granted channel webhook and team name', async () => {
    mockedAxios.post.mockResolvedValue({
      data: {
        ok: true,
        access_token: 'xoxb',
        team: { name: 'Olivia HQ' },
        incoming_webhook: {
          url: 'https://hooks.slack.com/services/T/B/X',
          channel: '#alerts',
        },
      },
    });
    const tokens = await connector.handleCallback('code');
    expect(tokens.providerMeta).toEqual({
      webhookUrl: 'https://hooks.slack.com/services/T/B/X',
      channel: '#alerts',
      team: 'Olivia HQ',
    });
  });

  it('surfaces Slack’s own error when no webhook was granted', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { ok: false, error: 'invalid_code' },
    });
    await expect(connector.handleCallback('bad')).rejects.toThrow(
      'invalid_code',
    );
  });

  it('posts the text to the channel webhook', async () => {
    mockedAxios.post.mockResolvedValue({ data: 'ok' });
    await connector.postMessage(
      {
        accessToken: 'x',
        providerMeta: { webhookUrl: 'https://hooks.slack.com/services/T/B/X' },
      },
      {},
      '*New sale* — 8400',
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/T/B/X',
      { text: '*New sale* — 8400' },
      { timeout: 10_000 },
    );
  });
});

describe('ZoomConnector', () => {
  const connector = new ZoomConnector(config);

  it('exchanges the code with basic client authentication', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { access_token: 'z', refresh_token: 'zr', expires_in: 3600 },
    });
    const tokens = await connector.handleCallback('code');
    expect(tokens).toMatchObject({ accessToken: 'z', refreshToken: 'zr' });
    const [, , options] = mockedAxios.post.mock.calls[0] as unknown as [
      string,
      string,
      { auth: { username: string } },
    ];
    expect(options.auth.username).toBe('zm-id');
  });

  it('creates a scheduled meeting and returns its join link', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { id: 8675309, join_url: 'https://zoom.us/j/8675309' },
    });
    const meeting = await connector.createMeeting(
      { accessToken: 'z' },
      {},
      {
        topic: 'Consultation',
        startsAt: '2026-09-30T10:00:00.000Z',
        durationMinutes: 45,
      },
    );
    expect(meeting).toEqual({
      externalId: '8675309',
      joinUrl: 'https://zoom.us/j/8675309',
    });
    const [url, body] = mockedAxios.post.mock.calls[0] as [
      string,
      { type: number; duration: number },
    ];
    expect(url).toBe('https://api.zoom.us/v2/users/me/meetings');
    expect(body).toMatchObject({ type: 2, duration: 45 });
  });
});

describe('WhatsAppConnector', () => {
  const connector = new WhatsAppConnector(config);

  it('verifies the phone number id and token with a Graph API request before storing', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        display_phone_number: '+92 300 0000000',
        verified_name: 'Olivia Salon',
      },
    });
    const tokens = await connector.handleCallback('', {
      phoneNumberId: '123',
      accessToken: 'EAAB',
    });
    expect(tokens).toMatchObject({
      accessToken: 'EAAB',
      providerMeta: {
        phoneNumberId: '123',
        displayPhoneNumber: '+92 300 0000000',
        verifiedName: 'Olivia Salon',
      },
    });
    expect(mockedAxios.get.mock.calls[0][0]).toBe(
      'https://graph.facebook.com/v19.0/123',
    );
  });

  it('refuses to connect without both values', async () => {
    await expect(
      connector.handleCallback('', { phoneNumberId: '123' }),
    ).rejects.toThrow('phone number ID');
  });
});
