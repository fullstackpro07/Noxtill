import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { QuickPurchaseOrderDto } from './dto/quick-purchase-order.dto';
import { Prisma } from '../../generated/prisma';

/** Suppliers (UPD-BE-014) — formalizes what was previously only a free-text field on StockMovement. */
@Injectable()
export class SuppliersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly activity: ActivityService,
  ) {}

  create(dto: CreateSupplierDto) {
    return this.tenantPrisma.client.supplier.create({
      data: dto as Prisma.SupplierUncheckedCreateInput,
    });
  }

  findAll() {
    return this.tenantPrisma.client.supplier.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const supplier = await this.tenantPrisma.client.supplier.findUnique({
      where: { id },
    });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.findOne(id);
    return this.tenantPrisma.client.supplier.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.tenantPrisma.client.supplier.delete({ where: { id } });
  }

  /**
   * Quick PO (UPD-BE-014) — records a real multi-line purchase against this supplier in one call,
   * matching `InventoryService.recordPurchase`'s exact effects per line (stock movement, stock
   * increment, cost-price overwrite) but atomically for every line at once, plus one activity entry.
   */
  async quickPurchaseOrder(
    businessId: string,
    supplierId: string,
    dto: QuickPurchaseOrderDto,
  ) {
    const supplier = await this.findOne(supplierId);

    const productIds = [...new Set(dto.items.map((i) => i.productId))];
    const products = await this.tenantPrisma.client.product.findMany({
      where: { id: { in: productIds } },
    });
    if (products.length !== productIds.length) {
      throw new NotFoundException('One or more products were not found');
    }
    const productById = new Map(products.map((p) => [p.id, p]));

    const movementCreates = dto.items.map((item) =>
      this.tenantPrisma.client.stockMovement.create({
        data: {
          businessId,
          productId: item.productId,
          kind: 'purchase',
          qty: item.qty,
          unitCost: item.unitCost,
          supplierId,
        },
      }),
    );
    const productUpdates = dto.items.map((item) =>
      this.tenantPrisma.client.product.update({
        where: { id: item.productId },
        data: {
          stockQty: { increment: item.qty },
          costPrice: item.unitCost,
        },
      }),
    );
    const results = await this.tenantPrisma.client.$transaction([
      ...movementCreates,
      ...productUpdates,
    ]);
    const createdMovements = results.slice(0, dto.items.length) as {
      id: string;
    }[];

    const totalUnits = dto.items.reduce((sum, i) => sum + i.qty, 0);
    await this.activity.record(businessId, {
      type: 'stock',
      description: `Purchase order from ${supplier.name}: ${dto.items.length} product(s), ${totalUnits} unit(s)`,
      entityType: 'Supplier',
      entityId: supplier.id,
    });

    return {
      supplierId,
      lines: dto.items.map((item, i) => ({
        productId: item.productId,
        productName: productById.get(item.productId)!.name,
        qty: item.qty,
        unitCost: item.unitCost,
        stockMovementId: createdMovements[i]?.id,
      })),
    };
  }
}
