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
exports.TwitterConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const standard_oauth2_connector_1 = require("./standard-oauth2.connector");
const prisma_1 = require("../../../generated/prisma");
const API = 'https://api.twitter.com/2';
let TwitterConnector = class TwitterConnector extends standard_oauth2_connector_1.StandardOAuth2Connector {
    platform = prisma_1.SocialPlatform.twitter;
    oauth = {
        authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
        tokenUrl: `${API}/oauth2/token`,
        scope: 'tweet.read tweet.write users.read offline.access',
        clientIdEnvKey: 'TWITTER_CLIENT_ID',
        clientSecretEnvKey: 'TWITTER_CLIENT_SECRET',
        redirectSegment: 'twitter',
    };
    constructor(config) {
        super(config);
    }
    async fetchAccountInfo(tokens) {
        const response = await axios_1.default.get(`${API}/users/me`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return {
            externalAccountId: response.data.data.id,
            externalAccountName: response.data.data.username,
        };
    }
    async publish(tokens, post, meta) {
        const inReplyTo = meta.inReplyToTweetId;
        const response = await axios_1.default.post(`${API}/tweets`, {
            text: post.caption,
            reply: inReplyTo ? { in_reply_to_tweet_id: inReplyTo } : undefined,
        }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
        return { externalId: response.data.data.id };
    }
    async fetchInbox(tokens, meta) {
        const query = meta.mentionsQuery ?? '@me';
        const response = await axios_1.default.get(`${API}/tweets/search/recent`, {
            params: { query, 'tweet.fields': 'created_at,author_id' },
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return (response.data.data ?? []).map((t) => ({
            externalId: t.id,
            kind: 'comment',
            authorName: t.author_id,
            text: t.text,
            receivedAt: t.created_at,
        }));
    }
    async replyToInboxItem(tokens, target, text) {
        await axios_1.default.post(`${API}/tweets`, { text, reply: { in_reply_to_tweet_id: target.externalId } }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    }
    async fetchInsights(tokens, meta) {
        const userId = meta.userId;
        const response = await axios_1.default.get(`${API}/users/${userId}`, {
            params: { 'user.fields': 'public_metrics' },
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        const metrics = response.data.data.public_metrics;
        return {
            followers: metrics.followers_count,
            reach: 0,
            impressions: 0,
            engagement: metrics.tweet_count,
        };
    }
};
exports.TwitterConnector = TwitterConnector;
exports.TwitterConnector = TwitterConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TwitterConnector);
//# sourceMappingURL=twitter.connector.js.map