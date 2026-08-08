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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectorRegistry = void 0;
const common_1 = require("@nestjs/common");
const gmb_connector_1 = require("./connectors/gmb.connector");
const google_ads_connector_1 = require("./connectors/google-ads.connector");
const merchant_center_connector_1 = require("./connectors/merchant-center.connector");
const meta_ads_connector_1 = require("./connectors/meta-ads.connector");
const tiktok_ads_connector_1 = require("./connectors/tiktok-ads.connector");
const email_connector_1 = require("./connectors/email.connector");
const prisma_1 = require("../../generated/prisma");
let ConnectorRegistry = class ConnectorRegistry {
    byProvider;
    constructor(gmb, googleAds, merchant, metaAds, tiktokAds, email) {
        this.byProvider = {
            [prisma_1.IntegrationProvider.gmb]: gmb,
            [prisma_1.IntegrationProvider.google_ads]: googleAds,
            [prisma_1.IntegrationProvider.merchant]: merchant,
            [prisma_1.IntegrationProvider.meta_ads]: metaAds,
            [prisma_1.IntegrationProvider.tiktok_ads]: tiktokAds,
            [prisma_1.IntegrationProvider.email]: email,
        };
    }
    get(provider) {
        return this.byProvider[provider];
    }
    all() {
        return Object.values(prisma_1.IntegrationProvider);
    }
};
exports.ConnectorRegistry = ConnectorRegistry;
exports.ConnectorRegistry = ConnectorRegistry = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [gmb_connector_1.GmbConnector,
        google_ads_connector_1.GoogleAdsConnector,
        merchant_center_connector_1.MerchantCenterConnector,
        meta_ads_connector_1.MetaAdsConnector,
        tiktok_ads_connector_1.TikTokAdsConnector,
        email_connector_1.EmailConnector])
], ConnectorRegistry);
//# sourceMappingURL=connector-registry.js.map