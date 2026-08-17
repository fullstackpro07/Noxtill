import { Injectable } from '@nestjs/common';
import { SocialConnector } from './social-connector.interface';
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

@Injectable()
export class SocialConnectorRegistry {
  private readonly byPlatform: Record<SocialPlatform, SocialConnector>;

  constructor(
    facebook: FacebookConnector,
    instagram: InstagramConnector,
    twitter: TwitterConnector,
    linkedin: LinkedinConnector,
    tiktok: TiktokConnector,
    youtube: YoutubeConnector,
    pinterest: PinterestConnector,
    snapchat: SnapchatConnector,
    threads: ThreadsConnector,
    reddit: RedditConnector,
    tumblr: TumblrConnector,
    telegram: TelegramConnector,
    discord: DiscordConnector,
    wechat: WechatConnector,
    line: LineConnector,
  ) {
    this.byPlatform = {
      [SocialPlatform.facebook]: facebook,
      [SocialPlatform.instagram]: instagram,
      [SocialPlatform.twitter]: twitter,
      [SocialPlatform.linkedin]: linkedin,
      [SocialPlatform.tiktok]: tiktok,
      [SocialPlatform.youtube]: youtube,
      [SocialPlatform.pinterest]: pinterest,
      [SocialPlatform.snapchat]: snapchat,
      [SocialPlatform.threads]: threads,
      [SocialPlatform.reddit]: reddit,
      [SocialPlatform.tumblr]: tumblr,
      [SocialPlatform.telegram]: telegram,
      [SocialPlatform.discord]: discord,
      [SocialPlatform.wechat]: wechat,
      [SocialPlatform.line]: line,
    };
  }

  get(platform: SocialPlatform): SocialConnector {
    return this.byPlatform[platform];
  }

  all(): SocialPlatform[] {
    return Object.values(SocialPlatform);
  }
}
