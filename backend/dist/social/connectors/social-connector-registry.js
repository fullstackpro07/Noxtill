"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialConnectorRegistry = void 0;
const common_1 = require("@nestjs/common");
const facebook_connector_1 = require("./facebook.connector");
const instagram_connector_1 = require("./instagram.connector");
const twitter_connector_1 = require("./twitter.connector");
const linkedin_connector_1 = require("./linkedin.connector");
const tiktok_connector_1 = require("./tiktok.connector");
const youtube_connector_1 = require("./youtube.connector");
const pinterest_connector_1 = require("./pinterest.connector");
const snapchat_connector_1 = require("./snapchat.connector");
const threads_connector_1 = require("./threads.connector");
const reddit_connector_1 = require("./reddit.connector");
const tumblr_connector_1 = require("./tumblr.connector");
const telegram_connector_1 = require("./telegram.connector");
const discord_connector_1 = require("./discord.connector");
const wechat_connector_1 = require("./wechat.connector");
const line_connector_1 = require("./line.connector");
const prisma_1 = require("../../../generated/prisma");
let SocialConnectorRegistry = class SocialConnectorRegistry {
    byPlatform;
    constructor(facebook, instagram, twitter, linkedin, tiktok, youtube, pinterest, snapchat, threads, reddit, tumblr, telegram, discord, wechat, line) {
        this.byPlatform = {
            [prisma_1.SocialPlatform.facebook]: facebook,
            [prisma_1.SocialPlatform.instagram]: instagram,
            [prisma_1.SocialPlatform.twitter]: twitter,
            [prisma_1.SocialPlatform.linkedin]: linkedin,
            [prisma_1.SocialPlatform.tiktok]: tiktok,
            [prisma_1.SocialPlatform.youtube]: youtube,
            [prisma_1.SocialPlatform.pinterest]: pinterest,
            [prisma_1.SocialPlatform.snapchat]: snapchat,
            [prisma_1.SocialPlatform.threads]: threads,
            [prisma_1.SocialPlatform.reddit]: reddit,
            [prisma_1.SocialPlatform.tumblr]: tumblr,
            [prisma_1.SocialPlatform.telegram]: telegram,
            [prisma_1.SocialPlatform.discord]: discord,
            [prisma_1.SocialPlatform.wechat]: wechat,
            [prisma_1.SocialPlatform.line]: line,
        };
    }
    get(platform) {
        return this.byPlatform[platform];
    }
    all() {
        return Object.values(prisma_1.SocialPlatform);
    }
};
exports.SocialConnectorRegistry = SocialConnectorRegistry;
exports.SocialConnectorRegistry = SocialConnectorRegistry = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [facebook_connector_1.FacebookConnector,
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
        line_connector_1.LineConnector])
], SocialConnectorRegistry);
//# sourceMappingURL=social-connector-registry.js.map