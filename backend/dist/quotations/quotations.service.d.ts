import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
export declare class QuotationsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    create(businessId: string, dto: CreateQuotationDto): Promise<{
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
    convert(businessId: string, quotationId: string): Promise<{
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
}
