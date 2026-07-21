import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Prisma, ProductKind } from '../../generated/prisma';
export interface ProductQuery {
    q?: string;
    category?: string;
    kind?: ProductKind;
    active?: boolean;
}
export declare class ProductsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    create(dto: CreateProductDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "Product", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        kind: import("../../generated/prisma").$Enums.ProductKind;
        category: string | null;
        variations: Prisma.JsonValue;
        costPrice: Prisma.Decimal;
        sellingPrice: Prisma.Decimal;
        stockQty: number;
        lowStockThreshold: number;
        durationMin: number | null;
        active: boolean;
    }>;
    findAll(query: ProductQuery): import("generated/prisma/runtime/library").PrismaPromise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        kind: import("../../generated/prisma").$Enums.ProductKind;
        category: string | null;
        variations: Prisma.JsonValue;
        costPrice: Prisma.Decimal;
        sellingPrice: Prisma.Decimal;
        stockQty: number;
        lowStockThreshold: number;
        durationMin: number | null;
        active: boolean;
    }[]>;
    findOne(id: string): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        kind: import("../../generated/prisma").$Enums.ProductKind;
        category: string | null;
        variations: Prisma.JsonValue;
        costPrice: Prisma.Decimal;
        sellingPrice: Prisma.Decimal;
        stockQty: number;
        lowStockThreshold: number;
        durationMin: number | null;
        active: boolean;
    }>;
    update(id: string, dto: UpdateProductDto): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        kind: import("../../generated/prisma").$Enums.ProductKind;
        category: string | null;
        variations: Prisma.JsonValue;
        costPrice: Prisma.Decimal;
        sellingPrice: Prisma.Decimal;
        stockQty: number;
        lowStockThreshold: number;
        durationMin: number | null;
        active: boolean;
    }>;
    deactivate(id: string): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        kind: import("../../generated/prisma").$Enums.ProductKind;
        category: string | null;
        variations: Prisma.JsonValue;
        costPrice: Prisma.Decimal;
        sellingPrice: Prisma.Decimal;
        stockQty: number;
        lowStockThreshold: number;
        durationMin: number | null;
        active: boolean;
    }>;
}
