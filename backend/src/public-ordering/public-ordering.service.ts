import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { computeOrderTotals } from '../orders/order-totals.util';
import { ORDER_ERROR_CODES } from '../orders/orders.constants';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { OrderStatus } from '../../generated/prisma';

/**
 * Public online-ordering / dine-in endpoints (BE-029). No auth — the
 * business is resolved by its public slug, so every query here scopes
 * explicitly by businessId (there's no JWT to bind CLS tenancy from).
 */
@Injectable()
export class PublicOrderingService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveBusiness(slug: string) {
    const business = await this.prisma.business.findUnique({ where: { slug } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  async getMenu(slug: string) {
    const business = await this.resolveBusiness(slug);
    const products = await this.prisma.product.findMany({
      where: { businessId: business.id, active: true },
      orderBy: { name: 'asc' },
    });

    return {
      business: {
        name: business.name,
        currency: business.currency,
        locale: business.locale,
        branding: business.branding,
      },
      products,
    };
  }

  async createOrder(slug: string, dto: CreatePublicOrderDto) {
    const business = await this.resolveBusiness(slug);

    return this.prisma.$transaction(async (tx) => {
      let customerId: string | undefined;
      if (dto.customerPhone) {
        const customer = await tx.customer.upsert({
          where: {
            businessId_phone: {
              businessId: business.id,
              phone: dto.customerPhone,
            },
          },
          create: {
            businessId: business.id,
            phone: dto.customerPhone,
            name: dto.customerName ?? dto.customerPhone,
          },
          update: {},
        });
        customerId = customer.id;
      }

      const productIds = [...new Set(dto.items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, businessId: business.id },
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
          price: Number(product.sellingPrice),
          cost: Number(product.costPrice),
          qty: item.qty,
        };
      });

      const { subtotal, tax, total, cogs } = computeOrderTotals(
        itemsData,
        0,
        Number(business.taxRate),
      );

      const [{ next: orderNoRaw }] = await tx.$queryRaw<{ next: bigint }[]>`
        SELECT COALESCE(MAX(order_no), 0) + 1 AS next FROM orders WHERE business_id = ${business.id}
      `;
      // MySQL migration: MAX()+arithmetic over an Int column comes back as a JS `bigint`
      // (mysql2/Prisma type it BIGINT), not `number` — Prisma's `Int` column write rejects a bigint.
      const orderNo = Number(orderNoRaw);

      const order = await tx.order.create({
        data: {
          businessId: business.id,
          orderNo,
          customerId,
          orderType: dto.orderType ?? 'online',
          tableNo: dto.tableNo,
          status: OrderStatus.pending,
          subtotal,
          tax,
          discount: 0,
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

      return order;
    });
  }
}
