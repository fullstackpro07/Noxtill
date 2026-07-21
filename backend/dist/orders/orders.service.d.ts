import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { OrderStatus, Prisma } from '../../generated/prisma';
export declare class OrdersService {
    private readonly tenantPrisma;
    private readonly cls;
    private readonly sendGate;
    private readonly reviewRequests;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService, sendGate: SendGateService, reviewRequests: ReviewRequestsService);
    createSale(businessId: string, dto: CreateSaleDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
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
    }>;
    updateStatus(businessId: string, orderId: string, nextStatus: OrderStatus): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
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
    }>;
    findOne(id: string): Promise<{
        items: {
            name: string;
            id: string;
            orderId: string;
            productId: string | null;
            qty: number;
            price: Prisma.Decimal;
            cost: Prisma.Decimal;
        }[];
        payments: {
            id: string;
            createdAt: Date;
            amount: Prisma.Decimal;
            method: import("../../generated/prisma").$Enums.PaymentMethod;
            orderId: string;
            providerRef: string | null;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
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
    }>;
    findAll(status?: OrderStatus): import("generated/prisma/runtime/library").PrismaPromise<({
        items: {
            name: string;
            id: string;
            orderId: string;
            productId: string | null;
            qty: number;
            price: Prisma.Decimal;
            cost: Prisma.Decimal;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
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
    })[]>;
}
