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
exports.SocialAnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const social_accounts_service_1 = require("./social-accounts.service");
const social_connector_registry_1 = require("./connectors/social-connector-registry");
let SocialAnalyticsService = class SocialAnalyticsService {
    tenantPrisma;
    accounts;
    connectors;
    constructor(tenantPrisma, accounts, connectors) {
        this.tenantPrisma = tenantPrisma;
        this.accounts = accounts;
        this.connectors = connectors;
    }
    list(businessId, platform) {
        return this.tenantPrisma.client.socialAnalyticsSnapshot.findMany({
            where: { businessId, ...(platform ? { platform } : {}) },
            orderBy: { date: 'desc' },
            take: 90,
        });
    }
    async summary(businessId) {
        const latestPerPlatform = await this.tenantPrisma.client.socialAnalyticsSnapshot.findMany({
            where: { businessId },
            orderBy: { date: 'desc' },
            distinct: ['platform'],
        });
        return {
            totalFollowers: latestPerPlatform.reduce((sum, row) => sum + row.followers, 0),
            totalReach: latestPerPlatform.reduce((sum, row) => sum + row.reach, 0),
            totalEngagement: latestPerPlatform.reduce((sum, row) => sum + row.engagement, 0),
            byPlatform: latestPerPlatform,
        };
    }
    async pullForAccount(businessId, platform) {
        const tokens = await this.accounts.getTokens(businessId, platform);
        if (!tokens)
            throw new Error(`${platform} is not connected for business ${businessId}`);
        const account = await this.accounts.getAccount(businessId, platform);
        const connector = this.connectors.get(platform);
        const insights = await connector.fetchInsights(tokens, account?.meta ?? {});
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        return this.tenantPrisma.client.socialAnalyticsSnapshot.upsert({
            where: {
                businessId_platform_date: { businessId, platform, date: today },
            },
            create: { businessId, platform, date: today, ...insights },
            update: insights,
        });
    }
};
exports.SocialAnalyticsService = SocialAnalyticsService;
exports.SocialAnalyticsService = SocialAnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        social_accounts_service_1.SocialAccountsService,
        social_connector_registry_1.SocialConnectorRegistry])
], SocialAnalyticsService);
//# sourceMappingURL=social-analytics.service.js.map