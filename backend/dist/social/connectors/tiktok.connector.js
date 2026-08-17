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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TiktokConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const standard_oauth2_connector_1 = require("./standard-oauth2.connector");
const prisma_1 = require("../../../generated/prisma");
const API = 'https://open.tiktokapis.com/v2';
let TiktokConnector = class TiktokConnector extends standard_oauth2_connector_1.StandardOAuth2Connector {
    platform = prisma_1.SocialPlatform.tiktok;
    oauth = {
        authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize',
        tokenUrl: `${API}/oauth/token/`,
        scope: 'user.info.basic,video.publish,video.list',
        clientIdEnvKey: 'TIKTOK_CLIENT_KEY',
        clientSecretEnvKey: 'TIKTOK_CLIENT_SECRET',
        redirectSegment: 'tiktok',
    };
    constructor(config) {
        super(config);
    }
    async fetchAccountInfo(tokens) {
        const response = await axios_1.default.get(`${API}/user/info/`, {
            params: { fields: 'open_id,display_name' },
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return {
            externalAccountId: response.data.data.user.open_id,
            externalAccountName: response.data.data.user.display_name,
        };
    }
    async publish(tokens, post, meta) {
        const response = await axios_1.default.post(`${API}/post/publish/video/init/`, {
            post_info: { title: post.caption },
            source_info: { source: 'PULL_FROM_URL', video_url: post.mediaUrls[0] },
        }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
        return { externalId: response.data.data.publish_id };
    }
    async fetchInbox(tokens, meta) {
        const videoId = meta.recentVideoId;
        if (!videoId)
            return [];
        const response = await axios_1.default.get(`${API}/video/comment/list/`, {
            params: { video_id: videoId },
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return response.data.data.comments.map((c) => ({
            externalId: c.id,
            kind: 'comment',
            authorName: c.user.display_name,
            text: c.text,
            postExternalId: videoId,
            receivedAt: new Date(c.create_time * 1000).toISOString(),
        }));
    }
    async replyToInboxItem(tokens, target, text) {
        await axios_1.default.post(`${API}/video/comment/reply/`, { comment_id: target.externalId, text }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    }
    async fetchInsights(tokens, meta) {
        const response = await axios_1.default.get(`${API}/user/info/`, {
            params: { fields: 'follower_count,likes_count,video_count' },
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        const user = response.data.data.user;
        return {
            followers: user.follower_count,
            reach: 0,
            impressions: 0,
            engagement: user.likes_count,
        };
    }
};
exports.TiktokConnector = TiktokConnector;
exports.TiktokConnector = TiktokConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TiktokConnector);
//# sourceMappingURL=tiktok.connector.js.map