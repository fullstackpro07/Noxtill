import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { computeOrderTotals } from '../orders/order-totals.util';
import { ORDER_ERROR_CODES } from '../orders/orders.constants';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { OrderStatus } from '../../generated/prisma';

/**
 * Quotations (BE-028): same Order/OrderItem tables as sales (isQuotation=true,
 * no payment/stock/customer-stats effects), so `POST /orders/:id/invoice`
 * (BE-027) already covers "Send PDF" for a quotation with no extra code.
 */
@Injectable()
export class QuotationsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  findAll() {
    return this.tenantPrisma.client.order.findMany({
      where: { isQuotation: true },
      orderBy: { createdAt: 'desc' },
      include: { items: true, customer: true },
    });
  }

  async create(businessId: string, dto: CreateQuotationDto) {
    return this.tenantPrisma.client.$transaction(async (tx) => {
      let customerId = dto.customerId;
      if (!customerId && dto.customerPhone) {
        const customer = await tx.customer.upsert({
          where: { businessId_phone: { businessId, phone: dto.customerPhone } },
          create: {
            businessId,
            phone: dto.customerPhone,
            name: dto.customerName ?? dto.customerPhone,
          },
          update: {},
        });
        customerId = customer.id;
      }

      const business = await tx.business.findUniqueOrThrow({
        where: { id: businessId },
      });
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
        return {
          productId: product.id,
          name: product.name,
          price: item.priceOverride ?? Number(product.sellingPrice),
          cost: Number(product.costPrice),
          qty: item.qty,
        };
      });

      const discount = dto.discount ?? 0;
      const { subtotal, tax, total, cogs } = computeOrderTotals(
        itemsData,
        discount,
        Number(business.taxRate),
      );

      const [{ next: orderNoRaw }] = await tx.$queryRaw<{ next: bigint }[]>`
        SELECT COALESCE(MAX(order_no), 0) + 1 AS next FROM orders WHERE business_id = ${businessId}
      `;
      // MySQL migration: MAX()+arithmetic over an Int column comes back as a JS `bigint`
      // (mysql2/Prisma type it BIGINT), not `number` — Prisma's `Int` column write rejects a bigint.
      const orderNo = Number(orderNoRaw);

      const quotation = await tx.order.create({
        data: {
          businessId,
          orderNo,
          customerId,
          orderType: 'quotation',
          status: OrderStatus.pending,
          isQuotation: true,
          subtotal,
          tax,
          discount,
          total,
          cogs,
        },
      });

      await tx.orderItem.createMany({
        data: itemsData.map((item) => ({
          orderId: quotation.id,
          productId: item.productId,
          name: item.name,
          price: item.price,
          cost: item.cost,
          qty: item.qty,
        })),
      });

      return quotation;
    });
  }

  /** Converts a quotation into a real (prefilled, still-pending) order — cashier finalizes payment separately. */
  async convert(businessId: string, quotationId: string) {
    return this.tenantPrisma.client.$transaction(async (tx) => {
      const quotation = await tx.order.findUnique({
        where: { id: quotationId },
        include: { items: true },
      });
      if (!quotation || !quotation.isQuotation) {
        throw new NotFoundException('Quotation not found');
      }

      const [{ next: orderNoRaw }] = await tx.$queryRaw<{ next: bigint }[]>`
        SELECT COALESCE(MAX(order_no), 0) + 1 AS next FROM orders WHERE business_id = ${businessId}
      `;
      // MySQL migration: MAX()+arithmetic over an Int column comes back as a JS `bigint`
      // (mysql2/Prisma type it BIGINT), not `number` — Prisma's `Int` column write rejects a bigint.
      const orderNo = Number(orderNoRaw);

      const order = await tx.order.create({
        data: {
          businessId,
          orderNo,
          customerId: quotation.customerId,
          orderType: 'counter',
          status: OrderStatus.pending,
          isQuotation: false,
          subtotal: quotation.subtotal,
          tax: quotation.tax,
          discount: quotation.discount,
          total: quotation.total,
          cogs: quotation.cogs,
        },
      });

      await tx.orderItem.createMany({
        data: quotation.items.map((item) => ({
          orderId: order.id,
          productId: item.productId,
          name: item.name,
          price: item.price,
          cost: item.cost,
          qty: item.qty,
        })),
      });

      return order;
    });
  }
}
