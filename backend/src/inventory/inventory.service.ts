import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { CreateWastageDto } from './dto/create-wastage.dto';
import { INVENTORY_ERROR_CODES } from './inventory.constants';
import { ProductKind } from '../../generated/prisma';

/** Inventory: purchases/wastage (BE-033), on-hand list + movement timeline (BE-034). */
@Injectable()
export class InventoryService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async recordPurchase(businessId: string, dto: CreatePurchaseDto) {
    const product = await this.tenantPrisma.client.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const [movement] = await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.stockMovement.create({
        data: {
          businessId,
          productId: dto.productId,
          kind: 'purchase',
          qty: dto.qty,
          unitCost: dto.unitCost,
          supplier: dto.supplier,
        },
      }),
      this.tenantPrisma.client.product.update({
        where: { id: dto.productId },
        data: { stockQty: { increment: dto.qty }, costPrice: dto.unitCost },
      }),
    ]);

    return movement;
  }

  async recordWastage(businessId: string, dto: CreateWastageDto) {
    const product = await this.tenantPrisma.client.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (product.stockQty < dto.qty) {
      throw new AppException(
        INVENTORY_ERROR_CODES.INSUFFICIENT_STOCK,
        `Cannot waste ${dto.qty} units — only ${product.stockQty} on hand`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const reason = dto.note ? `${dto.reason}: ${dto.note}` : dto.reason;

    const [movement] = await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.stockMovement.create({
        data: {
          businessId,
          productId: dto.productId,
          kind: 'wastage',
          qty: -dto.qty,
          reason,
        },
      }),
      this.tenantPrisma.client.product.update({
        where: { id: dto.productId },
        data: { stockQty: { decrement: dto.qty } },
      }),
    ]);

    return movement;
  }

  async listInventory() {
    const products = await this.tenantPrisma.client.product.findMany({
      where: { kind: ProductKind.product },
      orderBy: { name: 'asc' },
    });

    const lastPurchases = await this.tenantPrisma.client.stockMovement.findMany(
      {
        where: {
          productId: { in: products.map((p) => p.id) },
          kind: 'purchase',
        },
        orderBy: { createdAt: 'desc' },
      },
    );
    const lastPurchaseMap = new Map<
      string,
      { at: Date; supplier: string | null }
    >();
    for (const movement of lastPurchases) {
      if (!lastPurchaseMap.has(movement.productId)) {
        lastPurchaseMap.set(movement.productId, {
          at: movement.createdAt,
          supplier: movement.supplier,
        });
      }
    }

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      stockQty: product.stockQty,
      lowStockThreshold: product.lowStockThreshold,
      costPrice: Number(product.costPrice),
      stockValue: product.stockQty * Number(product.costPrice),
      lastPurchaseAt: lastPurchaseMap.get(product.id)?.at ?? null,
      supplier: lastPurchaseMap.get(product.id)?.supplier ?? null,
      status:
        product.stockQty <= 0
          ? 'out_of_stock'
          : product.stockQty <= product.lowStockThreshold
            ? 'low_stock'
            : 'ok',
    }));
  }

  async getMovements(productId: string) {
    const product = await this.tenantPrisma.client.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return this.tenantPrisma.client.stockMovement.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
