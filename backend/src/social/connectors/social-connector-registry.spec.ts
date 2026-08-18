import { ConfigService } from '@nestjs/config';
import { SocialConnectorRegistry } from './social-connector-registry';
import { FacebookConnector } from './facebook.connector';
import { InstagramConnector } from './instagram.connector';
import { TwitterConnector } from './twitter.connector';
import { LinkedinConnector } from './linkedin.connector';
import { TiktokConnector } from './tiktok.connector';
import { YoutubeConnector } from './youtube.connector';
import { PinterestConnector } from './pinterest.connector';
import { SnapchatConnector } from './snapchat.connector';
import { ThreadsConnector } from './threads.connector';
import { RedditConnector } from './reddit.connector';
import { TumblrConnector } from './tumblr.connector';
import { TelegramConnector } from './telegram.connector';
import { DiscordConnector } from './discord.connector';
import { WechatConnector } from './wechat.connector';
import { LineConnector } from './line.connector';
import { SocialPlatform } from '@prisma/client';

const OAUTH_PLATFORMS = new Set<SocialPlatform>([
  SocialPlatform.facebook,
  SocialPlatform.instagram,
  SocialPlatform.twitter,
  SocialPlatform.linkedin,
  SocialPlatform.tiktok,
  SocialPlatform.youtube,
  SocialPlatform.pinterest,
  SocialPlatform.snapchat,
  SocialPlatform.threads,
  SocialPlatform.reddit,
  SocialPlatform.tumblr,
]);

describe('SocialConnectorRegistry — all 15 platforms (UPD-BE-045)', () => {
  const config = new ConfigService({});
  const registry = new SocialConnectorRegistry(
    new FacebookConnector(config),
    new InstagramConnector(config),
    new TwitterConnector(config),
    new LinkedinConnector(config),
    new TiktokConnector(config),
    new YoutubeConnector(config),
    new PinterestConnector(config),
    new SnapchatConnector(config),
    new ThreadsConnector(config),
    new RedditConnector(config),
    new TumblrConnector(config),
    new TelegramConnector(),
    new DiscordConnector(),
    new WechatConnector(),
    new LineConnector(),
  );

  it('all() lists exactly the 15 real platforms this milestone covers', () => {
    expect(registry.all()).toHaveLength(15);
  });

  it.each(Object.values(SocialPlatform))(
    'get(%s) resolves a connector whose declared `platform` matches and implements the full interface',
    (platform) => {
      const connector = registry.get(platform);
      expect(connector.platform).toBe(platform);
      expect(typeof connector.authUrl).toBe('function');
      expect(typeof connector.handleCallback).toBe('function');
      expect(typeof connector.publish).toBe('function');
      expect(typeof connector.fetchInbox).toBe('function');
      expect(typeof connector.replyToInboxItem).toBe('function');
      expect(typeof connector.fetchInsights).toBe('function');
      expect(typeof connector.disconnect).toBe('function');
    },
  );

  it.each(Object.values(SocialPlatform))(
    '%s: authUrl() is real OAuth2 (non-null) for the 11 OAuth platforms, null for the 4 token-based ones',
    (platform) => {
      const connector = registry.get(platform);
      const url = connector.authUrl('state');
      if (OAUTH_PLATFORMS.has(platform)) {
        expect(url).not.toBeNull();
      } else {
        expect(url).toBeNull();
      }
    },
  );
});
