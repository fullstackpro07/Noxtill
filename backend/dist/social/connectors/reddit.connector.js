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
exports.RedditConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const standard_oauth2_connector_1 = require("./standard-oauth2.connector");
const prisma_1 = require("../../../generated/prisma");
const API = 'https://oauth.reddit.com';
let RedditConnector = class RedditConnector extends standard_oauth2_connector_1.StandardOAuth2Connector {
    platform = prisma_1.SocialPlatform.reddit;
    oauth = {
        authorizeUrl: 'https://www.reddit.com/api/v1/authorize',
        tokenUrl: 'https://www.reddit.com/api/v1/access_token',
        scope: 'identity,submit,read,privatemessages',
        clientIdEnvKey: 'REDDIT_CLIENT_ID',
        clientSecretEnvKey: 'REDDIT_CLIENT_SECRET',
        redirectSegment: 'reddit',
    };
    constructor(config) {
        super(config);
    }
    async fetchAccountInfo(tokens) {
        const response = await axios_1.default.get(`${API}/api/v1/me`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return {
            externalAccountId: response.data.id,
            externalAccountName: response.data.name,
        };
    }
    async publish(tokens, post, meta) {
        const subreddit = meta.subreddit ?? 'u_self';
        const isLink = post.mediaUrls.length > 0;
        const params = {
            sr: subreddit,
            kind: isLink ? 'link' : 'self',
            title: post.caption,
        };
        if (isLink)
            params.url = post.mediaUrls[0];
        else
            params.text = post.caption;
        const response = await axios_1.default.post(`${API}/api/submit`, new URLSearchParams(params), { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
        return { externalId: response.data.json.data.id };
    }
    async fetchInbox(tokens, meta) {
        const kind = meta.inboxKind ?? 'comments';
        const response = await axios_1.default.get(`${API}/message/${kind}`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return response.data.data.children.map((c) => ({
            externalId: c.data.name,
            kind: kind === 'comments' ? 'comment' : 'dm',
            authorName: c.data.author,
            text: c.data.body,
            postExternalId: c.data.link_id,
            receivedAt: new Date(c.data.created_utc * 1000).toISOString(),
        }));
    }
    async replyToInboxItem(tokens, target, text) {
        await axios_1.default.post(`${API}/api/comment`, new URLSearchParams({ thing_id: target.externalId, text }), { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    }
    async fetchInsights(tokens, meta) {
        const response = await axios_1.default.get(`${API}/api/v1/me`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return {
            followers: 0,
            reach: response.data.link_karma,
            impressions: 0,
            engagement: response.data.comment_karma,
        };
    }
};
exports.RedditConnector = RedditConnector;
exports.RedditConnector = RedditConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedditConnector);
//# sourceMappingURL=reddit.connector.js.map