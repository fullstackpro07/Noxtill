import { PublicOrderingService } from './public-ordering.service';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
export declare class PublicOrderingController {
    private readonly publicOrderingService;
    constructor(publicOrderingService: PublicOrderingService);
    getMenu(biz: string): Promise<{
        business: {
            name: string;
            currency: string;
            locale: string;
            branding: import("generated/prisma/runtime/library").JsonValue;
        };
        products: {
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            kind: import("generated/prisma").$Enums.ProductKind;
            category: string | null;
            variations: import("generated/prisma/runtime/library").JsonValue;
            costPrice: import("generated/prisma/runtime/library").Decimal;
            sellingPrice: import("generated/prisma/runtime/library").Decimal;
            stockQty: number;
            lowStockThreshold: number;
            durationMin: number | null;
            active: boolean;
        }[];
    }>;
    createOrder(biz: string, dto: CreatePublicOrderDto): Promise<{
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
