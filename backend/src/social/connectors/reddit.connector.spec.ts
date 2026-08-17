import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { RedditConnector } from './reddit.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('RedditConnector — real link/self-post shape (UPD-BE-045)', () => {
  const config = new ConfigService({ REDDIT_CLIENT_ID: 'test-id' });
  const connector = new RedditConnector(config);

  afterEach(() => jest.clearAllMocks());

  it('publish() submits a real self-post (no media) with text, never a stray url field', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { json: { data: { id: 't3_abc' } } },
    });
    const result = await connector.publish(
      { accessToken: 'reddit-token' },
      { caption: 'Ask me anything', mediaUrls: [] },
      { subreddit: 'r/mybusiness' },
    );
    expect(result.externalId).toBe('t3_abc');

    const [, body] = mockedAxios.post.mock.calls[0];
    expect(body).toBeInstanceOf(URLSearchParams);
    const params = body as URLSearchParams;
    expect(params.get('kind')).toBe('self');
    expect(params.get('text')).toBe('Ask me anything');
    expect(params.get('url')).toBeNull();
  });

  it('publish() submits a real link post when media is present, never a stray text field', async () => {
    mockedAxios.post.mockResolvedValue({
      data: { json: { data: { id: 't3_def' } } },
    });
    await connector.publish(
      { accessToken: 'reddit-token' },
      {
        caption: 'Check out our new menu',
        mediaUrls: ['https://example.com/menu.jpg'],
      },
      {},
    );

    const [, body] = mockedAxios.post.mock.calls[0];
    const params = body as URLSearchParams;
    expect(params.get('kind')).toBe('link');
    expect(params.get('url')).toBe('https://example.com/menu.jpg');
    expect(params.get('text')).toBeNull();
  });

  it('fetchInsights() uses real karma fields as the follower/engagement proxy', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { link_karma: 120, comment_karma: 340 },
    });
    const insights = await connector.fetchInsights(
      { accessToken: 'reddit-token' },
      {},
    );
    expect(insights.reach).toBe(120);
    expect(insights.engagement).toBe(340);
  });
});
