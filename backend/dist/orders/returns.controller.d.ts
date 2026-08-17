import { ReturnsService } from './returns.service';
import { CreateReturnDto } from './dto/create-return.dto';
import { RejectReturnDto } from './dto/reject-return.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { ReturnStatus } from '../../generated/prisma';
export declare class ReturnsController {
    private readonly returnsService;
    constructor(returnsService: ReturnsService);
    create(user: AuthenticatedUser, dto: CreateReturnDto): Promise<{
        items: {
            id: string;
            amount: import("generated/prisma/runtime/library").Decimal;
            productId: string;
            qty: number;
            returnId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.ReturnStatus;
        orderId: string;
        reason: string;
        refundMethod: import("../../generated/prisma").$Enums.ReturnRefundMethod;
        refundAmount: import("generated/prisma/runtime/library").Decimal;
        restock: boolean;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
    }>;
    list(user: AuthenticatedUser, status?: ReturnStatus): Promise<({
        customer: {
            id: string;
            email: string | null;
            phone: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            birthday: Date | null;
            address: string | null;
            notes: string | null;
            tags: string[];
            consentMarketing: boolean;
            optedOut: boolean;
            lifetimeSpend: import("generated/prisma/runtime/library").Decimal;
            visitCount: number;
            lastVisitAt: Date | null;
            referredByCustomerId: string | null;
            referralRewardedAt: Date | null;
        } | null;
        order: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            customerId: string | null;
            status: import("../../generated/prisma").$Enums.OrderStatus;
            orderNo: number;
            orderType: import("../../generated/prisma").$Enums.OrderType;
            tableNo: string | null;
            subtotal: import("generated/prisma/runtime/library").Decimal;
            tax: import("generated/prisma/runtime/library").Decimal;
            discount: import("generated/prisma/runtime/library").Decimal;
            total: import("generated/prisma/runtime/library").Decimal;
            cogs: import("generated/prisma/runtime/library").Decimal;
            isQuotation: boolean;
            staffUserId: string | null;
            couponId: string | null;
            couponDiscountAmount: import("generated/prisma/runtime/library").Decimal | null;
            voucherId: string | null;
            voucherAmountApplied: import("generated/prisma/runtime/library").Decimal | null;
        };
        items: {
            id: string;
            amount: import("generated/prisma/runtime/library").Decimal;
            productId: string;
            qty: number;
            returnId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.ReturnStatus;
        orderId: string;
        reason: string;
        refundMethod: import("../../generated/prisma").$Enums.ReturnRefundMethod;
        refundAmount: import("generated/prisma/runtime/library").Decimal;
        restock: boolean;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
    })[]>;
    approve(user: AuthenticatedUser, id: string): Promise<{
        items: {
            id: string;
            amount: import("generated/prisma/runtime/library").Decimal;
            productId: string;
            qty: number;
            returnId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.ReturnStatus;
        orderId: string;
        reason: string;
        refundMethod: import("../../generated/prisma").$Enums.ReturnRefundMethod;
        refundAmount: import("generated/prisma/runtime/library").Decimal;
        restock: boolean;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
    }>;
    reject(user: AuthenticatedUser, id: string, dto: RejectReturnDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        customerId: string | null;
        status: import("../../generated/prisma").$Enums.ReturnStatus;
        orderId: string;
        reason: string;
        refundMethod: import("../../generated/prisma").$Enums.ReturnRefundMethod;
        refundAmount: import("generated/prisma/runtime/library").Decimal;
        restock: boolean;
        requestedByUserId: string | null;
        approvedByUserId: string | null;
    }>;
}
