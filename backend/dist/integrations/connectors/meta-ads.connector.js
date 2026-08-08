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
exports.MetaAdsConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const prisma_1 = require("../../../generated/prisma");
const AUTHORIZE_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
const TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';
const SCOPE = 'ads_management,business_management';
let MetaAdsConnector = class MetaAdsConnector {
    config;
    provider = prisma_1.IntegrationProvider.meta_ads;
    constructor(config) {
        this.config = config;
    }
    redirectUri() {
        const backendUrl = this.config.get('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
        return `${backendUrl}/integrations/meta_ads/callback`;
    }
    authUrl(state) {
        const params = new URLSearchParams({
            client_id: this.config.get('META_ADS_APP_ID') ?? '',
            redirect_uri: this.redirectUri(),
            scope: SCOPE,
            state,
            response_type: 'code',
        });
        return `${AUTHORIZE_URL}?${params.toString()}`;
    }
    async handleCallback(code) {
        const response = await axios_1.default.get(TOKEN_URL, {
            params: {
                client_id: this.config.get('META_ADS_APP_ID') ?? '',
                client_secret: this.config.get('META_ADS_APP_SECRET') ?? '',
                redirect_uri: this.redirectUri(),
                code,
            },
        });
        return this.mapTokenResponse(response.data);
    }
    async refreshToken(tokens) {
        const response = await axios_1.default.get(TOKEN_URL, {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: this.config.get('META_ADS_APP_ID') ?? '',
                client_secret: this.config.get('META_ADS_APP_SECRET') ?? '',
                fb_exchange_token: tokens.accessToken,
            },
        });
        return this.mapTokenResponse(response.data);
    }
    async sync(tokens) {
        const response = await axios_1.default.get('https://graph.facebook.com/v19.0/me/adaccounts', {
            params: { access_token: tokens.accessToken },
        });
        return response.data;
    }
    async disconnect() {
    }
    mapTokenResponse(data) {
        return {
            accessToken: data.access_token,
            expiresAt: data.expires_in
                ? new Date(Date.now() + data.expires_in * 1000).toISOString()
                : undefined,
        };
    }
};
exports.MetaAdsConnector = MetaAdsConnector;
exports.MetaAdsConnector = MetaAdsConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MetaAdsConnector);
//# sourceMappingURL=meta-ads.connector.js.map