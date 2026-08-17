import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Prisma, ProductKind } from '@prisma/client';

export interface ProductQuery {
  q?: string;
  category?: string;
  kind?: ProductKind;
  active?: boolean;
}

const PRODUCT_ERROR_CODES = {
  DUPLICATE_SKU: 'DUPLICATE_SKU',
} as const;

/** Products CRUD (BE-023). All queries go through TenantPrismaService, so business_id scoping is automatic. */
@Injectable()
export class ProductsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateProductDto) {
    try {
      return await this.tenantPrisma.client.product.create({
        data: {
          kind: dto.kind,
          name: dto.name,
          category: dto.category,
          sku: dto.sku,
          variations: (dto.variations ??
            []) as unknown as Prisma.InputJsonValue,
          costPrice: dto.costPrice,
          sellingPrice: dto.sellingPrice,
          stockQty: dto.stockQty ?? 0,
          lowStockThreshold: dto.lowStockThreshold ?? 5,
          durationMin: dto.kind === 'service' ? dto.durationMin : undefined,
          active: dto.active ?? true,
        } as Prisma.ProductUncheckedCreateInput,
      });
    } catch (err) {
      throw this.mapDuplicateSkuError(err, dto.sku);
    }
  }

  findAll(query: ProductQuery) {
    const where: Prisma.ProductWhereInput = {
      kind: query.kind,
      category: query.category,
      active: query.active,
      OR: query.q
        ? [{ name: { contains: query.q } }, { sku: { contains: query.q } }]
        : undefined,
    };

    return this.tenantPrisma.client.product.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const product = await this.tenantPrisma.client.product.findUnique({
      where: { id },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.findOne(id);
    try {
      return await this.tenantPrisma.client.product.update({
        where: { id },
        data: {
          kind: dto.kind,
          name: dto.name,
          category: dto.category,
          sku: dto.sku,
          variations: dto.variations
            ? (dto.variations as unknown as Prisma.InputJsonValue)
            : undefined,
          costPrice: dto.costPrice,
          sellingPrice: dto.sellingPrice,
          stockQty: dto.stockQty,
          lowStockThreshold: dto.lowStockThreshold,
          durationMin: dto.durationMin,
          active: dto.active,
        },
      });
    } catch (err) {
      throw this.mapDuplicateSkuError(err, dto.sku);
    }
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.tenantPrisma.client.product.update({
      where: { id },
      data: { active: false },
    });
  }

  /** Prisma's raw P2002 on the (businessId, sku) unique index reads as an opaque 500 to the client otherwise. */
  private mapDuplicateSkuError(err: unknown, sku: string | undefined): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      (err.meta?.target as string[] | undefined)?.includes('sku')
    ) {
      return new AppException(
        PRODUCT_ERROR_CODES.DUPLICATE_SKU,
        `A product with sku "${sku}" already exists`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return err;
  }
}
