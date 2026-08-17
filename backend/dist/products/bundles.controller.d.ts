import { BundlesService } from './bundles.service';
import { CreateBundleDto } from './dto/create-bundle.dto';
export declare class BundlesController {
    private readonly bundlesService;
    constructor(bundlesService: BundlesService);
    create(dto: CreateBundleDto): Promise<{
        product: {
            name: string;
            id: string;
            businessId: string;
            createdAt: Date;
            updatedAt: Date;
            kind: import("generated/prisma").$Enums.ProductKind;
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
        items: ({
            product: {
                name: string;
                id: string;
                businessId: string;
                createdAt: Date;
                updatedAt: Date;
                kind: import("generated/prisma").$Enums.ProductKind;
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
            productId: string;
            qty: number;
            bundleId: string;
        })[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        productId: string;
    }>;
    findAll(): import("generated/prisma/runtime/library").PrismaPromise<({
        product: {
            name: string;
            id: string;
            businessId: string;
            createdAt: Date;
            updatedAt: Date;
            kind: import("generated/prisma").$Enums.ProductKind;
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
        items: ({
            product: {
                name: string;
                id: string;
                businessId: string;
                createdAt: Date;
                updatedAt: Date;
                kind: import("generated/prisma").$Enums.ProductKind;
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
            productId: string;
            qty: number;
            bundleId: string;
        })[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        productId: string;
    })[]>;
    findOne(id: string): Promise<{
        product: {
            name: string;
            id: string;
            businessId: string;
            createdAt: Date;
            updatedAt: Date;
            kind: import("generated/prisma").$Enums.ProductKind;
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
        items: ({
            product: {
                name: string;
                id: string;
                businessId: string;
                createdAt: Date;
                updatedAt: Date;
                kind: import("generated/prisma").$Enums.ProductKind;
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
            productId: string;
            qty: number;
            bundleId: string;
        })[];
    } & {
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
        productId: string;
    }>;
    remove(id: string): Promise<void>;
}
