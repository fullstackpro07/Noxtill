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
exports.YelpConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const prisma_1 = require("../../../generated/prisma");
const AUTHORIZE_URL = 'https://www.yelp.com/oauth2/authorize';
const TOKEN_URL = 'https://api.yelp.com/oauth2/token';
const SCOPE = 'business_management';
let YelpConnector = class YelpConnector {
    config;
    provider = prisma_1.IntegrationProvider.yelp;
    constructor(config) {
        this.config = config;
    }
    redirectUri() {
        const backendUrl = this.config.get('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
        return `${backendUrl}/integrations/yelp/callback`;
    }
    authUrl(state) {
        const params = new URLSearchParams({
            client_id: this.config.get('YELP_CLIENT_ID') ?? '',
            redirect_uri: this.redirectUri(),
            scope: SCOPE,
            state,
            response_type: 'code',
        });
        return `${AUTHORIZE_URL}?${params.toString()}`;
    }
    async handleCallback(code) {
        const response = await axios_1.default.post(TOKEN_URL, {
            client_id: this.config.get('YELP_CLIENT_ID') ?? '',
            client_secret: this.config.get('YELP_CLIENT_SECRET') ?? '',
            redirect_uri: this.redirectUri(),
            grant_type: 'authorization_code',
            code,
        });
        return this.mapTokenResponse(response.data);
    }
    async refreshToken(tokens) {
        const response = await axios_1.default.post(TOKEN_URL, {
            client_id: this.config.get('YELP_CLIENT_ID') ?? '',
            client_secret: this.config.get('YELP_CLIENT_SECRET') ?? '',
            grant_type: 'refresh_token',
            refresh_token: tokens.refreshToken ?? '',
        });
        return this.mapTokenResponse(response.data);
    }
    async sync(tokens) {
        const response = await axios_1.default.get('https://api.yelp.com/v3/businesses/managed', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return response.data;
    }
    async pushListing(tokens, listing, meta) {
        const response = await axios_1.default.post('https://api.yelp.com/v3/businesses/managed/update', {
            business_id: meta.yelpBusinessId,
            name: listing.name,
            phone: listing.phone,
            website: listing.website,
            location: {
                address1: listing.addressLine1,
                address2: listing.addressLine2,
                city: listing.city,
                state: listing.state,
                zip_code: listing.postalCode,
                country: listing.country,
            },
        }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
        return response.data;
    }
    async disconnect() {
    }
    mapTokenResponse(data) {
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: data.expires_in
                ? new Date(Date.now() + data.expires_in * 1000).toISOString()
                : undefined,
        };
    }
};
exports.YelpConnector = YelpConnector;
exports.YelpConnector = YelpConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], YelpConnector);
//# sourceMappingURL=yelp.connector.js.map