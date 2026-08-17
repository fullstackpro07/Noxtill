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
exports.WechatConnector = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const token_based_connector_1 = require("./token-based.connector");
const prisma_1 = require("../../../generated/prisma");
const API = 'https://api.weixin.qq.com/cgi-bin';
let WechatConnector = class WechatConnector extends token_based_connector_1.TokenBasedConnector {
    platform = prisma_1.SocialPlatform.wechat;
    async verifyToken(token) {
        const [appId, appSecret] = token.split(':');
        const response = await axios_1.default.get(`${API}/token`, {
            params: {
                grant_type: 'client_credential',
                appid: appId,
                secret: appSecret,
            },
        });
        if (response.data.errcode) {
            throw new Error(`WeChat credential verification failed (errcode ${response.data.errcode})`);
        }
        return { externalAccountId: appId };
    }
    async accessToken(tokens) {
        const [appId, appSecret] = tokens.accessToken.split(':');
        const response = await axios_1.default.get(`${API}/token`, {
            params: {
                grant_type: 'client_credential',
                appid: appId,
                secret: appSecret,
            },
        });
        return response.data.access_token;
    }
    async publish(tokens, post, meta) {
        const accessToken = await this.accessToken(tokens);
        const response = await axios_1.default.post(`${API}/message/mass/send`, {
            filter: { is_to_all: meta.isToAll ?? true },
            text: { content: post.caption },
            msgtype: 'text',
        }, { params: { access_token: accessToken } });
        return { externalId: String(response.data.msg_id) };
    }
    async fetchInbox(tokens, meta) {
        return [];
    }
    async replyToInboxItem(tokens, target, text) {
        const accessToken = await this.accessToken(tokens);
        await axios_1.default.post(`${API}/message/custom/send`, { touser: target.externalId, text: { content: text }, msgtype: 'text' }, { params: { access_token: accessToken } });
    }
    async fetchInsights(tokens, meta) {
        const accessToken = await this.accessToken(tokens);
        const date = meta.date;
        const response = await axios_1.default.post('https://api.weixin.qq.com/datacube/getusersummary', { begin_date: date, end_date: date }, { params: { access_token: accessToken } });
        const totals = response.data.list.reduce((sum, row) => sum + row.new_user - row.cancel_user, 0);
        return { followers: totals, reach: 0, impressions: 0, engagement: 0 };
    }
};
exports.WechatConnector = WechatConnector;
exports.WechatConnector = WechatConnector = __decorate([
    (0, common_1.Injectable)()
], WechatConnector);
//# sourceMappingURL=wechat.connector.js.map