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
exports.SnapchatConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const standard_oauth2_connector_1 = require("./standard-oauth2.connector");
const prisma_1 = require("../../../generated/prisma");
const ADS_API = 'https://adsapi.snapchat.com/v1';
let SnapchatConnector = class SnapchatConnector extends standard_oauth2_connector_1.StandardOAuth2Connector {
    platform = prisma_1.SocialPlatform.snapchat;
    oauth = {
        authorizeUrl: 'https://accounts.snapchat.com/login/oauth2/authorize',
        tokenUrl: 'https://accounts.snapchat.com/login/oauth2/access_token',
        scope: 'snapchat-marketing-api',
        clientIdEnvKey: 'SNAPCHAT_CLIENT_ID',
        clientSecretEnvKey: 'SNAPCHAT_CLIENT_SECRET',
        redirectSegment: 'snapchat',
    };
    constructor(config) {
        super(config);
    }
    async fetchAccountInfo(tokens) {
        const response = await axios_1.default.get(`${ADS_API}/me`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return {
            externalAccountId: response.data.me.id,
            externalAccountName: response.data.me.display_name,
        };
    }
    async publish(tokens, post, meta) {
        const orgId = meta.organizationId;
        const response = await axios_1.default.post(`${ADS_API}/organizations/${orgId}/creatives`, {
            creatives: [
                { name: post.caption, top_snap_media_id: post.mediaUrls[0] },
            ],
        }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
        return { externalId: response.data.creatives[0].creative.id };
    }
    async fetchInbox(tokens, meta) {
        return [];
    }
    async replyToInboxItem(tokens, target, text) {
        throw new Error('Snapchat has no public API for replying to comments/DMs');
    }
    async fetchInsights(tokens, meta) {
        throw new Error('Snapchat has no public API for organic account insights');
    }
};
exports.SnapchatConnector = SnapchatConnector;
exports.SnapchatConnector = SnapchatConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SnapchatConnector);
//# sourceMappingURL=snapchat.connector.js.map