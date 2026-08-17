import { InventoryService } from './inventory.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateWastageDto } from './dto/create-wastage.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class InventoryController {
    private readonly inventoryService;
    constructor(inventoryService: InventoryService);
    recordPurchase(user: AuthenticatedUser, dto: CreatePurchaseDto): Promise<{
        supplier: string | null;
        id: string;
        createdAt: Date;
        businessId: string;
        kind: import("generated/prisma").$Enums.StockMovementKind;
        productId: string;
        qty: number;
        unitCost: import("generated/prisma/runtime/library").Decimal | null;
        supplierId: string | null;
        reason: string | null;
    }>;
    recordWastage(user: AuthenticatedUser, dto: CreateWastageDto): Promise<{
        supplier: string | null;
        id: string;
        createdAt: Date;
        businessId: string;
        kind: import("generated/prisma").$Enums.StockMovementKind;
        productId: string;
        qty: number;
        unitCost: import("generated/prisma/runtime/library").Decimal | null;
        supplierId: string | null;
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
        supplier: string | null;
        id: string;
        createdAt: Date;
        businessId: string;
        kind: import("generated/prisma").$Enums.StockMovementKind;
        productId: string;
        qty: number;
        unitCost: import("generated/prisma/runtime/library").Decimal | null;
        supplierId: string | null;
        reason: string | null;
    }[]>;
}
