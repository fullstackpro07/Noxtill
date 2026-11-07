import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CommerceBomStatus,
  CommerceWorkOrderStatus,
  Prisma,
  ProductKind,
  StockMovementKind,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { COMMERCE_PRODUCTION_ERROR_CODES as CODES } from './commerce.constants';
import type {
  CompleteCommerceWorkOrderDto,
  CreateCommerceBomDto,
  CreateCommerceWorkOrderDto,
  ReleaseCommerceWorkOrderDto,
} from './dto/commerce-production.dto';

const OPEN_STATUSES: CommerceWorkOrderStatus[] = [
  CommerceWorkOrderStatus.planned,
  CommerceWorkOrderStatus.in_progress,
];

type Tx = Prisma.TransactionClient;

function money(value: Prisma.Decimal | number | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Units of a component needed for `qty` finished units, including the BOM's scrap allowance. */
export function requiredComponentQty(
  qty: number,
  qtyPerUnit: number,
  scrapAllowancePct: number,
): number {
  return Math.ceil(qty * qtyPerUnit * (1 + scrapAllowancePct / 100) - 1e-9);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * Production & Assembly (Autonomous Commerce screen 4). BOMs and work orders are Commerce-owned;
 * products and stock stay canonical in Products/Inventory. Stock only changes on completion, as
 * `production_consume` / `production_output` stock movements written in the same transaction as
 * the product stock update. Quality-held output is never added to sellable stock.
 */
@Injectable()
export class CommerceProductionService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private async physicalProduct(businessId: string, id: string) {
    const product = await this.tenantPrisma.client.product.findFirst({
      where: { id, businessId, active: true, kind: ProductKind.product },
      select: { id: true, name: true, sku: true },
    });
    if (!product) {
      throw new AppException(
        CODES.PRODUCT_NOT_FOUND,
        'Only active physical products from Products can be used in production.',
        HttpStatus.NOT_FOUND,
      );
    }
    return product;
  }

  async listBoms(businessId: string) {
    const boms = await this.tenantPrisma.client.commerceBom.findMany({
      where: { businessId },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        items: {
          include: {
            component: {
              select: {
                id: true,
                name: true,
                sku: true,
                stockQty: true,
                costPrice: true,
              },
            },
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    return boms.map((bom) => {
      const componentCost = bom.items.reduce(
        (sum, item) =>
          sum +
          Number(item.qtyPerUnit) *
            (1 + Number(bom.scrapAllowancePct) / 100) *
            money(item.component.costPrice),
        0,
      );
      return {
        id: bom.id,
        product: bom.product,
        version: bom.version,
        status: bom.status,
        scrapAllowancePct: Number(bom.scrapAllowancePct),
        laborCostPerUnit:
          bom.laborCostPerUnit === null ? null : Number(bom.laborCostPerUnit),
        overheadCostPerUnit:
          bom.overheadCostPerUnit === null
            ? null
            : Number(bom.overheadCostPerUnit),
        notes: bom.notes,
        items: bom.items.map((item) => ({
          id: item.id,
          qtyPerUnit: Number(item.qtyPerUnit),
          component: {
            ...item.component,
            costPrice: money(item.component.costPrice),
          },
        })),
        // Current cost prices; a work order snapshots its own estimate at creation.
        estimatedUnitCost: round2(
          componentCost +
            money(bom.laborCostPerUnit) +
            money(bom.overheadCostPerUnit),
        ),
        createdAt: bom.createdAt,
      };
    });
  }

  /** Saves a new BOM version for a product and archives the previous active one. */
  async createBom(
    businessId: string,
    actorUserId: string,
    dto: CreateCommerceBomDto,
  ) {
    await this.physicalProduct(businessId, dto.productId);
    const componentIds = dto.items.map((item) => item.componentProductId);
    if (new Set(componentIds).size !== componentIds.length) {
      throw new AppException(
        CODES.INVALID_BOM,
        'List each component once; combine quantities instead.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (componentIds.includes(dto.productId)) {
      throw new AppException(
        CODES.INVALID_BOM,
        'A product cannot be a component of itself.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const components = await this.tenantPrisma.client.product.findMany({
      where: {
        businessId,
        id: { in: componentIds },
        active: true,
        kind: ProductKind.product,
      },
      select: { id: true },
    });
    if (components.length !== componentIds.length) {
      throw new AppException(
        CODES.PRODUCT_NOT_FOUND,
        'Every component must be an active physical product from Products.',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const latest = await tx.commerceBom.findFirst({
        where: { businessId, productId: dto.productId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const archived = await tx.commerceBom.updateMany({
        where: {
          businessId,
          productId: dto.productId,
          status: CommerceBomStatus.active,
        },
        data: { status: CommerceBomStatus.archived },
      });
      const bom = await tx.commerceBom.create({
        data: {
          businessId,
          productId: dto.productId,
          version: (latest?.version ?? 0) + 1,
          scrapAllowancePct: dto.scrapAllowancePct ?? 0,
          laborCostPerUnit: dto.laborCostPerUnit ?? null,
          overheadCostPerUnit: dto.overheadCostPerUnit ?? null,
          notes: dto.notes?.trim() || null,
          createdByUserId: actorUserId,
          items: {
            create: dto.items.map((item) => ({
              businessId,
              componentProductId: item.componentProductId,
              qtyPerUnit: item.qtyPerUnit,
            })),
          },
        },
        include: { items: true },
      });
      await tx.commerceWorkOrderAudit.create({
        data: {
          businessId,
          bomId: bom.id,
          action: 'bom_version_created',
          actorUserId,
          after: {
            productId: dto.productId,
            version: bom.version,
            archivedPreviousVersions: archived.count,
            items: dto.items,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return bom;
    });
  }

  private async findWorkOrder(businessId: string, id: string) {
    const workOrder =
      await this.tenantPrisma.client.commerceWorkOrder.findFirst({
        where: { id, businessId },
        include: {
          bom: true,
          materials: true,
          product: { select: { id: true, name: true } },
        },
      });
    if (!workOrder) {
      throw new AppException(
        CODES.WORK_ORDER_NOT_FOUND,
        'Work order was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return workOrder;
  }

  private assertStatus(
    current: CommerceWorkOrderStatus,
    allowed: CommerceWorkOrderStatus[],
    message: string,
  ) {
    if (!allowed.includes(current)) {
      throw new AppException(CODES.INVALID_STATE, message, HttpStatus.CONFLICT);
    }
  }

  async listWorkOrders(businessId: string) {
    const now = new Date();
    const orders = await this.tenantPrisma.client.commerceWorkOrder.findMany({
      where: { businessId },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        bom: { select: { id: true, version: true } },
        materials: {
          include: {
            component: {
              select: { id: true, name: true, sku: true, stockQty: true },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 300,
    });
    return orders.map((order) => {
      const open = OPEN_STATUSES.includes(order.status);
      const materials = order.materials.map((material) => ({
        component: material.component,
        qtyRequired: material.qtyRequired,
        qtyConsumed: material.qtyConsumed,
        // Live stock vs requirement; only meaningful before consumption.
        shortage: open
          ? Math.max(material.qtyRequired - material.component.stockQty, 0)
          : 0,
      }));
      return {
        id: order.id,
        number: order.number,
        product: order.product,
        bom: order.bom,
        qtyPlanned: order.qtyPlanned,
        qtyGood: order.qtyGood,
        qtyScrap: order.qtyScrap,
        status: order.status,
        dueDate: order.dueDate,
        late: open && order.dueDate !== null && order.dueDate < now,
        facility: order.facility,
        demandSource: order.demandSource,
        estimatedCost: Number(order.estimatedCost),
        actualCost: order.actualCost === null ? null : Number(order.actualCost),
        qualityPassed: order.qualityPassed,
        qualityNotes: order.qualityNotes,
        materialsReady: materials.every((material) => material.shortage === 0),
        materials,
        startedAt: order.startedAt,
        completedAt: order.completedAt,
        cancelledReason: order.cancelledReason,
        createdAt: order.createdAt,
      };
    });
  }

  async summary(businessId: string) {
    const orders = await this.listWorkOrders(businessId);
    const open = orders.filter((order) => OPEN_STATUSES.includes(order.status));
    const completed = orders.filter(
      (order) =>
        order.status === CommerceWorkOrderStatus.completed &&
        order.actualCost !== null,
    );
    const produced = completed.reduce(
      (sum, order) => sum + (order.qtyGood ?? 0) + (order.qtyScrap ?? 0),
      0,
    );
    const scrapped = completed.reduce(
      (sum, order) => sum + (order.qtyScrap ?? 0),
      0,
    );
    return {
      openWorkOrders: open.length,
      unitsInProduction: open
        .filter((order) => order.status === CommerceWorkOrderStatus.in_progress)
        .reduce((sum, order) => sum + order.qtyPlanned, 0),
      withShortages: open.filter((order) => !order.materialsReady).length,
      late: open.filter((order) => order.late).length,
      qualityHolds: orders.filter(
        (order) => order.status === CommerceWorkOrderStatus.quality_hold,
      ).length,
      completedCount: completed.length,
      // Null (not 0) when nothing has been completed yet, so the UI can say "no data".
      scrapRatePct: produced ? round2((scrapped / produced) * 100) : null,
      costVariance: completed.length
        ? round2(
            completed.reduce(
              (sum, order) => sum + (order.actualCost! - order.estimatedCost),
              0,
            ),
          )
        : null,
    };
  }

  async createWorkOrder(
    businessId: string,
    actorUserId: string,
    dto: CreateCommerceWorkOrderDto,
  ) {
    const bom = await this.tenantPrisma.client.commerceBom.findFirst({
      where: { id: dto.bomId, businessId },
      include: {
        items: {
          include: { component: { select: { id: true, costPrice: true } } },
        },
      },
    });
    if (!bom) {
      throw new AppException(
        CODES.BOM_NOT_FOUND,
        'Bill of materials was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (bom.status !== CommerceBomStatus.active) {
      throw new AppException(
        CODES.INVALID_STATE,
        'Use the active BOM version; archived versions are kept for history only.',
        HttpStatus.CONFLICT,
      );
    }
    const scrap = Number(bom.scrapAllowancePct);
    const materials = bom.items.map((item) => ({
      componentProductId: item.componentProductId,
      qtyRequired: requiredComponentQty(
        dto.qtyPlanned,
        Number(item.qtyPerUnit),
        scrap,
      ),
      unitCostEstimated: money(item.component.costPrice),
    }));
    const estimatedCost = round2(
      materials.reduce(
        (sum, material) =>
          sum + material.qtyRequired * material.unitCostEstimated,
        0,
      ) +
        dto.qtyPlanned *
          (money(bom.laborCostPerUnit) + money(bom.overheadCostPerUnit)),
    );

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.tenantPrisma.client.$transaction(async (tx) => {
          const last = await tx.commerceWorkOrder.findFirst({
            where: { businessId },
            orderBy: { number: 'desc' },
            select: { number: true },
          });
          const workOrder = await tx.commerceWorkOrder.create({
            data: {
              businessId,
              number: (last?.number ?? 0) + 1,
              bomId: bom.id,
              productId: bom.productId,
              qtyPlanned: dto.qtyPlanned,
              dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
              facility: dto.facility?.trim() || null,
              demandSource: dto.demandSource?.trim() || null,
              estimatedCost,
              createdByUserId: actorUserId,
              materials: {
                create: materials.map((material) => ({
                  businessId,
                  ...material,
                })),
              },
            },
          });
          await tx.commerceWorkOrderAudit.create({
            data: {
              businessId,
              workOrderId: workOrder.id,
              bomId: bom.id,
              action: 'work_order_created',
              actorUserId,
              after: {
                number: workOrder.number,
                qtyPlanned: dto.qtyPlanned,
                estimatedCost,
                bomVersion: bom.version,
              } as Prisma.InputJsonValue,
            },
          });
          return workOrder;
        });
      } catch (error) {
        // Two work orders created at once can race for the same number; retry with the next one.
        if (!isUniqueViolation(error) || attempt === 2) throw error;
      }
    }
    throw new AppException(
      CODES.INVALID_STATE,
      'Could not allocate a work order number. Try again.',
      HttpStatus.CONFLICT,
    );
  }

  async start(businessId: string, actorUserId: string, id: string) {
    const workOrder = await this.findWorkOrder(businessId, id);
    this.assertStatus(
      workOrder.status,
      [CommerceWorkOrderStatus.planned],
      'Only planned work orders can be started.',
    );
    return this.tenantPrisma.client.$transaction(async (tx) => {
      const updated = await tx.commerceWorkOrder.update({
        where: { id, businessId },
        data: {
          status: CommerceWorkOrderStatus.in_progress,
          startedAt: new Date(),
        },
      });
      await tx.commerceWorkOrderAudit.create({
        data: {
          businessId,
          workOrderId: id,
          action: 'work_order_started',
          actorUserId,
        },
      });
      return updated;
    });
  }

  /**
   * Completes a run: atomically consumes every component (refusing if stock ran out in the
   * meantime), records the cost at consumption, and either receives good units into stock
   * (quality passed) or parks them on quality hold (quality failed).
   */
  async complete(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: CompleteCommerceWorkOrderDto,
  ) {
    const workOrder = await this.findWorkOrder(businessId, id);
    this.assertStatus(
      workOrder.status,
      [CommerceWorkOrderStatus.in_progress],
      'Start the work order before completing it.',
    );
    if (dto.qtyGood + dto.qtyScrap !== workOrder.qtyPlanned) {
      throw new AppException(
        CODES.INVALID_QUANTITY,
        `Good units plus scrap must equal the planned ${workOrder.qtyPlanned} units.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const label = `Work order WO-${workOrder.number}`;

    return this.tenantPrisma.client.$transaction(async (tx) => {
      let componentCost = 0;
      for (const material of workOrder.materials) {
        const component = await tx.product.findFirst({
          where: { id: material.componentProductId, businessId },
          select: { name: true, costPrice: true },
        });
        // Conditional decrement: never takes stock below zero, even under concurrent sales.
        const consumed = await tx.product.updateMany({
          where: {
            id: material.componentProductId,
            businessId,
            stockQty: { gte: material.qtyRequired },
          },
          data: { stockQty: { decrement: material.qtyRequired } },
        });
        if (consumed.count !== 1) {
          throw new AppException(
            CODES.MATERIAL_SHORTAGE,
            `Not enough ${component?.name ?? 'component'} in stock: ${material.qtyRequired} needed. Nothing was consumed.`,
            HttpStatus.CONFLICT,
          );
        }
        const unitCost = money(component?.costPrice);
        componentCost += unitCost * material.qtyRequired;
        await tx.stockMovement.create({
          data: {
            businessId,
            productId: material.componentProductId,
            kind: StockMovementKind.production_consume,
            qty: -material.qtyRequired,
            unitCost,
            reason: `${label}: consumed for ${workOrder.product.name}`,
          },
        });
        await tx.commerceWorkOrderMaterial.update({
          where: { id: material.id, businessId },
          data: {
            qtyConsumed: material.qtyRequired,
            unitCostConsumed: unitCost,
          },
        });
      }
      const actualCost = round2(
        componentCost +
          workOrder.qtyPlanned *
            (money(workOrder.bom.laborCostPerUnit) +
              money(workOrder.bom.overheadCostPerUnit)),
      );
      if (dto.qualityPassed && dto.qtyGood > 0) {
        await this.receiveOutput(
          tx as unknown as Tx,
          businessId,
          workOrder.productId,
          dto.qtyGood,
          actualCost,
          `${label}: finished goods`,
        );
      }
      const status = dto.qualityPassed
        ? CommerceWorkOrderStatus.completed
        : CommerceWorkOrderStatus.quality_hold;
      const updated = await tx.commerceWorkOrder.update({
        where: { id, businessId },
        data: {
          status,
          qtyGood: dto.qtyGood,
          qtyScrap: dto.qtyScrap,
          qualityPassed: dto.qualityPassed,
          qualityNotes: dto.qualityNotes?.trim() || null,
          actualCost,
          completedAt: dto.qualityPassed ? new Date() : null,
        },
      });
      await tx.commerceWorkOrderAudit.create({
        data: {
          businessId,
          workOrderId: id,
          action: dto.qualityPassed
            ? 'work_order_completed'
            : 'work_order_quality_hold',
          reason: dto.qualityNotes?.trim() || null,
          actorUserId,
          after: {
            qtyGood: dto.qtyGood,
            qtyScrap: dto.qtyScrap,
            actualCost,
            estimatedCost: Number(workOrder.estimatedCost),
          } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
  }

  private async receiveOutput(
    tx: Tx,
    businessId: string,
    productId: string,
    qty: number,
    actualCost: number,
    reason: string,
  ) {
    await tx.product.update({
      where: { id: productId, businessId },
      data: { stockQty: { increment: qty } },
    });
    await tx.stockMovement.create({
      data: {
        businessId,
        productId,
        kind: StockMovementKind.production_output,
        qty,
        // Actual production cost spread over the good units received.
        unitCost: round2(actualCost / qty),
        reason,
      },
    });
  }

  /** Releases quality-held units into stock; anything not released is recorded as scrap. */
  async release(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: ReleaseCommerceWorkOrderDto,
  ) {
    const workOrder = await this.findWorkOrder(businessId, id);
    this.assertStatus(
      workOrder.status,
      [CommerceWorkOrderStatus.quality_hold],
      'Only work orders on quality hold can be released.',
    );
    const held = workOrder.qtyGood ?? 0;
    if (dto.qtyReleased > held) {
      throw new AppException(
        CODES.INVALID_QUANTITY,
        `Only ${held} units are on hold.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.tenantPrisma.client.$transaction(async (tx) => {
      if (dto.qtyReleased > 0) {
        await this.receiveOutput(
          tx as unknown as Tx,
          businessId,
          workOrder.productId,
          dto.qtyReleased,
          money(workOrder.actualCost),
          `Work order WO-${workOrder.number}: released from quality hold`,
        );
      }
      const updated = await tx.commerceWorkOrder.update({
        where: { id, businessId },
        data: {
          status: CommerceWorkOrderStatus.completed,
          qtyGood: dto.qtyReleased,
          qtyScrap: (workOrder.qtyScrap ?? 0) + held - dto.qtyReleased,
          completedAt: new Date(),
        },
      });
      await tx.commerceWorkOrderAudit.create({
        data: {
          businessId,
          workOrderId: id,
          action: 'work_order_released',
          reason: dto.reason.trim(),
          actorUserId,
          after: {
            qtyReleased: dto.qtyReleased,
            qtyScrapped: held - dto.qtyReleased,
          } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
  }

  async cancel(
    businessId: string,
    actorUserId: string,
    id: string,
    reason: string,
  ) {
    const workOrder = await this.findWorkOrder(businessId, id);
    this.assertStatus(
      workOrder.status,
      OPEN_STATUSES,
      'Only planned or in-progress work orders can be cancelled; nothing has been consumed yet at that point.',
    );
    return this.tenantPrisma.client.$transaction(async (tx) => {
      const updated = await tx.commerceWorkOrder.update({
        where: { id, businessId },
        data: {
          status: CommerceWorkOrderStatus.cancelled,
          cancelledReason: reason.trim(),
        },
      });
      await tx.commerceWorkOrderAudit.create({
        data: {
          businessId,
          workOrderId: id,
          action: 'work_order_cancelled',
          reason: reason.trim(),
          actorUserId,
        },
      });
      return updated;
    });
  }

  async audit(businessId: string, workOrderId: string) {
    await this.findWorkOrder(businessId, workOrderId);
    return this.tenantPrisma.client.commerceWorkOrderAudit.findMany({
      where: { businessId, workOrderId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
}
