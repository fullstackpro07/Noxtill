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
exports.ThreadsConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const standard_oauth2_connector_1 = require("./standard-oauth2.connector");
const prisma_1 = require("../../../generated/prisma");
const API = 'https://graph.threads.net/v1.0';
let ThreadsConnector = class ThreadsConnector extends standard_oauth2_connector_1.StandardOAuth2Connector {
    platform = prisma_1.SocialPlatform.threads;
    oauth = {
        authorizeUrl: 'https://threads.net/oauth/authorize',
        tokenUrl: 'https://graph.threads.net/oauth/access_token',
        scope: 'threads_basic,threads_content_publish,threads_manage_replies',
        clientIdEnvKey: 'THREADS_APP_ID',
        clientSecretEnvKey: 'THREADS_APP_SECRET',
        redirectSegment: 'threads',
    };
    constructor(config) {
        super(config);
    }
    async fetchAccountInfo(tokens) {
        const response = await axios_1.default.get(`${API}/me`, {
            params: { fields: 'id,username', access_token: tokens.accessToken },
        });
        return {
            externalAccountId: response.data.id,
            externalAccountName: response.data.username,
        };
    }
    async publish(tokens, post, meta) {
        const userId = meta.threadsUserId ?? 'me';
        const container = await axios_1.default.post(`${API}/${userId}/threads`, {
            media_type: post.mediaUrls.length ? 'IMAGE' : 'TEXT',
            text: post.caption,
            image_url: post.mediaUrls[0],
            access_token: tokens.accessToken,
        });
        const published = await axios_1.default.post(`${API}/${userId}/threads_publish`, {
            creation_id: container.data.id,
            access_token: tokens.accessToken,
        });
        return { externalId: published.data.id };
    }
    async fetchInbox(tokens, meta) {
        const postId = meta.recentPostId;
        if (!postId)
            return [];
        const response = await axios_1.default.get(`${API}/${postId}/replies`, {
            params: { access_token: tokens.accessToken },
        });
        return response.data.data.map((r) => ({
            externalId: r.id,
            kind: 'comment',
            authorName: r.username,
            text: r.text,
            postExternalId: postId,
            receivedAt: r.timestamp,
        }));
    }
    async replyToInboxItem(tokens, target, text) {
        await axios_1.default.post(`${API}/me/threads`, {
            text,
            reply_to_id: target.externalId,
            access_token: tokens.accessToken,
        });
    }
    async fetchInsights(tokens, meta) {
        const userId = meta.threadsUserId ?? 'me';
        const response = await axios_1.default.get(`${API}/${userId}/threads_insights`, {
            params: {
                metric: 'views,likes,replies,followers_count',
                access_token: tokens.accessToken,
            },
        });
        const byName = (name) => response.data.data.find((m) => m.name === name)?.values?.[0]?.value ?? 0;
        return {
            followers: byName('followers_count'),
            reach: byName('views'),
            impressions: byName('views'),
            engagement: byName('likes') + byName('replies'),
        };
    }
};
exports.ThreadsConnector = ThreadsConnector;
exports.ThreadsConnector = ThreadsConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ThreadsConnector);
//# sourceMappingURL=threads.connector.js.map