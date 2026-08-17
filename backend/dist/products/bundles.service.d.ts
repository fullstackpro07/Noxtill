import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { Prisma } from '../../generated/prisma';
export declare class BundlesService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    create(dto: CreateBundleDto): Promise<{
        product: {
            name: string;
            id: string;
            businessId: string;
            createdAt: Date;
            updatedAt: Date;
            kind: import("../../generated/prisma").$Enums.ProductKind;
            category: string | null;
            sku: string | null;
            variations: Prisma.JsonValue;
            costPrice: Prisma.Decimal;
            sellingPrice: Prisma.Decimal;
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
                kind: import("../../generated/prisma").$Enums.ProductKind;
                category: string | null;
                sku: string | null;
                variations: Prisma.JsonValue;
                costPrice: Prisma.Decimal;
                sellingPrice: Prisma.Decimal;
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
            kind: import("../../generated/prisma").$Enums.ProductKind;
            category: string | null;
            sku: string | null;
            variations: Prisma.JsonValue;
            costPrice: Prisma.Decimal;
            sellingPrice: Prisma.Decimal;
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
                kind: import("../../generated/prisma").$Enums.ProductKind;
                category: string | null;
                sku: string | null;
                variations: Prisma.JsonValue;
                costPrice: Prisma.Decimal;
                sellingPrice: Prisma.Decimal;
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
            kind: import("../../generated/prisma").$Enums.ProductKind;
            category: string | null;
            sku: string | null;
            variations: Prisma.JsonValue;
            costPrice: Prisma.Decimal;
            sellingPrice: Prisma.Decimal;
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
                kind: import("../../generated/prisma").$Enums.ProductKind;
                category: string | null;
                sku: string | null;
                variations: Prisma.JsonValue;
                costPrice: Prisma.Decimal;
                sellingPrice: Prisma.Decimal;
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
