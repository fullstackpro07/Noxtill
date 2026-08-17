import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateVariantSetDto } from './dto/create-variant-set.dto';
import { UpdateVariantSetDto } from './dto/update-variant-set.dto';
import { ApplyVariantSetDto } from './dto/apply-variant-set.dto';
import { Prisma } from '../../generated/prisma';

interface VariationOption {
  name: string;
  priceOverride?: number;
}
interface Variation {
  label: string;
  options: VariationOption[];
}

/**
 * Variants (UPD-BE-012) — reusable templates (e.g. "Size": Small/Medium/Large) defined once and
 * applied to many products. Applying writes into the pre-existing informal `Product.variations`
 * JSON field (see `products/dto/variation.dto.ts`) in its unchanged `{label, options}` shape, so
 * every existing consumer of that field keeps working unmodified — a `VariantSet` is the formal
 * *source* products can be stamped from, not a new runtime representation.
 */
@Injectable()
export class VariantsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  create(dto: CreateVariantSetDto) {
    return this.tenantPrisma.client.variantSet.create({
      data: {
        name: dto.name,
        options: { create: dto.options },
      } as Prisma.VariantSetUncheckedCreateInput,
      include: { options: true },
    });
  }

  findAll() {
    return this.tenantPrisma.client.variantSet.findMany({
      orderBy: { name: 'asc' },
      include: { options: true },
    });
  }

  async findOne(id: string) {
    const set = await this.tenantPrisma.client.variantSet.findUnique({
      where: { id },
      include: { options: true },
    });
    if (!set) {
      throw new NotFoundException('Variant set not found');
    }
    return set;
  }

  async update(id: string, dto: UpdateVariantSetDto) {
    await this.findOne(id);
    return this.tenantPrisma.client.$transaction(async (tx) => {
      if (dto.options) {
        await tx.variantOption.deleteMany({ where: { variantSetId: id } });
      }
      return tx.variantSet.update({
        where: { id },
        data: {
          name: dto.name,
          options: dto.options ? { create: dto.options } : undefined,
        },
        include: { options: true },
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.tenantPrisma.client.variantOption.deleteMany({
      where: { variantSetId: id },
    });
    await this.tenantPrisma.client.variantSet.delete({ where: { id } });
  }

  /** Stamps this variant set onto each product's `variations` JSON, replacing any existing entry with the same label. */
  async apply(id: string, dto: ApplyVariantSetDto) {
    const set = await this.findOne(id);
    const stamped: Variation = {
      label: set.name,
      options: set.options.map((o) => ({
        name: o.name,
        priceOverride:
          o.priceOverride === null ? undefined : Number(o.priceOverride),
      })),
    };

    const products = await this.tenantPrisma.client.product.findMany({
      where: { id: { in: dto.productIds } },
    });
    if (products.length !== dto.productIds.length) {
      throw new NotFoundException('One or more products were not found');
    }

    const updated = await Promise.all(
      products.map((product) => {
        const existing = (product.variations as unknown as Variation[]) ?? [];
        const next = [
          ...existing.filter((v) => v.label !== stamped.label),
          stamped,
        ];
        return this.tenantPrisma.client.product.update({
          where: { id: product.id },
          data: { variations: next as unknown as Prisma.InputJsonValue },
        });
      }),
    );
    return updated;
  }
}
