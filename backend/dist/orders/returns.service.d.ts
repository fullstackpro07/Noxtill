import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CashRegisterService } from '../cash-register/cash-register.service';
import { BillingService } from '../billing/billing.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { Prisma, ReturnStatus } from '../../generated/prisma';
export declare class ReturnsService {
    private readonly tenantPrisma;
    private readonly cls;
    private readonly cashRegister;
    private readonly billing;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService, cashRegister: CashRegisterService, billing: BillingService);
    create(businessId: string, dto: CreateReturnDto): Promise<{
        items: {
            id: string;
            amount: Prisma.Decimal;
            productId: string;
            qty: number;
            returnId: string;
        }[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.ReturnStatus;
        orderId: string;
        reason: string;
        refundMethod: import("../../generated/prisma").$Enums.ReturnRefundMethod;
        refundAmount: Prisma.Decimal;
        restock: boolean;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
    }>;
    list(businessId: string, status?: ReturnStatus): Promise<({
        customer: {
            name: string;
            email: string | null;
            phone: string;
            id: string;
            businessId: string;
            createdAt: Date;
            updatedAt: Date;
            address: string | null;
            birthday: Date | null;
            notes: string | null;
            tags: string[];
            consentMarketing: boolean;
            optedOut: boolean;
            lifetimeSpend: Prisma.Decimal;
            visitCount: number;
            lastVisitAt: Date | null;
            referredByCustomerId: string | null;
            referralRewardedAt: Date | null;
        } | null;
        order: {
            id: string;
            businessId: string;
            createdAt: Date;
            updatedAt: Date;
            orderNo: number;
            customerId: string | null;
            orderType: import("../../generated/prisma").$Enums.OrderType;
            tableNo: string | null;
            status: import("../../generated/prisma").$Enums.OrderStatus;
            subtotal: Prisma.Decimal;
            tax: Prisma.Decimal;
            discount: Prisma.Decimal;
            total: Prisma.Decimal;
            cogs: Prisma.Decimal;
            isQuotation: boolean;
            staffUserId: string | null;
            couponId: string | null;
            couponDiscountAmount: Prisma.Decimal | null;
            voucherId: string | null;
            voucherAmountApplied: Prisma.Decimal | null;
        };
        items: {
            id: string;
            amount: Prisma.Decimal;
            productId: string;
            qty: number;
            returnId: string;
        }[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.ReturnStatus;
        orderId: string;
        reason: string;
        refundMethod: import("../../generated/prisma").$Enums.ReturnRefundMethod;
        refundAmount: Prisma.Decimal;
        restock: boolean;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
    })[]>;
    approve(businessId: string, id: string): Promise<{
        items: {
            id: string;
            amount: Prisma.Decimal;
            productId: string;
            qty: number;
            returnId: string;
        }[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.ReturnStatus;
        orderId: string;
        reason: string;
        refundMethod: import("../../generated/prisma").$Enums.ReturnRefundMethod;
        refundAmount: Prisma.Decimal;
        restock: boolean;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
    }>;
    reject(businessId: string, id: string, reason?: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.ReturnStatus;
        orderId: string;
        reason: string;
        refundMethod: import("../../generated/prisma").$Enums.ReturnRefundMethod;
        refundAmount: Prisma.Decimal;
        restock: boolean;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
    }>;
    private findPending;
}
