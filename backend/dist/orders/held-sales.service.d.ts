import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { OrdersService } from './orders.service';
import { HoldSaleDto } from './dto/hold-sale.dto';
import { ResumeHeldSaleDto } from './dto/resume-held-sale.dto';
import { Prisma } from '../../generated/prisma';
export declare class HeldSalesService {
    private readonly tenantPrisma;
    private readonly cls;
    private readonly ordersService;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService, ordersService: OrdersService);
    hold(businessId: string, dto: HoldSaleDto): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        note: string | null;
        cart: Prisma.JsonValue;
        heldByUserId: string | null;
    }>;
    list(businessId: string): Promise<{
        cart: HoldSaleDto;
        estimatedTotal: number;
        id: string;
        businessId: string;
        createdAt: Date;
        note: string | null;
        heldByUserId: string | null;
    }[]>;
    discard(businessId: string, id: string): Promise<void>;
    resume(businessId: string, id: string, dto: ResumeHeldSaleDto): Promise<{
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
    }>;
}
