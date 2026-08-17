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
exports.MarketingOverviewService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const prisma_1 = require("../../generated/prisma");
const AD_PROVIDERS = [
    prisma_1.IntegrationProvider.google_ads,
    prisma_1.IntegrationProvider.meta_ads,
    prisma_1.IntegrationProvider.tiktok_ads,
];
let MarketingOverviewService = class MarketingOverviewService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async overview() {
        const [whatsapp, email, adCampaigns] = await Promise.all([
            this.tenantPrisma.client.campaign.aggregate({
                _sum: { sentCount: true },
            }),
            this.tenantPrisma.client.emailCampaign.aggregate({
                _sum: { sentCount: true },
            }),
            this.tenantPrisma.client.adCampaign.findMany({
                where: { provider: { in: AD_PROVIDERS } },
            }),
        ]);
        const rows = [
            this.toRow('WhatsApp', 0, whatsapp._sum.sentCount ?? 0),
            this.toRow('Email', 0, email._sum.sentCount ?? 0),
        ];
        for (const provider of AD_PROVIDERS) {
            const campaigns = adCampaigns.filter((c) => c.provider === provider);
            const spend = campaigns.reduce((sum, c) => sum + Number(c.budget), 0);
            const results = campaigns.reduce((sum, c) => {
                const stats = c.stats;
                return sum + (stats?.results ?? 0);
            }, 0);
            rows.push(this.toRow(this.label(provider), spend, results));
        }
        return rows;
    }
    toRow(channel, spend, results) {
        return {
            channel,
            spend,
            results,
            costPerResult: results > 0 ? Math.round((spend / results) * 100) / 100 : null,
        };
    }
    label(provider) {
        switch (provider) {
            case prisma_1.IntegrationProvider.google_ads:
                return 'Google Ads';
            case prisma_1.IntegrationProvider.meta_ads:
                return 'Meta Ads';
            case prisma_1.IntegrationProvider.tiktok_ads:
                return 'TikTok Ads';
            default:
                return provider;
        }
    }
};
exports.MarketingOverviewService = MarketingOverviewService;
exports.MarketingOverviewService = MarketingOverviewService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], MarketingOverviewService);
//# sourceMappingURL=overview.service.js.map