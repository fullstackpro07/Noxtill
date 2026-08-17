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
exports.FacebookConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const standard_oauth2_connector_1 = require("./standard-oauth2.connector");
const prisma_1 = require("../../../generated/prisma");
const GRAPH = 'https://graph.facebook.com/v19.0';
let FacebookConnector = class FacebookConnector extends standard_oauth2_connector_1.StandardOAuth2Connector {
    platform = prisma_1.SocialPlatform.facebook;
    oauth = {
        authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
        tokenUrl: `${GRAPH}/oauth/access_token`,
        scope: 'pages_manage_posts,pages_read_engagement,pages_show_list',
        clientIdEnvKey: 'FACEBOOK_APP_ID',
        clientSecretEnvKey: 'FACEBOOK_APP_SECRET',
        redirectSegment: 'facebook',
    };
    constructor(config) {
        super(config);
    }
    async fetchAccountInfo(tokens) {
        const response = await axios_1.default.get(`${GRAPH}/me`, {
            params: { access_token: tokens.accessToken, fields: 'id,name' },
        });
        return {
            externalAccountId: response.data.id,
            externalAccountName: response.data.name,
        };
    }
    async publish(tokens, post, meta) {
        const pageId = meta.pageId ?? 'me';
        const response = await axios_1.default.post(`${GRAPH}/${pageId}/feed`, { message: post.caption, link: post.mediaUrls[0] }, { params: { access_token: tokens.accessToken } });
        return { externalId: response.data.id };
    }
    async fetchInbox(tokens, meta) {
        const pageId = meta.pageId ?? 'me';
        const response = await axios_1.default.get(`${GRAPH}/${pageId}/comments`, {
            params: { access_token: tokens.accessToken },
        });
        return response.data.data.map((c) => ({
            externalId: c.id,
            kind: 'comment',
            authorName: c.from?.name,
            text: c.message ?? '',
            receivedAt: c.created_time,
        }));
    }
    async replyToInboxItem(tokens, target, text) {
        await axios_1.default.post(`${GRAPH}/${target.externalId}/comments`, { message: text }, { params: { access_token: tokens.accessToken } });
    }
    async fetchInsights(tokens, meta) {
        const pageId = meta.pageId ?? 'me';
        const response = await axios_1.default.get(`${GRAPH}/${pageId}/insights`, {
            params: {
                access_token: tokens.accessToken,
                metric: 'page_fans,page_impressions,page_engaged_users,page_post_engagements',
            },
        });
        const byName = (name) => response.data.data.find((m) => m.name === name)?.values?.[0]?.value ?? 0;
        return {
            followers: byName('page_fans'),
            impressions: byName('page_impressions'),
            engagement: byName('page_engaged_users'),
            reach: byName('page_post_engagements'),
        };
    }
};
exports.FacebookConnector = FacebookConnector;
exports.FacebookConnector = FacebookConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], FacebookConnector);
//# sourceMappingURL=facebook.connector.js.map