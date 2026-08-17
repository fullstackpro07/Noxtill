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
exports.AppleBusinessConnectConnector = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const prisma_1 = require("../../../generated/prisma");
let AppleBusinessConnectConnector = class AppleBusinessConnectConnector {
    config;
    provider = prisma_1.IntegrationProvider.apple_business_connect;
    constructor(config) {
        this.config = config;
    }
    authUrl() {
        return null;
    }
    async handleCallback() {
        return { accessToken: this.apiKey() };
    }
    async refreshToken(tokens) {
        return tokens;
    }
    async sync(tokens) {
        const response = await axios_1.default.get('https://businessconnect.apple.com/api/v1/locations', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
        });
        return response.data;
    }
    async pushListing(tokens, listing, meta) {
        const locationId = meta.locationId ?? 'primary';
        const response = await axios_1.default.patch(`https://businessconnect.apple.com/api/v1/locations/${locationId}`, {
            name: listing.name,
            phoneNumber: listing.phone,
            urls: listing.website ? [listing.website] : undefined,
            address: {
                line1: listing.addressLine1,
                line2: listing.addressLine2,
                locality: listing.city,
                administrativeArea: listing.state,
                postCode: listing.postalCode,
                country: listing.country,
            },
        }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
        return response.data;
    }
    async disconnect() {
    }
    apiKey() {
        return this.config.get('APPLE_BUSINESS_CONNECT_API_KEY') ?? '';
    }
};
exports.AppleBusinessConnectConnector = AppleBusinessConnectConnector;
exports.AppleBusinessConnectConnector = AppleBusinessConnectConnector = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AppleBusinessConnectConnector);
//# sourceMappingURL=apple-business-connect.connector.js.map