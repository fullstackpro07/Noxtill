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
exports.YoutubeConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const standard_oauth2_connector_1 = require("./standard-oauth2.connector");
const prisma_1 = require("../../../generated/prisma");
const API = 'https://www.googleapis.com/youtube/v3';
let YoutubeConnector = class YoutubeConnector extends standard_oauth2_connector_1.StandardOAuth2Connector {
    platform = prisma_1.SocialPlatform.youtube;
    oauth = {
        authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
        clientIdEnvKey: 'GOOGLE_OAUTH_CLIENT_ID',
        clientSecretEnvKey: 'GOOGLE_OAUTH_CLIENT_SECRET',
        redirectSegment: 'youtube',
    };
    constructor(config) {
        super(config);
    }
    async fetchAccountInfo(tokens) {
        const response = await axios_1.default.get(`${API}/channels`, {
            params: { part: 'snippet', mine: true },
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        const channel = response.data.items[0];
        return {
            externalAccountId: channel.id,
            externalAccountName: channel.snippet.title,
        };
    }
    async publish(tokens, post, meta) {
        const response = await axios_1.default.post(`${API}/videos`, {
            snippet: { title: post.caption, description: post.caption },
            status: {
                privacyStatus: meta.privacyStatus ?? 'public',
            },
        }, {
            params: { part: 'snippet,status', uploadType: 'resumable' },
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return { externalId: response.data.id };
    }
    async fetchInbox(tokens, meta) {
        const videoId = meta.recentVideoId;
        if (!videoId)
            return [];
        const response = await axios_1.default.get(`${API}/commentThreads`, {
            params: { part: 'snippet', videoId },
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return response.data.items.map((thread) => ({
            externalId: thread.id,
            kind: 'comment',
            authorName: thread.snippet.topLevelComment.snippet.authorDisplayName,
            text: thread.snippet.topLevelComment.snippet.textDisplay,
            postExternalId: videoId,
            receivedAt: thread.snippet.topLevelComment.snippet.publishedAt,
        }));
    }
    async replyToInboxItem(tokens, target, text) {
        await axios_1.default.post(`${API}/comments`, { snippet: { parentId: target.externalId, textOriginal: text } }, {
            params: { part: 'snippet' },
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
    }
    async fetchInsights(tokens, meta) {
        const response = await axios_1.default.get(`${API}/channels`, {
            params: { part: 'statistics', mine: true },
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        const stats = response.data.items[0].statistics;
        return {
            followers: Number(stats.subscriberCount),
            reach: 0,
            impressions: Number(stats.viewCount),
            engagement: 0,
        };
    }
};
exports.YoutubeConnector = YoutubeConnector;
exports.YoutubeConnector = YoutubeConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], YoutubeConnector);
//# sourceMappingURL=youtube.connector.js.map