import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { ActivityService } from '../activity/activity.service';
import { SendGateService } from '../messaging/send-gate.service';
import { LocaleService } from '../common/localization/locale.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { PURCHASE_ORDER_ERROR_CODES } from './purchase-orders.constants';
import { PurchaseOrderStatus, StockMovementKind } from '@prisma/client';

const INCLUDE = {
  supplier: true,
  items: { include: { product: true } },
} as const;

/**
 * Purchase Orders, formal (UPD-BE-112) — a real draft-first lifecycle that replaces the two
 * "always-immediate" write paths (`InventoryService.recordPurchase`,
 * `SuppliersService.quickPurchaseOrder`, both left unchanged for their existing callers).
 * `Product.stockQty` is only ever touched by `receive()`, and only for quantities genuinely
 * received — never on create/send/confirm.
 */
@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly activity: ActivityService,
    private readonly sendGate: SendGateService,
    private readonly locale: LocaleService,
  ) {}

  async create(
    businessId: string,
    userId: string,
    dto: CreatePurchaseOrderDto,
  ) {
    const supplier = await this.tenantPrisma.client.supplier.findUnique({
      where: { id: dto.supplierId },
    });
    if (!supplier) {
      throw new AppException(
        PURCHASE_ORDER_ERROR_CODES.SUPPLIER_NOT_FOUND,
        'Supplier not found',
        HttpStatus.BAD_REQUEST,
      );
    }

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.tenantPrisma.client.product.findMany({
      where: { id: { in: productIds } },
    });
    if (products.length !== new Set(productIds).size) {
      throw new AppException(
        PURCHASE_ORDER_ERROR_CODES.PRODUCT_NOT_FOUND,
        'One or more items are not real products',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenantPrisma.client.purchaseOrder.create({
      data: {
        businessId,
        supplierId: dto.supplierId,
        note: dto.note,
        createdByUserId: userId,
        items: {
          create: dto.items.map((i) => ({
            productId: i.productId,
            qtyOrdered: i.qty,
            unitCost: i.unitCost,
          })),
        },
      },
      include: INCLUDE,
    });
  }

  list(status?: PurchaseOrderStatus) {
    return this.tenantPrisma.client.purchaseOrder.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      include: INCLUDE,
    });
  }

  async findOne(id: string) {
    const po = await this.tenantPrisma.client.purchaseOrder.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }
    return po;
  }

  /** The real "approve-then-send" step — sends a real WhatsApp preview to the supplier's own phone, never a Customer record. */
  async send(businessId: string, id: string) {
    const po = await this.findWithStatus(id, PurchaseOrderStatus.draft);

    if (!po.supplier.phone) {
      throw new AppException(
        PURCHASE_ORDER_ERROR_CODES.NO_SUPPLIER_PHONE,
        `${po.supplier.name} has no phone number on file — add one before sending`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const items = po.items
      .map(
        (i) =>
          `${i.qtyOrdered}x ${i.product.name} @ ${this.locale.formatCurrency(Number(i.unitCost), business)}`,
      )
      .join('\n');
    const total = po.items.reduce(
      (sum, i) => sum + i.qtyOrdered * Number(i.unitCost),
      0,
    );

    await this.sendGate.send({
      businessId,
      templateKey: 'purchase_order',
      variables: {
        businessName: business.name,
        items,
        total: this.locale.formatCurrency(total, business),
        note: po.note ? `\nNote: ${po.note}` : '',
      },
      to: { phone: po.supplier.phone },
    });

    await this.activity.record(businessId, {
      type: 'stock',
      description: `Purchase order sent to ${po.supplier.name}`,
      entityType: 'PurchaseOrder',
      entityId: po.id,
    });

    return this.tenantPrisma.client.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.sent, sentAt: new Date() },
      include: INCLUDE,
    });
  }

  /** Records that the supplier acknowledged the order — a manual confirmation step, not itself a stock write. */
  async confirm(id: string) {
    await this.findWithStatus(id, PurchaseOrderStatus.sent);
    return this.tenantPrisma.client.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.confirmed,
        confirmedAt: new Date(),
      },
      include: INCLUDE,
    });
  }

  /** The only method that ever touches real stock — full or partial, and only for quantities actually received this call. */
  async receive(businessId: string, id: string, dto: ReceivePurchaseOrderDto) {
    const po = await this.findOne(id);
    if (
      po.status !== PurchaseOrderStatus.confirmed &&
      po.status !== PurchaseOrderStatus.partially_received
    ) {
      throw new AppException(
        PURCHASE_ORDER_ERROR_CODES.WRONG_STATUS,
        `Purchase order is "${po.status}" — must be confirmed before it can be received`,
        HttpStatus.CONFLICT,
      );
    }

    const itemsById = new Map(po.items.map((i) => [i.id, i]));
    for (const line of dto.items) {
      const item = itemsById.get(line.itemId);
      if (!item) {
        throw new AppException(
          PURCHASE_ORDER_ERROR_CODES.ITEM_NOT_FOUND,
          `Line item ${line.itemId} does not belong to this purchase order`,
          HttpStatus.BAD_REQUEST,
        );
      }
      if (item.qtyReceived + line.qtyReceived > item.qtyOrdered) {
        throw new AppException(
          PURCHASE_ORDER_ERROR_CODES.OVER_RECEIVE,
          `Cannot receive ${line.qtyReceived} more of "${item.product.name}" — only ${item.qtyOrdered - item.qtyReceived} remain outstanding`,
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    await this.tenantPrisma.client.$transaction(async (tx) => {
      for (const line of dto.items) {
        if (line.qtyReceived <= 0) continue;
        const item = itemsById.get(line.itemId)!;

        await tx.stockMovement.create({
          data: {
            businessId,
            productId: item.productId,
            kind: StockMovementKind.purchase,
            qty: line.qtyReceived,
            unitCost: item.unitCost,
            supplierId: po.supplierId,
            reason: `Purchase order ${po.id}`,
          },
        });
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQty: { increment: line.qtyReceived },
            costPrice: item.unitCost,
          },
        });
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { qtyReceived: { increment: line.qtyReceived } },
        });
      }
    });

    const refreshed = await this.findOne(id);
    const fullyReceived = refreshed.items.every(
      (i) => i.qtyReceived >= i.qtyOrdered,
    );

    await this.activity.record(businessId, {
      type: 'stock',
      description: `Purchase order ${fullyReceived ? 'fully' : 'partially'} received from ${refreshed.supplier.name}`,
      entityType: 'PurchaseOrder',
      entityId: id,
    });

    return this.tenantPrisma.client.purchaseOrder.update({
      where: { id },
      data: {
        status: fullyReceived
          ? PurchaseOrderStatus.received
          : PurchaseOrderStatus.partially_received,
        receivedAt: new Date(),
      },
      include: INCLUDE,
    });
  }

  async cancel(id: string) {
    const po = await this.findOne(id);
    if (
      po.status === PurchaseOrderStatus.received ||
      po.status === PurchaseOrderStatus.partially_received ||
      po.status === PurchaseOrderStatus.cancelled
    ) {
      throw new AppException(
        PURCHASE_ORDER_ERROR_CODES.WRONG_STATUS,
        `A "${po.status}" purchase order can no longer be cancelled`,
        HttpStatus.CONFLICT,
      );
    }
    return this.tenantPrisma.client.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.cancelled },
      include: INCLUDE,
    });
  }

  private async findWithStatus(id: string, expected: PurchaseOrderStatus) {
    const po = await this.findOne(id);
    if (po.status !== expected) {
      throw new AppException(
        PURCHASE_ORDER_ERROR_CODES.WRONG_STATUS,
        `Purchase order is "${po.status}", expected "${expected}"`,
        HttpStatus.CONFLICT,
      );
    }
    return po;
  }
}
