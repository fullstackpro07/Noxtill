import { InventoryService } from './inventory.service';
import { StockCountService } from './stock-count.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateWastageDto } from './dto/create-wastage.dto';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { StockCountStatus } from '../../generated/prisma';
export declare class InventoryController {
    private readonly inventoryService;
    private readonly stockCountService;
    constructor(inventoryService: InventoryService, stockCountService: StockCountService);
    recordPurchase(user: AuthenticatedUser, dto: CreatePurchaseDto): Promise<{
        supplier: string | null;
        id: string;
        businessId: string;
        createdAt: Date;
        kind: import("../../generated/prisma").$Enums.StockMovementKind;
        productId: string;
        qty: number;
        reason: string | null;
        unitCost: import("generated/prisma/runtime/library").Decimal | null;
        supplierId: string | null;
    }>;
    recordWastage(user: AuthenticatedUser, dto: CreateWastageDto): Promise<{
        supplier: string | null;
        id: string;
        businessId: string;
        createdAt: Date;
        kind: import("../../generated/prisma").$Enums.StockMovementKind;
        productId: string;
        qty: number;
        reason: string | null;
        unitCost: import("generated/prisma/runtime/library").Decimal | null;
        supplierId: string | null;
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
        businessId: string;
        createdAt: Date;
        kind: import("../../generated/prisma").$Enums.StockMovementKind;
        productId: string;
        qty: number;
        reason: string | null;
        unitCost: import("generated/prisma/runtime/library").Decimal | null;
        supplierId: string | null;
    }[]>;
    createStockCount(user: AuthenticatedUser, dto: CreateStockCountDto): Promise<{
        lines: ({
            product: {
                id: string;
                businessId: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                active: boolean;
                kind: import("../../generated/prisma").$Enums.ProductKind;
                category: string | null;
                sku: string | null;
                variations: import("generated/prisma/runtime/library").JsonValue;
                costPrice: import("generated/prisma/runtime/library").Decimal;
                sellingPrice: import("generated/prisma/runtime/library").Decimal;
                stockQty: number;
                lowStockThreshold: number;
                durationMin: number | null;
            };
        } & {
            id: string;
            createdAt: Date;
            productId: string;
            variance: number;
            stockCountId: string;
            expectedQty: number;
            countedQty: number;
        })[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StockCountStatus;
        note: string | null;
        createdByUserId: string | null;
        appliedByUserId: string | null;
        appliedAt: Date | null;
    }>;
    listStockCounts(status?: StockCountStatus): import("generated/prisma/runtime/library").PrismaPromise<({
        lines: ({
            product: {
                id: string;
                businessId: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                active: boolean;
                kind: import("../../generated/prisma").$Enums.ProductKind;
                category: string | null;
                sku: string | null;
                variations: import("generated/prisma/runtime/library").JsonValue;
                costPrice: import("generated/prisma/runtime/library").Decimal;
                sellingPrice: import("generated/prisma/runtime/library").Decimal;
                stockQty: number;
                lowStockThreshold: number;
                durationMin: number | null;
            };
        } & {
            id: string;
            createdAt: Date;
            productId: string;
            variance: number;
            stockCountId: string;
            expectedQty: number;
            countedQty: number;
        })[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StockCountStatus;
        note: string | null;
        createdByUserId: string | null;
        appliedByUserId: string | null;
        appliedAt: Date | null;
    })[]>;
    findStockCount(id: string): Promise<{
        lines: ({
            product: {
                id: string;
                businessId: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                active: boolean;
                kind: import("../../generated/prisma").$Enums.ProductKind;
                category: string | null;
                sku: string | null;
                variations: import("generated/prisma/runtime/library").JsonValue;
                costPrice: import("generated/prisma/runtime/library").Decimal;
                sellingPrice: import("generated/prisma/runtime/library").Decimal;
                stockQty: number;
                lowStockThreshold: number;
                durationMin: number | null;
            };
        } & {
            id: string;
            createdAt: Date;
            productId: string;
            variance: number;
            stockCountId: string;
            expectedQty: number;
            countedQty: number;
        })[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StockCountStatus;
        note: string | null;
        createdByUserId: string | null;
        appliedByUserId: string | null;
        appliedAt: Date | null;
    }>;
    applyStockCount(user: AuthenticatedUser, id: string): Promise<{
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        status: import("../../generated/prisma").$Enums.StockCountStatus;
        note: string | null;
        createdByUserId: string | null;
        appliedByUserId: string | null;
        appliedAt: Date | null;
    }>;
}
