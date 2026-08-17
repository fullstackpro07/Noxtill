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
exports.PinterestConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const standard_oauth2_connector_1 = require("./standard-oauth2.connector");
const prisma_1 = require("../../../generated/prisma");
const API = 'https://api.pinterest.com/v5';
let PinterestConnector = class PinterestConnector extends standard_oauth2_connector_1.StandardOAuth2Connector {
    platform = prisma_1.SocialPlatform.pinterest;
    oauth = {
        authorizeUrl: 'https://www.pinterest.com/oauth',
        tokenUrl: `${API}/oauth/token`,
        scope: 'boards:read,pins:read,pins:write',
        clientIdEnvKey: 'PINTEREST_APP_ID',
        clientSecretEnvKey: 'PINTEREST_APP_SECRET',
        redirectSegment: 'pinterest',
    };
    constructor(config) {
        super(config);
    }
    async fetchAccountInfo(tokens) {
        const response = await axios_1.default.get(`${API}/user_account`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return {
            externalAccountId: response.data.username,
            externalAccountName: response.data.username,
        };
    }
    async publish(tokens, post, meta) {
        const boardId = meta.boardId;
        const response = await axios_1.default.post(`${API}/pins`, {
            board_id: boardId,
            description: post.caption,
            media_source: { source_type: 'image_url', url: post.mediaUrls[0] },
        }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
        return { externalId: response.data.id };
    }
    async fetchInbox(tokens, meta) {
        const pinId = meta.recentPinId;
        if (!pinId)
            return [];
        const response = await axios_1.default.get(`${API}/pins/${pinId}/comments`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return response.data.items.map((c) => ({
            externalId: c.id,
            kind: 'comment',
            authorName: c.author.username,
            text: c.text,
            postExternalId: pinId,
            receivedAt: c.created_at,
        }));
    }
    async replyToInboxItem(tokens, target, text) {
        const pinId = target.postExternalId ?? target.externalId;
        await axios_1.default.post(`${API}/pins/${pinId}/comments`, { text }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    }
    async fetchInsights(tokens, meta) {
        const response = await axios_1.default.get(`${API}/user_account/analytics`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        const metrics = response.data.all.daily_metrics[0]?.metrics;
        return {
            followers: 0,
            reach: metrics?.PIN_CLICK_RATE ?? 0,
            impressions: metrics?.IMPRESSION ?? 0,
            engagement: metrics?.ENGAGEMENT ?? 0,
        };
    }
};
exports.PinterestConnector = PinterestConnector;
exports.PinterestConnector = PinterestConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PinterestConnector);
//# sourceMappingURL=pinterest.connector.js.map