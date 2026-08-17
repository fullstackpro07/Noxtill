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
exports.MembershipsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const billing_service_1 = require("../billing/billing.service");
const memberships_constants_1 = require("./memberships.constants");
const prisma_1 = require("../../generated/prisma");
let MembershipsService = class MembershipsService {
    tenantPrisma;
    billing;
    constructor(tenantPrisma, billing) {
        this.tenantPrisma = tenantPrisma;
        this.billing = billing;
    }
    createPlan(dto) {
        return this.tenantPrisma.client.membershipPlan.create({
            data: {
                name: dto.name,
                price: dto.price,
                interval: dto.interval,
                benefits: dto.benefits,
                stripePriceId: dto.stripePriceId,
            },
        });
    }
    listPlans() {
        return this.tenantPrisma.client.membershipPlan.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }
    async create(businessId, dto) {
        const plan = await this.findPlan(dto.planId);
        const customer = await this.tenantPrisma.client.customer.findUnique({
            where: { id: dto.customerId },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        if (dto.method === 'cash') {
            const membership = await this.tenantPrisma.client.membership.create({
                data: {
                    businessId,
                    planId: dto.planId,
                    customerId: dto.customerId,
                    status: prisma_1.MembershipStatus.active,
                    method: 'cash',
                },
            });
            return { membership, checkoutUrl: null };
        }
        if (!plan.stripePriceId) {
            throw new app_exception_1.AppException(memberships_constants_1.MEMBERSHIP_ERROR_CODES.ONLINE_NOT_CONFIGURED, `Plan "${plan.name}" has no Stripe price configured for online billing yet — use "cash" for now`, common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        if (!dto.successUrl || !dto.cancelUrl) {
            throw new app_exception_1.AppException(memberships_constants_1.MEMBERSHIP_ERROR_CODES.ONLINE_NOT_CONFIGURED, 'successUrl and cancelUrl are required for an online membership', common_1.HttpStatus.BAD_REQUEST);
        }
        const membership = await this.tenantPrisma.client.membership.create({
            data: {
                businessId,
                planId: dto.planId,
                customerId: dto.customerId,
                status: prisma_1.MembershipStatus.pending,
                method: 'online',
            },
        });
        const session = await this.billing.createSubscriptionCheckout({
            referenceId: membership.id,
            referenceKey: 'membershipId',
            customerEmail: customer.email ?? undefined,
            priceRef: plan.stripePriceId,
            successUrl: dto.successUrl,
            cancelUrl: dto.cancelUrl,
        });
        return { membership, checkoutUrl: session.url };
    }
    listMemberships(customerId) {
        return this.tenantPrisma.client.membership.findMany({
            where: { customerId },
            orderBy: { createdAt: 'desc' },
            include: { plan: true, customer: true },
        });
    }
    async activate(id) {
        const membership = await this.findMembership(id);
        if (membership.status !== prisma_1.MembershipStatus.pending) {
            throw new app_exception_1.AppException(memberships_constants_1.MEMBERSHIP_ERROR_CODES.ALREADY_TERMINAL, `Membership is "${membership.status}", expected "pending"`, common_1.HttpStatus.CONFLICT);
        }
        return this.tenantPrisma.client.membership.update({
            where: { id },
            data: { status: prisma_1.MembershipStatus.active },
        });
    }
    async cancel(id) {
        const membership = await this.findMembership(id);
        if (membership.status === prisma_1.MembershipStatus.cancelled ||
            membership.status === prisma_1.MembershipStatus.expired) {
            throw new app_exception_1.AppException(memberships_constants_1.MEMBERSHIP_ERROR_CODES.ALREADY_TERMINAL, `Membership is already "${membership.status}"`, common_1.HttpStatus.CONFLICT);
        }
        if (membership.stripeSubscriptionId) {
            await this.billing.cancelSubscription(membership.stripeSubscriptionId);
        }
        return this.tenantPrisma.client.membership.update({
            where: { id },
            data: { status: prisma_1.MembershipStatus.cancelled },
        });
    }
    async findPlan(id) {
        const plan = await this.tenantPrisma.client.membershipPlan.findUnique({
            where: { id },
        });
        if (!plan) {
            throw new app_exception_1.AppException(memberships_constants_1.MEMBERSHIP_ERROR_CODES.PLAN_NOT_FOUND, 'Membership plan not found', common_1.HttpStatus.NOT_FOUND);
        }
        return plan;
    }
    async findMembership(id) {
        const membership = await this.tenantPrisma.client.membership.findUnique({
            where: { id },
        });
        if (!membership) {
            throw new common_1.NotFoundException('Membership not found');
        }
        return membership;
    }
};
exports.MembershipsService = MembershipsService;
exports.MembershipsService = MembershipsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        billing_service_1.BillingService])
], MembershipsService);
//# sourceMappingURL=memberships.service.js.map