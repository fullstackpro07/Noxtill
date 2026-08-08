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
exports.TikTokAdsConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const prisma_1 = require("../../../generated/prisma");
const AUTHORIZE_URL = 'https://business-api.tiktok.com/portal/auth';
const TOKEN_URL = 'https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/';
let TikTokAdsConnector = class TikTokAdsConnector {
    config;
    provider = prisma_1.IntegrationProvider.tiktok_ads;
    constructor(config) {
        this.config = config;
    }
    redirectUri() {
        const backendUrl = this.config.get('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
        return `${backendUrl}/integrations/tiktok_ads/callback`;
    }
    authUrl(state) {
        const params = new URLSearchParams({
            app_id: this.config.get('TIKTOK_ADS_APP_ID') ?? '',
            redirect_uri: this.redirectUri(),
            state,
        });
        return `${AUTHORIZE_URL}?${params.toString()}`;
    }
    async handleCallback(code) {
        const response = await axios_1.default.post(TOKEN_URL, {
            app_id: this.config.get('TIKTOK_ADS_APP_ID') ?? '',
            secret: this.config.get('TIKTOK_ADS_APP_SECRET') ?? '',
            auth_code: code,
            grant_type: 'authorization_code',
        });
        return { accessToken: response.data.data.access_token };
    }
    async refreshToken(tokens) {
        return tokens;
    }
    async sync(tokens) {
        const response = await axios_1.default.get('https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/', {
            headers: { 'Access-Token': tokens.accessToken },
            params: {
                app_id: this.config.get('TIKTOK_ADS_APP_ID') ?? '',
                secret: this.config.get('TIKTOK_ADS_APP_SECRET') ?? '',
            },
        });
        return response.data;
    }
    async disconnect() {
    }
};
exports.TikTokAdsConnector = TikTokAdsConnector;
exports.TikTokAdsConnector = TikTokAdsConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TikTokAdsConnector);
//# sourceMappingURL=tiktok-ads.connector.js.map