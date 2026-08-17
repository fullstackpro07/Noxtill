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
exports.BingPlacesConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const prisma_1 = require("../../../generated/prisma");
const AUTHORIZE_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const SCOPE = 'https://api.bingplaces.com/business.manage offline_access';
let BingPlacesConnector = class BingPlacesConnector {
    config;
    provider = prisma_1.IntegrationProvider.bing_places;
    constructor(config) {
        this.config = config;
    }
    redirectUri() {
        const backendUrl = this.config.get('BACKEND_URL') ?? 'http://localhost:5000/api/v1';
        return `${backendUrl}/integrations/bing_places/callback`;
    }
    authUrl(state) {
        const params = new URLSearchParams({
            client_id: this.config.get('BING_PLACES_CLIENT_ID') ?? '',
            redirect_uri: this.redirectUri(),
            scope: SCOPE,
            state,
            response_type: 'code',
        });
        return `${AUTHORIZE_URL}?${params.toString()}`;
    }
    async handleCallback(code) {
        const response = await axios_1.default.post(TOKEN_URL, new URLSearchParams({
            client_id: this.config.get('BING_PLACES_CLIENT_ID') ?? '',
            client_secret: this.config.get('BING_PLACES_CLIENT_SECRET') ?? '',
            redirect_uri: this.redirectUri(),
            grant_type: 'authorization_code',
            code,
        }));
        return this.mapTokenResponse(response.data);
    }
    async refreshToken(tokens) {
        const response = await axios_1.default.post(TOKEN_URL, new URLSearchParams({
            client_id: this.config.get('BING_PLACES_CLIENT_ID') ?? '',
            client_secret: this.config.get('BING_PLACES_CLIENT_SECRET') ?? '',
            grant_type: 'refresh_token',
            refresh_token: tokens.refreshToken ?? '',
        }));
        return this.mapTokenResponse(response.data);
    }
    async sync(tokens) {
        const response = await axios_1.default.get('https://api.bingplaces.com/api/GetAllStores', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return response.data;
    }
    async pushListing(tokens, listing, meta) {
        const response = await axios_1.default.post('https://api.bingplaces.com/api/CreateOrUpdateStore', {
            StoreId: meta.storeId,
            StoreName: listing.name,
            BusinessPhone: listing.phone,
            Website: listing.website,
            AddressLine1: listing.addressLine1,
            AddressLine2: listing.addressLine2,
            City: listing.city,
            State: listing.state,
            ZipCode: listing.postalCode,
            Country: listing.country,
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
exports.BingPlacesConnector = BingPlacesConnector;
exports.BingPlacesConnector = BingPlacesConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], BingPlacesConnector);
//# sourceMappingURL=bing-places.connector.js.map