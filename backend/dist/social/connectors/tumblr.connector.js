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
exports.TumblrConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const standard_oauth2_connector_1 = require("./standard-oauth2.connector");
const prisma_1 = require("../../../generated/prisma");
const API = 'https://api.tumblr.com/v2';
let TumblrConnector = class TumblrConnector extends standard_oauth2_connector_1.StandardOAuth2Connector {
    platform = prisma_1.SocialPlatform.tumblr;
    oauth = {
        authorizeUrl: 'https://www.tumblr.com/oauth2/authorize',
        tokenUrl: `${API}/oauth2/token`,
        scope: 'write offline_access',
        clientIdEnvKey: 'TUMBLR_CLIENT_ID',
        clientSecretEnvKey: 'TUMBLR_CLIENT_SECRET',
        redirectSegment: 'tumblr',
    };
    constructor(config) {
        super(config);
    }
    async fetchAccountInfo(tokens) {
        const response = await axios_1.default.get(`${API}/user/info`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        const user = response.data.response.user;
        return {
            externalAccountId: user.blogs[0]?.name ?? user.name,
            externalAccountName: user.name,
        };
    }
    async publish(tokens, post, meta) {
        const blogIdentifier = meta.blogIdentifier;
        const response = await axios_1.default.post(`${API}/blog/${blogIdentifier}/posts`, {
            content: [
                post.mediaUrls.length
                    ? { type: 'image', media: [{ url: post.mediaUrls[0] }] }
                    : { type: 'text', text: post.caption },
            ],
        }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
        return { externalId: String(response.data.response.id) };
    }
    async fetchInbox(tokens, meta) {
        const blogIdentifier = meta.blogIdentifier;
        const postId = meta.recentPostId;
        if (!blogIdentifier || !postId)
            return [];
        const response = await axios_1.default.get(`${API}/blog/${blogIdentifier}/notes`, {
            params: { id: postId, mode: 'conversation' },
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return response.data.response.notes
            .filter((n) => n.type === 'reply' && n.reply_text)
            .map((n) => ({
            externalId: `${postId}-${n.blog_name}-${n.timestamp}`,
            kind: 'comment',
            authorName: n.blog_name,
            text: n.reply_text ?? '',
            postExternalId: postId,
            receivedAt: new Date(n.timestamp * 1000).toISOString(),
        }));
    }
    async replyToInboxItem(tokens, target, text) {
        const postId = target.postExternalId ?? target.externalId;
        await axios_1.default.post(`${API}/blog/me/post/reblog`, { id: postId, comment: text }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    }
    async fetchInsights(tokens, meta) {
        const blogIdentifier = meta.blogIdentifier;
        const response = await axios_1.default.get(`${API}/blog/${blogIdentifier}/info`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return {
            followers: response.data.response.blog.followers,
            reach: 0,
            impressions: 0,
            engagement: response.data.response.blog.posts,
        };
    }
};
exports.TumblrConnector = TumblrConnector;
exports.TumblrConnector = TumblrConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TumblrConnector);
//# sourceMappingURL=tumblr.connector.js.map