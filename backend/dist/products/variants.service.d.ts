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
            name: string;
            id: string;
            variantSetId: string;
            priceOverride: Prisma.Decimal | null;
        }[];
    } & {
        name: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    findAll(): import("generated/prisma/runtime/library").PrismaPromise<({
        options: {
            name: string;
            id: string;
            variantSetId: string;
            priceOverride: Prisma.Decimal | null;
        }[];
    } & {
        name: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
    findOne(id: string): Promise<{
        options: {
            name: string;
            id: string;
            variantSetId: string;
            priceOverride: Prisma.Decimal | null;
        }[];
    } & {
        name: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    update(id: string, dto: UpdateVariantSetDto): Promise<{
        options: {
            name: string;
            id: string;
            variantSetId: string;
            priceOverride: Prisma.Decimal | null;
        }[];
    } & {
        name: string;
        id: string;
        businessId: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    remove(id: string): Promise<void>;
    apply(id: string, dto: ApplyVariantSetDto): Promise<{
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
    }[]>;
}
