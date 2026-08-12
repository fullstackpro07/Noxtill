import { HeldSalesService } from './held-sales.service';
import { HoldSaleDto } from './dto/hold-sale.dto';
import { ResumeHeldSaleDto } from './dto/resume-held-sale.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class HeldSalesController {
    private readonly heldSalesService;
    constructor(heldSalesService: HeldSalesService);
    list(user: AuthenticatedUser): Promise<{
        cart: HoldSaleDto;
        estimatedTotal: number;
        id: string;
        createdAt: Date;
        businessId: string;
        note: string | null;
        heldByUserId: string | null;
    }[]>;
    hold(user: AuthenticatedUser, dto: HoldSaleDto): Promise<{
        id: string;
        createdAt: Date;
        businessId: string;
        note: string | null;
        cart: import("generated/prisma/runtime/library").JsonValue;
        heldByUserId: string | null;
    }>;
    resume(user: AuthenticatedUser, id: string, dto: ResumeHeldSaleDto): Promise<{
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
        staffUserId: string | null;
    }>;
    discard(user: AuthenticatedUser, id: string): Promise<void>;
}
