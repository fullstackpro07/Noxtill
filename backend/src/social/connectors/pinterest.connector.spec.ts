import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { PinterestConnector } from './pinterest.connector';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PinterestConnector — postExternalId reply quirk (UPD-BE-045)', () => {
  const config = new ConfigService({ PINTEREST_APP_ID: 'test-id' });
  const connector = new PinterestConnector(config);

  afterEach(() => jest.clearAllMocks());

  it('replyToInboxItem() targets the PIN (postExternalId), not the comment id — Pinterest has no reply-to-comment endpoint', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'new-comment' } });
    await connector.replyToInboxItem(
      { accessToken: 'pin-token' },
      { externalId: 'comment-1', postExternalId: 'pin-99' },
      'Thanks for asking!',
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.pinterest.com/v5/pins/pin-99/comments',
      { text: 'Thanks for asking!' },
      expect.objectContaining({
        headers: { Authorization: 'Bearer pin-token' },
      }),
    );
  });

  it('replyToInboxItem() falls back to externalId when no postExternalId is given', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'new-comment' } });
    await connector.replyToInboxItem(
      { accessToken: 'pin-token' },
      { externalId: 'pin-99' },
      'Thanks!',
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.pinterest.com/v5/pins/pin-99/comments',
      expect.anything(),
      expect.anything(),
    );
  });
});
