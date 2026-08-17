import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateVariantSetDto } from './dto/create-variant-set.dto';
import { UpdateVariantSetDto } from './dto/update-variant-set.dto';
import { ApplyVariantSetDto } from './dto/apply-variant-set.dto';
import { Prisma } from '../../generated/prisma';
export declare class VariantsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    create(dto: CreateVariantSetDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "VariantSet", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        options: {
            id: string;
            name: string;
            variantSetId: string;
            priceOverride: Prisma.Decimal | null;
        }[];
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
    }>;
    findAll(): import("generated/prisma/runtime/library").PrismaPromise<({
        options: {
            id: string;
            name: string;
            variantSetId: string;
            priceOverride: Prisma.Decimal | null;
        }[];
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
    })[]>;
    findOne(id: string): Promise<{
        options: {
            id: string;
            name: string;
            variantSetId: string;
            priceOverride: Prisma.Decimal | null;
        }[];
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
    }>;
    update(id: string, dto: UpdateVariantSetDto): Promise<{
        options: {
            id: string;
            name: string;
            variantSetId: string;
            priceOverride: Prisma.Decimal | null;
        }[];
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
    }>;
    remove(id: string): Promise<void>;
    apply(id: string, dto: ApplyVariantSetDto): Promise<{
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
    }[]>;
}
