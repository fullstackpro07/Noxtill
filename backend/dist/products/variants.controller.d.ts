import { VariantsService } from './variants.service';
import { CreateVariantSetDto } from './dto/create-variant-set.dto';
import { UpdateVariantSetDto } from './dto/update-variant-set.dto';
import { ApplyVariantSetDto } from './dto/apply-variant-set.dto';
export declare class VariantsController {
    private readonly variantsService;
    constructor(variantsService: VariantsService);
    create(dto: CreateVariantSetDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "VariantSet", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        options: {
            name: string;
            id: string;
            variantSetId: string;
            priceOverride: import("generated/prisma/runtime/library").Decimal | null;
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
            priceOverride: import("generated/prisma/runtime/library").Decimal | null;
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
            priceOverride: import("generated/prisma/runtime/library").Decimal | null;
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
            priceOverride: import("generated/prisma/runtime/library").Decimal | null;
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
    }[]>;
}
