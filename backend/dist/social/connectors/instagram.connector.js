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
exports.InstagramConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const standard_oauth2_connector_1 = require("./standard-oauth2.connector");
const prisma_1 = require("../../../generated/prisma");
const GRAPH = 'https://graph.facebook.com/v19.0';
let InstagramConnector = class InstagramConnector extends standard_oauth2_connector_1.StandardOAuth2Connector {
    platform = prisma_1.SocialPlatform.instagram;
    oauth = {
        authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
        tokenUrl: `${GRAPH}/oauth/access_token`,
        scope: 'instagram_basic,instagram_content_publish,pages_show_list',
        clientIdEnvKey: 'FACEBOOK_APP_ID',
        clientSecretEnvKey: 'FACEBOOK_APP_SECRET',
        redirectSegment: 'instagram',
    };
    constructor(config) {
        super(config);
    }
    async fetchAccountInfo(tokens) {
        const response = await axios_1.default.get(`${GRAPH}/me`, {
            params: { access_token: tokens.accessToken, fields: 'id,username' },
        });
        return {
            externalAccountId: response.data.id,
            externalAccountName: response.data.username,
        };
    }
    async publish(tokens, post, meta) {
        const igUserId = meta.igUserId;
        if (!igUserId)
            throw new Error('No Instagram Business account selected for this business');
        const container = await axios_1.default.post(`${GRAPH}/${igUserId}/media`, { image_url: post.mediaUrls[0], caption: post.caption }, { params: { access_token: tokens.accessToken } });
        const published = await axios_1.default.post(`${GRAPH}/${igUserId}/media_publish`, { creation_id: container.data.id }, { params: { access_token: tokens.accessToken } });
        return { externalId: published.data.id };
    }
    async fetchInbox(tokens, meta) {
        const mediaId = meta.recentMediaId;
        if (!mediaId)
            return [];
        const response = await axios_1.default.get(`${GRAPH}/${mediaId}/comments`, {
            params: { access_token: tokens.accessToken },
        });
        return response.data.data.map((c) => ({
            externalId: c.id,
            kind: 'comment',
            authorName: c.username,
            text: c.text,
            postExternalId: mediaId,
            receivedAt: c.timestamp,
        }));
    }
    async replyToInboxItem(tokens, target, text) {
        await axios_1.default.post(`${GRAPH}/${target.externalId}/replies`, { message: text }, { params: { access_token: tokens.accessToken } });
    }
    async fetchInsights(tokens, meta) {
        const igUserId = meta.igUserId;
        const response = await axios_1.default.get(`${GRAPH}/${igUserId}/insights`, {
            params: {
                access_token: tokens.accessToken,
                metric: 'impressions,reach,profile_views,follower_count',
                period: 'day',
            },
        });
        const byName = (name) => response.data.data.find((m) => m.name === name)?.values?.[0]?.value ?? 0;
        return {
            followers: byName('follower_count'),
            reach: byName('reach'),
            impressions: byName('impressions'),
            engagement: byName('profile_views'),
        };
    }
};
exports.InstagramConnector = InstagramConnector;
exports.InstagramConnector = InstagramConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], InstagramConnector);
//# sourceMappingURL=instagram.connector.js.map