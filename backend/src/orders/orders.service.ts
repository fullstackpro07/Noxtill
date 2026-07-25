import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_USER_ID } from '../common/tenancy/tenant.constants';
import { SendGateService } from '../messaging/send-gate.service';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import { generateReviewToken } from '../reviews/review-token.util';
import { CreateSaleDto } from './dto/create-sale.dto';
import {
  ORDER_ERROR_CODES,
  ORDER_STATUS_TRANSITIONS,
} from './orders.constants';
import { computeOrderTotals } from './order-totals.util';
import { OrderStatus, Prisma, ProductKind } from '../../generated/prisma';

/**
 * Products/Orders/POS module (BE-M2). `createSale` is THE atomic transaction
 * (spec §4.3): order + item snapshots (cogs/profit) + stock movements +
 * customer upsert/stats + payment OR credit entry + audit, all-or-nothing.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly sendGate: SendGateService,
    private readonly reviewRequests: ReviewRequestsService,
  ) {}

  async createSale(businessId: string, dto: CreateSaleDto) {
    const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);

    const { order, reviewToken, reviewCustomerId } =
      await this.tenantPrisma.client.$transaction(async (tx) => {
        const business = await tx.business.findUniqueOrThrow({
          where: { id: businessId },
        });

        let customerId = dto.customerId;
        if (!customerId && dto.customerPhone) {
          const customer = await tx.customer.upsert({
            where: {
              businessId_phone: { businessId, phone: dto.customerPhone },
            },
            create: {
              businessId,
              phone: dto.customerPhone,
              name: dto.customerName ?? dto.customerPhone,
            },
            update: {},
          });
          customerId = customer.id;
        }

        if (dto.payment.method === 'credit' && !customerId) {
          throw new AppException(
            ORDER_ERROR_CODES.CREDIT_REQUIRES_CUSTOMER,
            'Credit sales require a customer',
            HttpStatus.BAD_REQUEST,
          );
        }

        const productIds = [...new Set(dto.items.map((i) => i.productId))];
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));

        const itemsData = dto.items.map((item) => {
          const product = productMap.get(item.productId);
          if (!product) {
            throw new AppException(
              ORDER_ERROR_CODES.PRODUCT_NOT_FOUND,
              `Product ${item.productId} not found`,
              HttpStatus.BAD_REQUEST,
            );
          }
          if (
            product.kind === ProductKind.product &&
            product.stockQty < item.qty
          ) {
            throw new AppException(
              ORDER_ERROR_CODES.INSUFFICIENT_STOCK,
              `Insufficient stock for "${product.name}" (have ${product.stockQty}, need ${item.qty})`,
              HttpStatus.BAD_REQUEST,
            );
          }

          const price = item.priceOverride ?? Number(product.sellingPrice);
          const cost = Number(product.costPrice);

          return {
            productId: product.id,
            name: product.name,
            price,
            cost,
            qty: item.qty,
            kind: product.kind,
          };
        });

        const discount = dto.discount ?? 0;
        const { subtotal, tax, total, cogs } = computeOrderTotals(
          itemsData,
          discount,
          Number(business.taxRate),
        );

        const [{ next: orderNo }] = await tx.$queryRaw<{ next: number }[]>`
        SELECT COALESCE(MAX(order_no), 0) + 1 AS next FROM orders WHERE business_id = ${businessId}
      `;

        const order = await tx.order.create({
          data: {
            businessId,
            orderNo,
            customerId,
            orderType: dto.orderType ?? 'counter',
            tableNo: dto.tableNo,
            staffUserId: dto.staffUserId,
            status: OrderStatus.completed,
            subtotal,
            tax,
            discount,
            total,
            cogs,
          },
        });

        await tx.orderItem.createMany({
          data: itemsData.map((item) => ({
            orderId: order.id,
            productId: item.productId,
            name: item.name,
            price: item.price,
            cost: item.cost,
            qty: item.qty,
          })),
        });

        for (const item of itemsData) {
          if (item.kind === ProductKind.product) {
            await tx.product.update({
              where: { id: item.productId },
              data: { stockQty: { decrement: item.qty } },
            });
            await tx.stockMovement.create({
              data: {
                businessId,
                productId: item.productId,
                kind: 'sale',
                qty: -item.qty,
                unitCost: item.cost,
              },
            });
          }
        }

        if (dto.payment.method === 'credit') {
          await tx.creditEntry.create({
            data: {
              businessId,
              customerId: customerId!,
              kind: 'credit',
              amount: total,
              note: dto.payment.note ?? 'Sale on credit',
              orderId: order.id,
            },
          });
        } else {
          await tx.payment.create({
            data: {
              orderId: order.id,
              method: dto.payment.method,
              amount: dto.payment.amount ?? total,
            },
          });
        }

        if (customerId) {
          await tx.customer.update({
            where: { id: customerId },
            data: {
              lifetimeSpend: { increment: total },
              visitCount: { increment: 1 },
              lastVisitAt: new Date(),
            },
          });
        }

        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'sale.create',
            entity: 'Order',
            entityId: order.id,
            after: order as unknown as Prisma.InputJsonValue,
          },
        });

        let reviewToken: string | undefined;
        if (customerId) {
          reviewToken = generateReviewToken();
          await tx.reviewRequest.create({
            data: {
              businessId,
              customerId,
              token: reviewToken,
              source: 'order',
              sourceId: order.id,
            },
          });
        }

        return { order, reviewToken, reviewCustomerId: customerId };
      });

    // Outside the DB transaction: scheduling a send is queue work, not a DB write.
    // Best-effort — a failure here shouldn't roll back an already-completed sale.
    if (reviewToken && reviewCustomerId) {
      await this.reviewRequests.scheduleSend(
        businessId,
        reviewCustomerId,
        reviewToken,
      );
    }

    return order;
  }

  async updateStatus(
    businessId: string,
    orderId: string,
    nextStatus: OrderStatus,
  ) {
    const order = await this.tenantPrisma.client.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const allowed = ORDER_STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(nextStatus)) {
      throw new AppException(
        ORDER_ERROR_CODES.INVALID_STATUS_TRANSITION,
        `Cannot move an order from "${order.status}" to "${nextStatus}"`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.tenantPrisma.client.order.update({
      where: { id: orderId },
      data: { status: nextStatus },
    });

    if (updated.customerId) {
      await this.sendGate
        .send({
          businessId,
          customerId: updated.customerId,
          templateKey: 'order_status',
          variables: { orderNo: String(updated.orderNo), status: nextStatus },
        })
        .catch(() => undefined);
    }

    return updated;
  }

  async findOne(id: string) {
    const order = await this.tenantPrisma.client.order.findUnique({
      where: { id },
      include: { items: true, payments: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  findAll(status?: OrderStatus) {
    return this.tenantPrisma.client.order.findMany({
      where: { status, isQuotation: false },
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    });
  }
}
