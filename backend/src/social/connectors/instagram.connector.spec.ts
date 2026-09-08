import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { InstagramConnector } from './instagram.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * Only `fetchPostInsights()` (UPD-BE-127) is covered here — a pre-existing gap, not one
 * introduced by this ticket: `InstagramConnector` had no spec file at all before this change.
 */
describe('InstagramConnector — fetchPostInsights (UPD-BE-127)', () => {
  const config = new ConfigService({
    FACEBOOK_APP_ID: 'test-app-id',
    FACEBOOK_APP_SECRET: 'test-app-secret',
    BACKEND_URL: 'http://localhost:5000/api/v1',
  });
  const connector = new InstagramConnector(config);

  afterEach(() => jest.clearAllMocks());

  it('pulls real per-media reach/likes/comments/saved/shares via the Graph API media insights edge', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        data: [
          { name: 'reach', values: [{ value: 300 }] },
          { name: 'likes', values: [{ value: 25 }] },
          { name: 'comments', values: [{ value: 4 }] },
          { name: 'saved', values: [{ value: 6 }] },
          { name: 'shares', values: [{ value: 2 }] },
        ],
      },
    });

    const result = await connector.fetchPostInsights(
      { accessToken: 'ig-token' },
      'media-1',
    );
    expect(result).toEqual({
      reach: 300,
      likes: 25,
      comments: 4,
      saves: 6,
      shares: 2,
      clicks: 0,
    });
    const [url, options] = mockedAxios.get.mock.calls[0] as [
      string,
      { params: { access_token: string; metric: string } },
    ];
    expect(url).toBe('https://graph.facebook.com/v19.0/media-1/insights');
    expect(options.params.access_token).toBe('ig-token');
    expect(options.params.metric).toBe('reach,likes,comments,saved,shares');
  });
});
