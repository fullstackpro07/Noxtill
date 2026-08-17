"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LineConnector = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const token_based_connector_1 = require("./token-based.connector");
const prisma_1 = require("../../../generated/prisma");
const API = 'https://api.line.me/v2/bot';
let LineConnector = class LineConnector extends token_based_connector_1.TokenBasedConnector {
    platform = prisma_1.SocialPlatform.line;
    async verifyToken(token) {
        const response = await axios_1.default.get(`${API}/info`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return {
            externalAccountId: response.data.userId,
            externalAccountName: response.data.displayName,
        };
    }
    async publish(tokens, post, meta) {
        const messages = post.mediaUrls.length
            ? [
                { type: 'text', text: post.caption },
                {
                    type: 'image',
                    originalContentUrl: post.mediaUrls[0],
                    previewImageUrl: post.mediaUrls[0],
                },
            ]
            : [{ type: 'text', text: post.caption }];
        await axios_1.default.post(`${API}/message/broadcast`, { messages }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
        return { externalId: `broadcast-${Date.now()}` };
    }
    async fetchInbox(tokens, meta) {
        return [];
    }
    async replyToInboxItem(tokens, target, text) {
        await axios_1.default.post(`${API}/message/push`, { to: target.externalId, messages: [{ type: 'text', text }] }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    }
    async fetchInsights(tokens, meta) {
        const response = await axios_1.default.get(`${API}/insight/followers`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return {
            followers: response.data.followers,
            reach: 0,
            impressions: 0,
            engagement: 0,
        };
    }
};
exports.LineConnector = LineConnector;
exports.LineConnector = LineConnector = __decorate([
    (0, common_1.Injectable)()
], LineConnector);
//# sourceMappingURL=line.connector.js.map