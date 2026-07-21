import { Injectable, NotFoundException } from '@nestjs/common';
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

/** Products CRUD (BE-023). All queries go through TenantPrismaService, so business_id scoping is automatic. */
@Injectable()
export class ProductsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  create(dto: CreateProductDto) {
    return this.tenantPrisma.client.product.create({
      data: {
        kind: dto.kind,
        name: dto.name,
        category: dto.category,
        variations: (dto.variations ?? []) as unknown as Prisma.InputJsonValue,
        costPrice: dto.costPrice,
        sellingPrice: dto.sellingPrice,
        stockQty: dto.stockQty ?? 0,
        lowStockThreshold: dto.lowStockThreshold ?? 5,
        durationMin: dto.kind === 'service' ? dto.durationMin : undefined,
        active: dto.active ?? true,
      } as Prisma.ProductUncheckedCreateInput,
    });
  }

  findAll(query: ProductQuery) {
    const where: Prisma.ProductWhereInput = {
      kind: query.kind,
      category: query.category,
      active: query.active,
      name: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
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
    return this.tenantPrisma.client.product.update({
      where: { id },
      data: {
        kind: dto.kind,
        name: dto.name,
        category: dto.category,
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
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.tenantPrisma.client.product.update({
      where: { id },
      data: { active: false },
    });
  }
}
