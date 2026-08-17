import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { FacebookConnector } from './facebook.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FacebookConnector (UPD-BE-045, via StandardOAuth2Connector)', () => {
  const config = new ConfigService({
    FACEBOOK_APP_ID: 'test-app-id',
    FACEBOOK_APP_SECRET: 'test-app-secret',
    BACKEND_URL: 'http://localhost:5000/api/v1',
  });
  const connector = new FacebookConnector(config);

  afterEach(() => jest.clearAllMocks());

  it('builds a real facebook.com authorize URL under /social/facebook/callback', () => {
    const url = new URL(connector.authUrl('signed-state'));
    expect(url.origin + url.pathname).toBe(
      'https://www.facebook.com/v19.0/dialog/oauth',
    );
    expect(url.searchParams.get('client_id')).toBe('test-app-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5000/api/v1/social/facebook/callback',
    );
    expect(url.searchParams.get('state')).toBe('signed-state');
  });

  it('handleCallback() exchanges the code, then fetches the real account identity in one flow', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { access_token: 'fb-token', expires_in: 5184000 },
    });
    mockedAxios.get.mockResolvedValue({
      data: { id: 'page-1', name: 'My Page' },
    });

    const result = await connector.handleCallback('some-code');
    expect(result.accessToken).toBe('fb-token');
    expect(result.externalAccountId).toBe('page-1');
    expect(result.externalAccountName).toBe('My Page');
  });

  it('publish() POSTs to the real Page feed endpoint', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'post-1' } });
    const result = await connector.publish(
      { accessToken: 'fb-token' },
      { caption: 'Hello world', mediaUrls: ['https://example.com/pic.jpg'] },
      { pageId: '123' },
    );
    expect(result.externalId).toBe('post-1');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://graph.facebook.com/v19.0/123/feed',
      expect.objectContaining({ message: 'Hello world' }),
      expect.objectContaining({ params: { access_token: 'fb-token' } }),
    );
  });

  it('fetchInbox() lists real comments, replyToInboxItem() posts a real reply', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        data: [
          {
            id: 'c1',
            message: 'Nice!',
            from: { name: 'Alice' },
            created_time: '2026-01-01T00:00:00Z',
          },
        ],
      },
    });
    const inbox = await connector.fetchInbox(
      { accessToken: 'fb-token' },
      { pageId: '123' },
    );
    expect(inbox).toEqual([
      {
        externalId: 'c1',
        kind: 'comment',
        authorName: 'Alice',
        text: 'Nice!',
        receivedAt: '2026-01-01T00:00:00Z',
      },
    ]);

    mockedAxios.post.mockResolvedValue({ data: {} });
    await connector.replyToInboxItem(
      { accessToken: 'fb-token' },
      { externalId: 'c1' },
      'Thanks!',
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://graph.facebook.com/v19.0/c1/comments',
      { message: 'Thanks!' },
      expect.objectContaining({ params: { access_token: 'fb-token' } }),
    );
  });

  it('fetchInsights() pulls real Page insights metrics', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        data: [
          { name: 'page_fans', values: [{ value: 500 }] },
          { name: 'page_impressions', values: [{ value: 1000 }] },
        ],
      },
    });
    const insights = await connector.fetchInsights(
      { accessToken: 'fb-token' },
      { pageId: '123' },
    );
    expect(insights.followers).toBe(500);
    expect(insights.impressions).toBe(1000);
  });
});
