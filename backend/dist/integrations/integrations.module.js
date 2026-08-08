"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationsModule = void 0;
const common_1 = require("@nestjs/common");
const integrations_service_1 = require("./integrations.service");
const integrations_controller_1 = require("./integrations.controller");
const connector_registry_1 = require("./connector-registry");
const token_cipher_service_1 = require("./token-cipher.service");
const gmb_connector_1 = require("./connectors/gmb.connector");
const google_ads_connector_1 = require("./connectors/google-ads.connector");
const merchant_center_connector_1 = require("./connectors/merchant-center.connector");
const meta_ads_connector_1 = require("./connectors/meta-ads.connector");
const tiktok_ads_connector_1 = require("./connectors/tiktok-ads.connector");
const email_connector_1 = require("./connectors/email.connector");
const email_campaigns_module_1 = require("./email/email-campaigns.module");
let IntegrationsModule = class IntegrationsModule {
};
exports.IntegrationsModule = IntegrationsModule;
exports.IntegrationsModule = IntegrationsModule = __decorate([
    (0, common_1.Module)({
        imports: [email_campaigns_module_1.EmailCampaignsModule],
        controllers: [integrations_controller_1.IntegrationsController],
        providers: [
            integrations_service_1.IntegrationsService,
            connector_registry_1.ConnectorRegistry,
            token_cipher_service_1.TokenCipherService,
            gmb_connector_1.GmbConnector,
            google_ads_connector_1.GoogleAdsConnector,
            merchant_center_connector_1.MerchantCenterConnector,
            meta_ads_connector_1.MetaAdsConnector,
            tiktok_ads_connector_1.TikTokAdsConnector,
            email_connector_1.EmailConnector,
        ],
        exports: [integrations_service_1.IntegrationsService],
    })
], IntegrationsModule);
//# sourceMappingURL=integrations.module.js.map