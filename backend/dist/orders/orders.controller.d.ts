import { OrdersService } from './orders.service';
import { InvoiceService } from './invoice.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { GenerateInvoiceDto } from './dto/generate-invoice.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { OrderStatus } from '../../generated/prisma';
export declare class OrdersController {
    private readonly ordersService;
    private readonly invoiceService;
    constructor(ordersService: OrdersService, invoiceService: InvoiceService);
    createSale(user: AuthenticatedUser, dto: CreateSaleDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        orderNo: number;
        customerId: string | null;
        orderType: import("../../generated/prisma").$Enums.OrderType;
        tableNo: string | null;
        status: import("../../generated/prisma").$Enums.OrderStatus;
        subtotal: import("generated/prisma/runtime/library").Decimal;
        tax: import("generated/prisma/runtime/library").Decimal;
        discount: import("generated/prisma/runtime/library").Decimal;
        total: import("generated/prisma/runtime/library").Decimal;
        cogs: import("generated/prisma/runtime/library").Decimal;
        isQuotation: boolean;
    }>;
    findAll(status?: OrderStatus): import("generated/prisma/runtime/library").PrismaPromise<({
        items: {
            name: string;
            id: string;
            orderId: string;
            productId: string | null;
            qty: number;
            price: import("generated/prisma/runtime/library").Decimal;
            cost: import("generated/prisma/runtime/library").Decimal;
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
        subtotal: import("generated/prisma/runtime/library").Decimal;
        tax: import("generated/prisma/runtime/library").Decimal;
        discount: import("generated/prisma/runtime/library").Decimal;
        total: import("generated/prisma/runtime/library").Decimal;
        cogs: import("generated/prisma/runtime/library").Decimal;
        isQuotation: boolean;
    })[]>;
    findOne(id: string): Promise<{
        items: {
            name: string;
            id: string;
            orderId: string;
            productId: string | null;
            qty: number;
            price: import("generated/prisma/runtime/library").Decimal;
            cost: import("generated/prisma/runtime/library").Decimal;
        }[];
        payments: {
            id: string;
            createdAt: Date;
            amount: import("generated/prisma/runtime/library").Decimal;
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
        subtotal: import("generated/prisma/runtime/library").Decimal;
        tax: import("generated/prisma/runtime/library").Decimal;
        discount: import("generated/prisma/runtime/library").Decimal;
        total: import("generated/prisma/runtime/library").Decimal;
        cogs: import("generated/prisma/runtime/library").Decimal;
        isQuotation: boolean;
    }>;
    updateStatus(user: AuthenticatedUser, id: string, dto: UpdateOrderStatusDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        orderNo: number;
        customerId: string | null;
        orderType: import("../../generated/prisma").$Enums.OrderType;
        tableNo: string | null;
        status: import("../../generated/prisma").$Enums.OrderStatus;
        subtotal: import("generated/prisma/runtime/library").Decimal;
        tax: import("generated/prisma/runtime/library").Decimal;
        discount: import("generated/prisma/runtime/library").Decimal;
        total: import("generated/prisma/runtime/library").Decimal;
        cogs: import("generated/prisma/runtime/library").Decimal;
        isQuotation: boolean;
    }>;
    generateInvoice(user: AuthenticatedUser, id: string, dto: GenerateInvoiceDto): Promise<{
        url: string;
    }>;
}
