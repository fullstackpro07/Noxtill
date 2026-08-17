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
exports.LinkedinConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const standard_oauth2_connector_1 = require("./standard-oauth2.connector");
const prisma_1 = require("../../../generated/prisma");
const API = 'https://api.linkedin.com/v2';
let LinkedinConnector = class LinkedinConnector extends standard_oauth2_connector_1.StandardOAuth2Connector {
    platform = prisma_1.SocialPlatform.linkedin;
    oauth = {
        authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
        scope: 'w_member_social r_organization_social',
        clientIdEnvKey: 'LINKEDIN_CLIENT_ID',
        clientSecretEnvKey: 'LINKEDIN_CLIENT_SECRET',
        redirectSegment: 'linkedin',
    };
    constructor(config) {
        super(config);
    }
    async fetchAccountInfo(tokens) {
        const response = await axios_1.default.get(`${API}/me`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return {
            externalAccountId: response.data.id,
            externalAccountName: response.data.localizedFirstName,
        };
    }
    async publish(tokens, post, meta) {
        const authorUrn = meta.authorUrn;
        const response = await axios_1.default.post(`${API}/ugcPosts`, {
            author: authorUrn,
            lifecycleState: 'PUBLISHED',
            specificContent: {
                'com.linkedin.ugc.ShareContent': {
                    shareCommentary: { text: post.caption },
                    shareMediaCategory: post.mediaUrls.length ? 'IMAGE' : 'NONE',
                },
            },
            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
        return { externalId: response.data.id };
    }
    async fetchInbox(tokens, meta) {
        const shareUrn = meta.shareUrn;
        if (!shareUrn)
            return [];
        const response = await axios_1.default.get(`${API}/socialActions/${encodeURIComponent(shareUrn)}/comments`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return response.data.elements.map((c) => ({
            externalId: c.$URN,
            kind: 'comment',
            authorName: c.actor,
            text: c.message.text,
            postExternalId: shareUrn,
            receivedAt: new Date(c.created.time).toISOString(),
        }));
    }
    async replyToInboxItem(tokens, target, text) {
        await axios_1.default.post(`${API}/socialActions/${encodeURIComponent(target.externalId)}/comments`, { message: { text } }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    }
    async fetchInsights(tokens, meta) {
        const organizationUrn = meta.organizationUrn;
        const response = await axios_1.default.get(`${API}/organizationalEntityShareStatistics`, {
            params: {
                q: 'organizationalEntity',
                organizationalEntity: organizationUrn,
            },
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        const stats = response.data.elements[0]?.totalShareStatistics;
        return {
            followers: 0,
            reach: stats?.shareCount ?? 0,
            impressions: stats?.impressionCount ?? 0,
            engagement: stats?.engagement ?? 0,
        };
    }
};
exports.LinkedinConnector = LinkedinConnector;
exports.LinkedinConnector = LinkedinConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], LinkedinConnector);
//# sourceMappingURL=linkedin.connector.js.map