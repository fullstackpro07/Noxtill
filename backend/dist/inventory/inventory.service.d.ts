import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateWastageDto } from './dto/create-wastage.dto';
export declare class InventoryService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    recordPurchase(businessId: string, dto: CreatePurchaseDto): Promise<{
        id: string;
        createdAt: Date;
        businessId: string;
        kind: import("../../generated/prisma").$Enums.StockMovementKind;
        productId: string;
        qty: number;
        unitCost: import("generated/prisma/runtime/library").Decimal | null;
        supplier: string | null;
        reason: string | null;
    }>;
    recordWastage(businessId: string, dto: CreateWastageDto): Promise<{
        id: string;
        createdAt: Date;
        businessId: string;
        kind: import("../../generated/prisma").$Enums.StockMovementKind;
        productId: string;
        qty: number;
        unitCost: import("generated/prisma/runtime/library").Decimal | null;
        supplier: string | null;
        reason: string | null;
    }>;
    listInventory(): Promise<{
        id: string;
        name: string;
        stockQty: number;
        lowStockThreshold: number;
        costPrice: number;
        stockValue: number;
        lastPurchaseAt: Date | null;
        supplier: string | null;
        status: string;
    }[]>;
    getMovements(productId: string): Promise<{
        id: string;
        createdAt: Date;
        businessId: string;
        kind: import("../../generated/prisma").$Enums.StockMovementKind;
        productId: string;
        qty: number;
        unitCost: import("generated/prisma/runtime/library").Decimal | null;
        supplier: string | null;
        reason: string | null;
    }[]>;
}
