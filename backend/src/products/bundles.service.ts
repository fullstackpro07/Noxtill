import { NotFoundException, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { Prisma } from '../../generated/prisma';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Bundles (UPD-BE-013). Every bundle gets a real, sellable backing `Product` row so it can go
 * through the exact same POS/checkout path as anything else — see the model's doc comment in
 * schema.prisma for the disclosed scope boundary (bundle stock is tracked on the bundle's own
 * Product row, not cascaded into each component's stock at sale time).
 */
@Injectable()
export class BundlesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(dto: CreateBundleDto) {
    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const components = await this.tenantPrisma.client.product.findMany({
      where: { id: { in: productIds } },
    });
    if (components.length !== productIds.length) {
      throw new NotFoundException(
        'One or more component products were not found',
      );
    }
    const componentById = new Map(components.map((p) => [p.id, p]));
    const costPrice = round2(
      dto.items.reduce(
        (sum, item) =>
          sum + Number(componentById.get(item.productId)!.costPrice) * item.qty,
        0,
      ),
    );

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          kind: 'product',
          name: dto.name,
          sku: dto.sku,
          costPrice,
          sellingPrice: dto.sellingPrice,
          stockQty: 0,
        } as Prisma.ProductUncheckedCreateInput,
      });
      return tx.bundle.create({
        data: {
          productId: product.id,
          items: { create: dto.items },
        } as Prisma.BundleUncheckedCreateInput,
        include: { items: { include: { product: true } }, product: true },
      });
    });
  }

  findAll() {
    return this.tenantPrisma.client.bundle.findMany({
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { product: true } }, product: true },
    });
  }

  async findOne(id: string) {
    const bundle = await this.tenantPrisma.client.bundle.findUnique({
      where: { id },
      include: { items: { include: { product: true } }, product: true },
    });
    if (!bundle) {
      throw new NotFoundException('Bundle not found');
    }
    return bundle;
  }

  /** Un-bundles and soft-deactivates the backing product (never hard-deleted — it may already be on past orders). */
  async remove(id: string) {
    const bundle = await this.findOne(id);
    await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.bundleItem.deleteMany({
        where: { bundleId: id },
      }),
      this.tenantPrisma.client.bundle.delete({ where: { id } }),
      this.tenantPrisma.client.product.update({
        where: { id: bundle.productId },
        data: { active: false },
      }),
    ]);
  }
}
