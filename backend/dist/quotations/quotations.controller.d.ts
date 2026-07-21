import { QuotationsService } from './quotations.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class QuotationsController {
    private readonly quotationsService;
    constructor(quotationsService: QuotationsService);
    create(user: AuthenticatedUser, dto: CreateQuotationDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        orderNo: number;
        customerId: string | null;
        orderType: import("generated/prisma").$Enums.OrderType;
        tableNo: string | null;
        status: import("generated/prisma").$Enums.OrderStatus;
        subtotal: import("generated/prisma/runtime/library").Decimal;
        tax: import("generated/prisma/runtime/library").Decimal;
        discount: import("generated/prisma/runtime/library").Decimal;
        total: import("generated/prisma/runtime/library").Decimal;
        cogs: import("generated/prisma/runtime/library").Decimal;
        isQuotation: boolean;
    }>;
    convert(user: AuthenticatedUser, id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        orderNo: number;
        customerId: string | null;
        orderType: import("generated/prisma").$Enums.OrderType;
        tableNo: string | null;
        status: import("generated/prisma").$Enums.OrderStatus;
        subtotal: import("generated/prisma/runtime/library").Decimal;
        tax: import("generated/prisma/runtime/library").Decimal;
        discount: import("generated/prisma/runtime/library").Decimal;
        total: import("generated/prisma/runtime/library").Decimal;
        cogs: import("generated/prisma/runtime/library").Decimal;
        isQuotation: boolean;
    }>;
}
