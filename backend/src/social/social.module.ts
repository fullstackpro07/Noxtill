import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SocialAccountsService } from './social-accounts.service';
import { SocialAccountsController } from './social-accounts.controller';
import { SocialPostsService } from './social-posts.service';
import { SocialPostsController } from './social-posts.controller';
import { MediaLibraryService } from './media-library.service';
import { MediaLibraryController } from './media-library.controller';
import { AiContentStudioService } from './ai-content-studio.service';
import { AiContentController } from './ai-content.controller';
import { SocialInboxService } from './social-inbox.service';
import { SocialInboxController } from './social-inbox.controller';
import { SocialWebhookController } from './social-webhook.controller';
import { SocialAnalyticsService } from './social-analytics.service';
import { SocialAnalyticsController } from './social-analytics.controller';
import { SocialSettingsService } from './social-settings.service';
import { SocialSettingsController } from './social-settings.controller';
import { SocialConnectorRegistry } from './connectors/social-connector-registry';
import { FacebookConnector } from './connectors/facebook.connector';
import { InstagramConnector } from './connectors/instagram.connector';
import { TwitterConnector } from './connectors/twitter.connector';
import { LinkedinConnector } from './connectors/linkedin.connector';
import { TiktokConnector } from './connectors/tiktok.connector';
import { YoutubeConnector } from './connectors/youtube.connector';
import { PinterestConnector } from './connectors/pinterest.connector';
import { SnapchatConnector } from './connectors/snapchat.connector';
import { ThreadsConnector } from './connectors/threads.connector';
import { RedditConnector } from './connectors/reddit.connector';
import { TumblrConnector } from './connectors/tumblr.connector';
import { TelegramConnector } from './connectors/telegram.connector';
import { DiscordConnector } from './connectors/discord.connector';
import { WechatConnector } from './connectors/wechat.connector';
import { LineConnector } from './connectors/line.connector';
import { SocialPublishProcessor } from './jobs/social-publish.processor';
import { SocialWebhookProcessor } from './jobs/social-webhook.processor';
import { SocialAnalyticsScheduler } from './jobs/social-analytics.scheduler';
import { SocialAnalyticsProcessor } from './jobs/social-analytics.processor';
import {
  SOCIAL_ANALYTICS_QUEUE,
  SOCIAL_PUBLISH_QUEUE,
  SOCIAL_WEBHOOK_QUEUE,
} from './social.constants';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: SOCIAL_PUBLISH_QUEUE },
      { name: SOCIAL_ANALYTICS_QUEUE },
      { name: SOCIAL_WEBHOOK_QUEUE },
    ),
    IntegrationsModule,
    AiModule,
  ],
  controllers: [
    SocialAccountsController,
    SocialPostsController,
    MediaLibraryController,
    AiContentController,
    SocialInboxController,
    SocialWebhookController,
    SocialAnalyticsController,
    SocialSettingsController,
  ],
  providers: [
    SocialConnectorRegistry,
    FacebookConnector,
    InstagramConnector,
    TwitterConnector,
    LinkedinConnector,
    TiktokConnector,
    YoutubeConnector,
    PinterestConnector,
    SnapchatConnector,
    ThreadsConnector,
    RedditConnector,
    TumblrConnector,
    TelegramConnector,
    DiscordConnector,
    WechatConnector,
    LineConnector,
    SocialAccountsService,
    SocialPostsService,
    MediaLibraryService,
    AiContentStudioService,
    SocialInboxService,
    SocialAnalyticsService,
    SocialSettingsService,
    SocialPublishProcessor,
    SocialWebhookProcessor,
    SocialAnalyticsScheduler,
    SocialAnalyticsProcessor,
  ],
  exports: [
    SocialAccountsService,
    SocialPostsService,
    MediaLibraryService,
    SocialInboxService,
    SocialAnalyticsService,
  ],
})
export class SocialModule {}
