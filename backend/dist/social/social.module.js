"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const social_accounts_service_1 = require("./social-accounts.service");
const social_accounts_controller_1 = require("./social-accounts.controller");
const social_posts_service_1 = require("./social-posts.service");
const social_posts_controller_1 = require("./social-posts.controller");
const media_library_service_1 = require("./media-library.service");
const media_library_controller_1 = require("./media-library.controller");
const ai_content_studio_service_1 = require("./ai-content-studio.service");
const ai_content_controller_1 = require("./ai-content.controller");
const social_inbox_service_1 = require("./social-inbox.service");
const social_inbox_controller_1 = require("./social-inbox.controller");
const social_webhook_controller_1 = require("./social-webhook.controller");
const social_analytics_service_1 = require("./social-analytics.service");
const social_analytics_controller_1 = require("./social-analytics.controller");
const social_settings_service_1 = require("./social-settings.service");
const social_settings_controller_1 = require("./social-settings.controller");
const social_connector_registry_1 = require("./connectors/social-connector-registry");
const facebook_connector_1 = require("./connectors/facebook.connector");
const instagram_connector_1 = require("./connectors/instagram.connector");
const twitter_connector_1 = require("./connectors/twitter.connector");
const linkedin_connector_1 = require("./connectors/linkedin.connector");
const tiktok_connector_1 = require("./connectors/tiktok.connector");
const youtube_connector_1 = require("./connectors/youtube.connector");
const pinterest_connector_1 = require("./connectors/pinterest.connector");
const snapchat_connector_1 = require("./connectors/snapchat.connector");
const threads_connector_1 = require("./connectors/threads.connector");
const reddit_connector_1 = require("./connectors/reddit.connector");
const tumblr_connector_1 = require("./connectors/tumblr.connector");
const telegram_connector_1 = require("./connectors/telegram.connector");
const discord_connector_1 = require("./connectors/discord.connector");
const wechat_connector_1 = require("./connectors/wechat.connector");
const line_connector_1 = require("./connectors/line.connector");
const social_publish_processor_1 = require("./jobs/social-publish.processor");
const social_webhook_processor_1 = require("./jobs/social-webhook.processor");
const social_analytics_scheduler_1 = require("./jobs/social-analytics.scheduler");
const social_analytics_processor_1 = require("./jobs/social-analytics.processor");
const social_constants_1 = require("./social.constants");
const integrations_module_1 = require("../integrations/integrations.module");
const ai_module_1 = require("../ai/ai.module");
let SocialModule = class SocialModule {
};
exports.SocialModule = SocialModule;
exports.SocialModule = SocialModule = __decorate([
    (0, common_1.Module)({
        imports: [
            bullmq_1.BullModule.registerQueue({ name: social_constants_1.SOCIAL_PUBLISH_QUEUE }, { name: social_constants_1.SOCIAL_ANALYTICS_QUEUE }, { name: social_constants_1.SOCIAL_WEBHOOK_QUEUE }),
            integrations_module_1.IntegrationsModule,
            ai_module_1.AiModule,
        ],
        controllers: [
            social_accounts_controller_1.SocialAccountsController,
            social_posts_controller_1.SocialPostsController,
            media_library_controller_1.MediaLibraryController,
            ai_content_controller_1.AiContentController,
            social_inbox_controller_1.SocialInboxController,
            social_webhook_controller_1.SocialWebhookController,
            social_analytics_controller_1.SocialAnalyticsController,
            social_settings_controller_1.SocialSettingsController,
        ],
        providers: [
            social_connector_registry_1.SocialConnectorRegistry,
            facebook_connector_1.FacebookConnector,
            instagram_connector_1.InstagramConnector,
            twitter_connector_1.TwitterConnector,
            linkedin_connector_1.LinkedinConnector,
            tiktok_connector_1.TiktokConnector,
            youtube_connector_1.YoutubeConnector,
            pinterest_connector_1.PinterestConnector,
            snapchat_connector_1.SnapchatConnector,
            threads_connector_1.ThreadsConnector,
            reddit_connector_1.RedditConnector,
            tumblr_connector_1.TumblrConnector,
            telegram_connector_1.TelegramConnector,
            discord_connector_1.DiscordConnector,
            wechat_connector_1.WechatConnector,
            line_connector_1.LineConnector,
            social_accounts_service_1.SocialAccountsService,
            social_posts_service_1.SocialPostsService,
            media_library_service_1.MediaLibraryService,
            ai_content_studio_service_1.AiContentStudioService,
            social_inbox_service_1.SocialInboxService,
            social_analytics_service_1.SocialAnalyticsService,
            social_settings_service_1.SocialSettingsService,
            social_publish_processor_1.SocialPublishProcessor,
            social_webhook_processor_1.SocialWebhookProcessor,
            social_analytics_scheduler_1.SocialAnalyticsScheduler,
            social_analytics_processor_1.SocialAnalyticsProcessor,
        ],
        exports: [
            social_accounts_service_1.SocialAccountsService,
            social_posts_service_1.SocialPostsService,
            media_library_service_1.MediaLibraryService,
            social_inbox_service_1.SocialInboxService,
            social_analytics_service_1.SocialAnalyticsService,
        ],
    })
], SocialModule);
//# sourceMappingURL=social.module.js.map