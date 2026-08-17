import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateCouponDto, UpdateCouponDto } from './dto/create-coupon.dto';
import { CouponType, Prisma } from '../../generated/prisma';
interface CouponRow {
    id: string;
    type: CouponType;
    value: Prisma.Decimal;
    minOrderAmount: Prisma.Decimal | null;
    maxDiscountAmount: Prisma.Decimal | null;
    usageLimit: number | null;
    usageLimitPerCustomer: number | null;
    usedCount: number;
    startsAt: Date | null;
    expiresAt: Date | null;
    active: boolean;
}
export interface CouponTxClient {
    coupon: {
        findUnique(args: {
            where: {
                businessId_code: {
                    businessId: string;
                    code: string;
                };
            };
        }): Promise<CouponRow | null>;
        update(args: {
            where: {
                id: string;
            };
            data: Record<string, unknown>;
        }): Promise<unknown>;
    };
    order: {
        count(args: {
            where: {
                couponId: string;
                customerId: string;
            };
        }): Promise<number>;
    };
}
export declare class CouponsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    create(businessId: string, dto: CreateCouponDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: import("../../generated/prisma").$Enums.CouponType;
        businessId: string;
        active: boolean;
        startsAt: Date | null;
        expiresAt: Date | null;
        code: string;
        value: Prisma.Decimal;
        minOrderAmount: Prisma.Decimal | null;
        maxDiscountAmount: Prisma.Decimal | null;
        usageLimit: number | null;
        usageLimitPerCustomer: number | null;
        usedCount: number;
    }>;
    list(): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: import("../../generated/prisma").$Enums.CouponType;
        businessId: string;
        active: boolean;
        startsAt: Date | null;
        expiresAt: Date | null;
        code: string;
        value: Prisma.Decimal;
        minOrderAmount: Prisma.Decimal | null;
        maxDiscountAmount: Prisma.Decimal | null;
        usageLimit: number | null;
        usageLimitPerCustomer: number | null;
        usedCount: number;
    }[]>;
    findOne(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: import("../../generated/prisma").$Enums.CouponType;
        businessId: string;
        active: boolean;
        startsAt: Date | null;
        expiresAt: Date | null;
        code: string;
        value: Prisma.Decimal;
        minOrderAmount: Prisma.Decimal | null;
        maxDiscountAmount: Prisma.Decimal | null;
        usageLimit: number | null;
        usageLimitPerCustomer: number | null;
        usedCount: number;
    }>;
    update(id: string, dto: UpdateCouponDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: import("../../generated/prisma").$Enums.CouponType;
        businessId: string;
        active: boolean;
        startsAt: Date | null;
        expiresAt: Date | null;
        code: string;
        value: Prisma.Decimal;
        minOrderAmount: Prisma.Decimal | null;
        maxDiscountAmount: Prisma.Decimal | null;
        usageLimit: number | null;
        usageLimitPerCustomer: number | null;
        usedCount: number;
    }>;
    remove(id: string): Promise<void>;
    validateAndApply(businessId: string, code: string, subtotal: number, customerId: string | undefined, tx: CouponTxClient): Promise<{
        couponId: string;
        discountAmount: number;
    }>;
}
export {};
