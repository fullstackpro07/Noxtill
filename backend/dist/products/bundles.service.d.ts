import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { Prisma } from '../../generated/prisma';
export declare class BundlesService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    create(dto: CreateBundleDto): Promise<{
        product: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            businessId: string;
            active: boolean;
            category: string | null;
            kind: import("../../generated/prisma").$Enums.ProductKind;
            sku: string | null;
            variations: Prisma.JsonValue;
            costPrice: Prisma.Decimal;
            sellingPrice: Prisma.Decimal;
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
                kind: import("../../generated/prisma").$Enums.ProductKind;
                sku: string | null;
                variations: Prisma.JsonValue;
                costPrice: Prisma.Decimal;
                sellingPrice: Prisma.Decimal;
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
            kind: import("../../generated/prisma").$Enums.ProductKind;
            sku: string | null;
            variations: Prisma.JsonValue;
            costPrice: Prisma.Decimal;
            sellingPrice: Prisma.Decimal;
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
                kind: import("../../generated/prisma").$Enums.ProductKind;
                sku: string | null;
                variations: Prisma.JsonValue;
                costPrice: Prisma.Decimal;
                sellingPrice: Prisma.Decimal;
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
            kind: import("../../generated/prisma").$Enums.ProductKind;
            sku: string | null;
            variations: Prisma.JsonValue;
            costPrice: Prisma.Decimal;
            sellingPrice: Prisma.Decimal;
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
                kind: import("../../generated/prisma").$Enums.ProductKind;
                sku: string | null;
                variations: Prisma.JsonValue;
                costPrice: Prisma.Decimal;
                sellingPrice: Prisma.Decimal;
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
