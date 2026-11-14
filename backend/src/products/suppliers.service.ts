import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { Queue } from 'bullmq';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { QuickPurchaseOrderDto } from './dto/quick-purchase-order.dto';
import { Prisma } from '@prisma/client';
import { resolvePolicies } from '../common/policies/policies.service';
import {
  INVENTORY_PURCHASE_MOVEMENT_RECORDED_EVENT_JOB,
  SPECIALIST_AGENT_INVENTORY_EVENTS_QUEUE,
} from '../common/agents/specialist-agent-events.constants';

/** Suppliers (UPD-BE-014) — formalizes what was previously only a free-text field on StockMovement. */
@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly activity: ActivityService,
    @Optional()
    @InjectQueue(SPECIALIST_AGENT_INVENTORY_EVENTS_QUEUE)
    private readonly specialistAgentEvents?: Queue,
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
      businessId: string;
      createdAt: Date;
    }[];

    const totalUnits = dto.items.reduce((sum, i) => sum + i.qty, 0);
    await this.activity.record(businessId, {
      type: 'stock',
      description: `Purchase order from ${supplier.name}: ${dto.items.length} product(s), ${totalUnits} unit(s)`,
      entityType: 'Supplier',
      entityId: supplier.id,
    });

    await this.queuePurchaseMovementReviews(createdMovements);

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

  private async queuePurchaseMovementReviews(
    movements: Array<{ id: string; businessId: string; createdAt: Date }>,
  ): Promise<void> {
    if (!this.specialistAgentEvents || movements.length === 0) return;
    try {
      const businessId = movements[0]?.businessId;
      if (!businessId || movements.some((movement) => movement.businessId !== businessId)) {
        return;
      }
      const business = await this.tenantPrisma.client.business.findUnique({
        where: { id: businessId },
        select: { policies: true },
      });
      if (
        !business ||
        !resolvePolicies(business).bool(
          'agents.inventoryPurchaseMovementEventReviewEnabled',
        )
      ) {
        return;
      }

      for (const movement of movements) {
        try {
          await this.specialistAgentEvents.add(
            INVENTORY_PURCHASE_MOVEMENT_RECORDED_EVENT_JOB,
            {
              businessId: movement.businessId,
              stockMovementId: movement.id,
              occurredAt: movement.createdAt.toISOString(),
            },
            {
              jobId: `inventory-purchase-movement-${movement.businessId}-${movement.id}`,
              attempts: 3,
              backoff: { type: 'exponential', delay: 1_000 },
              removeOnComplete: 200,
              removeOnFail: 500,
            },
          );
        } catch (error) {
          this.logger.warn(
            `Could not queue Inventory review for purchase movement ${movement.id}: ${(error as Error).message}`,
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Could not queue Inventory review for a supplier purchase movement: ${(error as Error).message}`,
      );
    }
  }
}
