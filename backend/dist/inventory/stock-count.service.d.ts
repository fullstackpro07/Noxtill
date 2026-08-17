import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { CreateStockCountDto } from './dto/create-stock-count.dto';
import { StockCountStatus } from '../../generated/prisma';
export declare class StockCountService {
    private readonly tenantPrisma;
    private readonly activity;
    constructor(tenantPrisma: TenantPrismaService, activity: ActivityService);
    create(businessId: string, actorUserId: string, dto: CreateStockCountDto): Promise<{
        lines: ({
            product: {
                name: string;
                id: string;
                businessId: string;
                createdAt: Date;
                updatedAt: Date;
                kind: import("../../generated/prisma").$Enums.ProductKind;
                category: string | null;
                sku: string | null;
                variations: import("generated/prisma/runtime/library").JsonValue;
                costPrice: import("generated/prisma/runtime/library").Decimal;
                sellingPrice: import("generated/prisma/runtime/library").Decimal;
                stockQty: number;
                lowStockThreshold: number;
                durationMin: number | null;
                active: boolean;
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
    list(status?: StockCountStatus): import("generated/prisma/runtime/library").PrismaPromise<({
        lines: ({
            product: {
                name: string;
                id: string;
                businessId: string;
                createdAt: Date;
                updatedAt: Date;
                kind: import("../../generated/prisma").$Enums.ProductKind;
                category: string | null;
                sku: string | null;
                variations: import("generated/prisma/runtime/library").JsonValue;
                costPrice: import("generated/prisma/runtime/library").Decimal;
                sellingPrice: import("generated/prisma/runtime/library").Decimal;
                stockQty: number;
                lowStockThreshold: number;
                durationMin: number | null;
                active: boolean;
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
    findOne(id: string): Promise<{
        lines: ({
            product: {
                name: string;
                id: string;
                businessId: string;
                createdAt: Date;
                updatedAt: Date;
                kind: import("../../generated/prisma").$Enums.ProductKind;
                category: string | null;
                sku: string | null;
                variations: import("generated/prisma/runtime/library").JsonValue;
                costPrice: import("generated/prisma/runtime/library").Decimal;
                sellingPrice: import("generated/prisma/runtime/library").Decimal;
                stockQty: number;
                lowStockThreshold: number;
                durationMin: number | null;
                active: boolean;
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
    apply(businessId: string, id: string, actorUserId: string): Promise<{
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
