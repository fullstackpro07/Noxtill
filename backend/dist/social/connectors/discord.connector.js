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
exports.DiscordConnector = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const token_based_connector_1 = require("./token-based.connector");
const prisma_1 = require("../../../generated/prisma");
const API = 'https://discord.com/api/v10';
let DiscordConnector = class DiscordConnector extends token_based_connector_1.TokenBasedConnector {
    platform = prisma_1.SocialPlatform.discord;
    async verifyToken(token) {
        const response = await axios_1.default.get(`${API}/users/@me`, {
            headers: { Authorization: `Bot ${token}` },
        });
        return {
            externalAccountId: response.data.id,
            externalAccountName: response.data.username,
        };
    }
    async publish(tokens, post, meta) {
        const channelId = meta.channelId;
        const response = await axios_1.default.post(`${API}/channels/${channelId}/messages`, {
            content: post.mediaUrls.length
                ? `${post.caption}\n${post.mediaUrls[0]}`
                : post.caption,
        }, { headers: { Authorization: `Bot ${tokens.accessToken}` } });
        return { externalId: response.data.id };
    }
    async fetchInbox(tokens, meta) {
        const channelId = meta.channelId;
        if (!channelId)
            return [];
        const response = await axios_1.default.get(`${API}/channels/${channelId}/messages`, {
            params: { limit: 20 },
            headers: { Authorization: `Bot ${tokens.accessToken}` },
        });
        return response.data.map((m) => ({
            externalId: m.id,
            kind: 'comment',
            authorName: m.author.username,
            text: m.content,
            postExternalId: channelId,
            receivedAt: m.timestamp,
        }));
    }
    async replyToInboxItem(tokens, target, text) {
        const channelId = target.postExternalId;
        await axios_1.default.post(`${API}/channels/${channelId}/messages`, { content: text, message_reference: { message_id: target.externalId } }, { headers: { Authorization: `Bot ${tokens.accessToken}` } });
    }
    async fetchInsights(tokens, meta) {
        const guildId = meta.guildId;
        const response = await axios_1.default.get(`${API}/guilds/${guildId}`, {
            params: { with_counts: true },
            headers: { Authorization: `Bot ${tokens.accessToken}` },
        });
        return {
            followers: response.data.approximate_member_count,
            reach: 0,
            impressions: 0,
            engagement: 0,
        };
    }
};
exports.DiscordConnector = DiscordConnector;
exports.DiscordConnector = DiscordConnector = __decorate([
    (0, common_1.Injectable)()
], DiscordConnector);
//# sourceMappingURL=discord.connector.js.map