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
exports.LoyaltyService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const loyalty_constants_1 = require("./loyalty.constants");
const prisma_1 = require("../../generated/prisma");
let LoyaltyService = class LoyaltyService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    createProgram(dto) {
        return this.tenantPrisma.client.loyaltyProgram.create({
            data: {
                name: dto.name,
                type: dto.type ?? prisma_1.LoyaltyProgramType.punch_card,
                stampsRequired: dto.stampsRequired ?? 10,
                rewardDescription: dto.rewardDescription,
                tiers: (dto.tiers ?? []),
            },
        });
    }
    listPrograms() {
        return this.tenantPrisma.client.loyaltyProgram.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }
    async enroll(programId, dto) {
        await this.findProgram(programId);
        const customer = await this.tenantPrisma.client.customer.findUnique({
            where: { id: dto.customerId },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        return this.tenantPrisma.client.loyaltyMember.upsert({
            where: {
                programId_customerId: { programId, customerId: dto.customerId },
            },
            create: {
                businessId: customer.businessId,
                programId,
                customerId: dto.customerId,
            },
            update: {},
        });
    }
    async listMembers(programId) {
        const program = await this.findProgram(programId);
        const members = await this.tenantPrisma.client.loyaltyMember.findMany({
            where: { programId },
            orderBy: { createdAt: 'asc' },
            include: { customer: true },
        });
        if (program.type === prisma_1.LoyaltyProgramType.tier) {
            const tiers = [
                ...(program.tiers ?? []),
            ].sort((a, b) => b.minSpend - a.minSpend);
            return members.map((member) => ({
                ...member,
                currentTier: this.computeTier(Number(member.customer.lifetimeSpend), tiers),
            }));
        }
        return members;
    }
    async redeem(memberId) {
        const member = await this.tenantPrisma.client.loyaltyMember.findUnique({
            where: { id: memberId },
            include: { program: true },
        });
        if (!member) {
            throw new common_1.NotFoundException('Loyalty member not found');
        }
        if (member.program.type !== prisma_1.LoyaltyProgramType.punch_card) {
            throw new app_exception_1.AppException(loyalty_constants_1.LOYALTY_ERROR_CODES.NOT_A_PUNCH_CARD, 'Only punch-card programs can be redeemed this way', common_1.HttpStatus.BAD_REQUEST);
        }
        if (member.stampCount < member.program.stampsRequired) {
            throw new app_exception_1.AppException(loyalty_constants_1.LOYALTY_ERROR_CODES.NOT_ENOUGH_STAMPS, `Needs ${member.program.stampsRequired} stamps, has ${member.stampCount}`, common_1.HttpStatus.BAD_REQUEST);
        }
        return this.tenantPrisma.client.$transaction(async (tx) => {
            const unredeemed = await tx.stamp.findMany({
                where: { memberId, redeemed: false },
                orderBy: { createdAt: 'asc' },
                take: member.program.stampsRequired,
            });
            await tx.stamp.updateMany({
                where: { id: { in: unredeemed.map((s) => s.id) } },
                data: { redeemed: true },
            });
            return tx.loyaltyMember.update({
                where: { id: memberId },
                data: {
                    stampCount: { decrement: member.program.stampsRequired },
                    redeemedCount: { increment: 1 },
                },
            });
        });
    }
    async issueStampIfEligible(businessId, customerId, orderId, tx) {
        const program = await tx.loyaltyProgram.findFirst({
            where: {
                businessId,
                type: prisma_1.LoyaltyProgramType.punch_card,
                active: true,
            },
        });
        if (!program)
            return;
        const member = await tx.loyaltyMember.upsert({
            where: { programId_customerId: { programId: program.id, customerId } },
            create: { businessId, programId: program.id, customerId, stampCount: 1 },
            update: { stampCount: { increment: 1 } },
        });
        await tx.stamp.create({ data: { memberId: member.id, orderId } });
    }
    computeTier(lifetimeSpend, tiers) {
        return tiers.find((t) => lifetimeSpend >= t.minSpend)?.name ?? null;
    }
    async findProgram(id) {
        const program = await this.tenantPrisma.client.loyaltyProgram.findUnique({
            where: { id },
        });
        if (!program) {
            throw new app_exception_1.AppException(loyalty_constants_1.LOYALTY_ERROR_CODES.PROGRAM_NOT_FOUND, 'Loyalty program not found', common_1.HttpStatus.NOT_FOUND);
        }
        return program;
    }
};
exports.LoyaltyService = LoyaltyService;
exports.LoyaltyService = LoyaltyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], LoyaltyService);
//# sourceMappingURL=loyalty.service.js.map