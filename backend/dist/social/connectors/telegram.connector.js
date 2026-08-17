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
exports.TelegramConnector = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const token_based_connector_1 = require("./token-based.connector");
const prisma_1 = require("../../../generated/prisma");
let TelegramConnector = class TelegramConnector extends token_based_connector_1.TokenBasedConnector {
    platform = prisma_1.SocialPlatform.telegram;
    async verifyToken(token) {
        const response = await axios_1.default.get(`https://api.telegram.org/bot${token}/getMe`);
        return {
            externalAccountId: String(response.data.result.id),
            externalAccountName: response.data.result.username,
        };
    }
    async publish(tokens, post, meta) {
        const chatId = meta.chatId;
        const method = post.mediaUrls.length ? 'sendPhoto' : 'sendMessage';
        const body = post.mediaUrls.length
            ? { chat_id: chatId, photo: post.mediaUrls[0], caption: post.caption }
            : { chat_id: chatId, text: post.caption };
        const response = await axios_1.default.post(`https://api.telegram.org/bot${tokens.accessToken}/${method}`, body);
        return { externalId: String(response.data.result.message_id) };
    }
    async fetchInbox(tokens, meta) {
        const offset = meta.updateOffset;
        const response = await axios_1.default.get(`https://api.telegram.org/bot${tokens.accessToken}/getUpdates`, {
            params: { offset, timeout: 0 },
        });
        return response.data.result
            .filter((u) => u.message?.text)
            .map((u) => ({
            externalId: `${u.message.chat.id}:${u.message.message_id}`,
            kind: 'dm',
            authorName: u.message.from?.username,
            text: u.message.text ?? '',
            receivedAt: new Date(u.message.date * 1000).toISOString(),
        }));
    }
    async replyToInboxItem(tokens, target, text) {
        const [chatId, messageId] = target.externalId.split(':');
        await axios_1.default.post(`https://api.telegram.org/bot${tokens.accessToken}/sendMessage`, {
            chat_id: chatId,
            text,
            reply_to_message_id: Number(messageId),
        });
    }
    async fetchInsights(tokens, meta) {
        const chatId = meta.chatId;
        const response = await axios_1.default.get(`https://api.telegram.org/bot${tokens.accessToken}/getChatMemberCount`, { params: { chat_id: chatId } });
        return {
            followers: response.data.result,
            reach: 0,
            impressions: 0,
            engagement: 0,
        };
    }
};
exports.TelegramConnector = TelegramConnector;
exports.TelegramConnector = TelegramConnector = __decorate([
    (0, common_1.Injectable)()
], TelegramConnector);
//# sourceMappingURL=telegram.connector.js.map