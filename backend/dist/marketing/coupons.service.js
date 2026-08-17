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
exports.CouponsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const coupons_constants_1 = require("./coupons.constants");
const prisma_1 = require("../../generated/prisma");
function round2(value) {
    return Math.round(value * 100) / 100;
}
let CouponsService = class CouponsService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async create(businessId, dto) {
        try {
            return await this.tenantPrisma.client.coupon.create({
                data: {
                    businessId,
                    code: dto.code,
                    type: dto.type,
                    value: dto.value,
                    minOrderAmount: dto.minOrderAmount,
                    maxDiscountAmount: dto.maxDiscountAmount,
                    usageLimit: dto.usageLimit,
                    usageLimitPerCustomer: dto.usageLimitPerCustomer,
                    startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
                    expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
                },
            });
        }
        catch (err) {
            if (err instanceof prisma_1.Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002') {
                throw new app_exception_1.AppException(coupons_constants_1.COUPON_ERROR_CODES.DUPLICATE_CODE, `Coupon code "${dto.code}" already exists`, common_1.HttpStatus.CONFLICT);
            }
            throw err;
        }
    }
    list() {
        return this.tenantPrisma.client.coupon.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(id) {
        const coupon = await this.tenantPrisma.client.coupon.findUnique({
            where: { id },
        });
        if (!coupon) {
            throw new app_exception_1.AppException(coupons_constants_1.COUPON_ERROR_CODES.NOT_FOUND, 'Coupon not found', common_1.HttpStatus.NOT_FOUND);
        }
        return coupon;
    }
    async update(id, dto) {
        await this.findOne(id);
        return this.tenantPrisma.client.coupon.update({
            where: { id },
            data: {
                ...dto,
                expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
            },
        });
    }
    async remove(id) {
        await this.findOne(id);
        await this.tenantPrisma.client.coupon.delete({ where: { id } });
    }
    async validateAndApply(businessId, code, subtotal, customerId, tx) {
        const coupon = await tx.coupon.findUnique({
            where: { businessId_code: { businessId, code } },
        });
        if (!coupon) {
            throw new app_exception_1.AppException(coupons_constants_1.COUPON_ERROR_CODES.NOT_FOUND, `Coupon "${code}" not found`, common_1.HttpStatus.BAD_REQUEST);
        }
        if (!coupon.active) {
            throw new app_exception_1.AppException(coupons_constants_1.COUPON_ERROR_CODES.INACTIVE, 'Coupon is not active', common_1.HttpStatus.BAD_REQUEST);
        }
        const now = new Date();
        if (coupon.startsAt && coupon.startsAt > now) {
            throw new app_exception_1.AppException(coupons_constants_1.COUPON_ERROR_CODES.NOT_STARTED, 'Coupon is not active yet', common_1.HttpStatus.BAD_REQUEST);
        }
        if (coupon.expiresAt && coupon.expiresAt < now) {
            throw new app_exception_1.AppException(coupons_constants_1.COUPON_ERROR_CODES.EXPIRED, 'Coupon has expired', common_1.HttpStatus.BAD_REQUEST);
        }
        if (coupon.minOrderAmount && subtotal < Number(coupon.minOrderAmount)) {
            throw new app_exception_1.AppException(coupons_constants_1.COUPON_ERROR_CODES.MIN_ORDER_NOT_MET, `Order subtotal must be at least ${Number(coupon.minOrderAmount)}`, common_1.HttpStatus.BAD_REQUEST);
        }
        if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
            throw new app_exception_1.AppException(coupons_constants_1.COUPON_ERROR_CODES.USAGE_LIMIT_REACHED, 'Coupon usage limit reached', common_1.HttpStatus.BAD_REQUEST);
        }
        if (coupon.usageLimitPerCustomer !== null) {
            if (!customerId) {
                throw new app_exception_1.AppException(coupons_constants_1.COUPON_ERROR_CODES.CUSTOMER_USAGE_LIMIT_REACHED, 'This coupon requires a customer', common_1.HttpStatus.BAD_REQUEST);
            }
            const usedByCustomer = await tx.order.count({
                where: { couponId: coupon.id, customerId },
            });
            if (usedByCustomer >= coupon.usageLimitPerCustomer) {
                throw new app_exception_1.AppException(coupons_constants_1.COUPON_ERROR_CODES.CUSTOMER_USAGE_LIMIT_REACHED, 'You have already used this coupon', common_1.HttpStatus.BAD_REQUEST);
            }
        }
        const value = Number(coupon.value);
        let discountAmount = coupon.type === prisma_1.CouponType.percentage
            ? round2(subtotal * (value / 100))
            : value;
        if (coupon.maxDiscountAmount !== null) {
            discountAmount = Math.min(discountAmount, Number(coupon.maxDiscountAmount));
        }
        discountAmount = Math.min(discountAmount, subtotal);
        await tx.coupon.update({
            where: { id: coupon.id },
            data: { usedCount: { increment: 1 } },
        });
        return { couponId: coupon.id, discountAmount };
    }
};
exports.CouponsService = CouponsService;
exports.CouponsService = CouponsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], CouponsService);
//# sourceMappingURL=coupons.service.js.map