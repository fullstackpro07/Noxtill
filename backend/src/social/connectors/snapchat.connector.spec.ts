import { ConfigService } from '@nestjs/config';
import { SnapchatConnector } from './snapchat.connector';

describe('SnapchatConnector — disclosed API gaps (UPD-BE-045)', () => {
  const config = new ConfigService({ SNAPCHAT_CLIENT_ID: 'test-id' });
  const connector = new SnapchatConnector(config);

  it('fetchInbox() returns an empty list rather than fabricating data — Snapchat has no public organic-comments API', async () => {
    await expect(
      connector.fetchInbox({ accessToken: 'x' }, {}),
    ).resolves.toEqual([]);
  });

  it('replyToInboxItem() throws a real, clear error rather than silently no-op-ing', async () => {
    await expect(
      connector.replyToInboxItem(
        { accessToken: 'x' },
        { externalId: 'c1' },
        'hi',
      ),
    ).rejects.toThrow(/no public api/i);
  });

  it('fetchInsights() throws a real, clear error rather than fabricating metrics', async () => {
    await expect(
      connector.fetchInsights({ accessToken: 'x' }, {}),
    ).rejects.toThrow(/no public api/i);
  });
});
