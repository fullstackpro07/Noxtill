import { BundlesService } from './bundles.service';
import { CreateBundleDto } from './dto/create-bundle.dto';
export declare class BundlesController {
    private readonly bundlesService;
    constructor(bundlesService: BundlesService);
    create(dto: CreateBundleDto): Promise<{
        product: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            active: boolean;
            category: string | null;
            kind: import("generated/prisma").$Enums.ProductKind;
            sku: string | null;
            variations: import("generated/prisma/runtime/library").JsonValue;
            costPrice: import("generated/prisma/runtime/library").Decimal;
            sellingPrice: import("generated/prisma/runtime/library").Decimal;
            stockQty: number;
            lowStockThreshold: number;
            durationMin: number | null;
        };
        items: ({
            product: {
                id: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                businessId: string;
                active: boolean;
                category: string | null;
                kind: import("generated/prisma").$Enums.ProductKind;
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
            productId: string;
            qty: number;
            bundleId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        productId: string;
    }>;
    findAll(): import("generated/prisma/runtime/library").PrismaPromise<({
        product: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            active: boolean;
            category: string | null;
            kind: import("generated/prisma").$Enums.ProductKind;
            sku: string | null;
            variations: import("generated/prisma/runtime/library").JsonValue;
            costPrice: import("generated/prisma/runtime/library").Decimal;
            sellingPrice: import("generated/prisma/runtime/library").Decimal;
            stockQty: number;
            lowStockThreshold: number;
            durationMin: number | null;
        };
        items: ({
            product: {
                id: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                businessId: string;
                active: boolean;
                category: string | null;
                kind: import("generated/prisma").$Enums.ProductKind;
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
            productId: string;
            qty: number;
            bundleId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        productId: string;
    })[]>;
    findOne(id: string): Promise<{
        product: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            active: boolean;
            category: string | null;
            kind: import("generated/prisma").$Enums.ProductKind;
            sku: string | null;
            variations: import("generated/prisma/runtime/library").JsonValue;
            costPrice: import("generated/prisma/runtime/library").Decimal;
            sellingPrice: import("generated/prisma/runtime/library").Decimal;
            stockQty: number;
            lowStockThreshold: number;
            durationMin: number | null;
        };
        items: ({
            product: {
                id: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                businessId: string;
                active: boolean;
                category: string | null;
                kind: import("generated/prisma").$Enums.ProductKind;
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
            productId: string;
            qty: number;
            bundleId: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        productId: string;
    }>;
    remove(id: string): Promise<void>;
}
