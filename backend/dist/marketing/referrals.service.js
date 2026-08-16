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
exports.ReferralsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
let ReferralsService = class ReferralsService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async issueRewardIfEligible(businessId, customerId, tx) {
        const customer = await tx.customer.findUnique({
            where: { id: customerId },
        });
        if (!customer ||
            !customer.referredByCustomerId ||
            customer.referralRewardedAt ||
            customer.visitCount !== 1) {
            return;
        }
        const business = await tx.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        const settings = business.referralSettings;
        if (settings?.enabled &&
            settings.rewardType === 'credit' &&
            settings.rewardValue) {
            await tx.creditEntry.create({
                data: {
                    businessId,
                    customerId: customer.referredByCustomerId,
                    kind: 'credit',
                    amount: settings.rewardValue,
                    note: 'Referral reward',
                },
            });
        }
        await tx.customer.update({
            where: { id: customerId },
            data: { referralRewardedAt: new Date() },
        });
    }
    async updateSettings(businessId, dto) {
        await this.tenantPrisma.client.business.update({
            where: { id: businessId },
            data: { referralSettings: dto },
        });
        return dto;
    }
    async getSettings(businessId) {
        const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        return business.referralSettings;
    }
    async redeem(businessId, dto) {
        const referrer = await this.tenantPrisma.client.customer.findUnique({
            where: { id: dto.code },
        });
        if (!referrer) {
            throw new app_exception_1.AppException('REFERRAL_CODE_NOT_FOUND', 'This referral code does not match any customer', common_1.HttpStatus.NOT_FOUND);
        }
        return this.tenantPrisma.client.customer.upsert({
            where: { businessId_phone: { businessId, phone: dto.refereePhone } },
            create: {
                businessId,
                phone: dto.refereePhone,
                name: dto.refereeName,
                referredByCustomerId: referrer.id,
            },
            update: { referredByCustomerId: referrer.id },
        });
    }
    async stats() {
        const referred = await this.tenantPrisma.client.customer.findMany({
            where: { referredByCustomerId: { not: null } },
            select: {
                referredByCustomerId: true,
                visitCount: true,
                referralRewardedAt: true,
            },
        });
        const converted = referred.filter((r) => r.visitCount >= 1).length;
        const rewardsIssued = referred.filter((r) => r.referralRewardedAt != null).length;
        const countsByReferrer = new Map();
        for (const row of referred) {
            const key = row.referredByCustomerId;
            countsByReferrer.set(key, (countsByReferrer.get(key) ?? 0) + 1);
        }
        const referrers = await this.tenantPrisma.client.customer.findMany({
            where: { id: { in: [...countsByReferrer.keys()] } },
            select: { id: true, name: true },
        });
        const nameById = new Map(referrers.map((r) => [r.id, r.name]));
        const leaderboard = [...countsByReferrer.entries()]
            .map(([customerId, count]) => ({
            customerId,
            name: nameById.get(customerId) ?? 'Unknown',
            count,
        }))
            .sort((a, b) => b.count - a.count);
        return {
            totalReferred: referred.length,
            converted,
            rewardsIssued,
            leaderboard,
        };
    }
};
exports.ReferralsService = ReferralsService;
exports.ReferralsService = ReferralsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], ReferralsService);
//# sourceMappingURL=referrals.service.js.map