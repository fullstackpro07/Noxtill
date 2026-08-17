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
var SocialAnalyticsProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialAnalyticsProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const social_analytics_service_1 = require("../social-analytics.service");
const social_constants_1 = require("../social.constants");
const prisma_1 = require("../../../generated/prisma");
let SocialAnalyticsProcessor = SocialAnalyticsProcessor_1 = class SocialAnalyticsProcessor extends bullmq_1.WorkerHost {
    prisma;
    analytics;
    logger = new common_1.Logger(SocialAnalyticsProcessor_1.name);
    constructor(prisma, analytics) {
        super();
        this.prisma = prisma;
        this.analytics = analytics;
    }
    async process() {
        const connectedAccounts = await this.prisma.socialAccount.findMany({
            where: { status: prisma_1.SocialAccountStatus.connected },
            select: { businessId: true, platform: true },
        });
        for (const { businessId, platform } of connectedAccounts) {
            await this.analytics
                .pullForAccount(businessId, platform)
                .catch((error) => this.logger.warn(`Social analytics pull failed for business ${businessId}/${platform}: ${error.message}`));
        }
    }
};
exports.SocialAnalyticsProcessor = SocialAnalyticsProcessor;
exports.SocialAnalyticsProcessor = SocialAnalyticsProcessor = SocialAnalyticsProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(social_constants_1.SOCIAL_ANALYTICS_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        social_analytics_service_1.SocialAnalyticsService])
], SocialAnalyticsProcessor);
//# sourceMappingURL=social-analytics.processor.js.map