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
import { SocialPlatform } from '../../../generated/prisma';
export declare class SocialConnectorRegistry {
    private readonly byPlatform;
    constructor(facebook: FacebookConnector, instagram: InstagramConnector, twitter: TwitterConnector, linkedin: LinkedinConnector, tiktok: TiktokConnector, youtube: YoutubeConnector, pinterest: PinterestConnector, snapchat: SnapchatConnector, threads: ThreadsConnector, reddit: RedditConnector, tumblr: TumblrConnector, telegram: TelegramConnector, discord: DiscordConnector, wechat: WechatConnector, line: LineConnector);
    get(platform: SocialPlatform): SocialConnector;
    all(): SocialPlatform[];
}
