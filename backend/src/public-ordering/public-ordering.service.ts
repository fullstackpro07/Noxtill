import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  computeOrderTotals,
  resolveTaxRatePercent,
} from '../orders/order-totals.util';
import { ORDER_ERROR_CODES } from '../orders/orders.constants';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { OrderStatus } from '@prisma/client';
import { resolvePolicies } from '../common/policies/policies.service';
import { randomBytes } from 'crypto';
import { computeDeliveryPricing } from '../delivery/delivery-pricing.util';
import { DELIVERY_ERROR_CODES } from '../delivery/delivery.constants';

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

    // Zone rules the owner switched on: the storefront lists the zones a customer can pick, and
    // shows each fee only when "fee shown before checkout" is on.
    const settings = await this.prisma.deliverySettings.findUnique({
      where: { businessId: business.id },
    });
    const zones =
      settings?.enforceZoneCoverage ||
      settings?.showFeeBeforeCheckout ||
      settings?.pausedZonesBlockOrders
        ? await this.prisma.deliveryZone.findMany({
            where: { businessId: business.id, active: true },
            orderBy: { name: 'asc' },
          })
        : [];

    return {
      deliveryZones: zones.map((z) => ({
        id: z.id,
        name: z.name,
        fee: settings?.showFeeBeforeCheckout
          ? {
              chargeType: z.chargeType,
              flatAmount: z.flatAmount ? Number(z.flatAmount) : null,
              perKmAmount: z.perKmAmount ? Number(z.perKmAmount) : null,
              freeAboveOrderValue: z.freeAboveOrderValue
                ? Number(z.freeAboveOrderValue)
                : null,
            }
          : null,
      })),
      business: {
        name: business.name,
        currency: business.currency,
        locale: business.locale,
        branding: business.branding,
      },
      // Cost is the business's own margin — a public storefront has no use for it.
      products: products.map(({ costPrice: _cost, ...rest }) => rest),
    };
  }

  async createOrder(slug: string, dto: CreatePublicOrderDto) {
    const business = await this.resolveBusiness(slug);

    // Delivery orders: enforce the owner's zone rules before anything is created.
    const isDelivery = dto.orderType === 'delivery';
    const settings = isDelivery
      ? await this.prisma.deliverySettings.findUnique({
          where: { businessId: business.id },
        })
      : null;
    const zone =
      isDelivery && dto.deliveryZoneId
        ? await this.prisma.deliveryZone.findFirst({
            where: { id: dto.deliveryZoneId, businessId: business.id },
          })
        : null;
    if (isDelivery) {
      if (!dto.deliveryAddress?.trim()) {
        throw new AppException(
          DELIVERY_ERROR_CODES.ADDRESS_REQUIRED,
          'A delivery address is required for a delivery order',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (dto.deliveryZoneId && !zone) {
        throw new AppException(
          DELIVERY_ERROR_CODES.OUT_OF_ZONE,
          'That delivery zone does not exist',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (zone && !zone.active && settings?.pausedZonesBlockOrders) {
        throw new AppException(
          DELIVERY_ERROR_CODES.ZONE_PAUSED,
          `We are not taking delivery orders for ${zone.name} right now`,
          HttpStatus.CONFLICT,
        );
      }
      if (settings?.enforceZoneCoverage && (!zone || !zone.active)) {
        throw new AppException(
          DELIVERY_ERROR_CODES.OUT_OF_ZONE,
          'Delivery is only available inside our delivery zones — please choose one',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

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
      const taxRules = await tx.taxRule.findMany({
        where: { businessId: business.id },
      });

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
          taxRatePercent: resolveTaxRatePercent(
            taxRules.map((r) => ({ ...r, rate: Number(r.rate) })),
            product.category,
            Number(business.taxRate),
          ),
        };
      });

      const taxInclusive = resolvePolicies(business).bool(
        'sales.pricesIncludeTax',
      );
      const { subtotal, tax, total, cogs } = computeOrderTotals(
        itemsData,
        0,
        Number(business.taxRate),
        taxInclusive,
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
          taxInclusive,
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

      if (isDelivery) {
        const lat = dto.deliveryLat ?? null;
        const lng = dto.deliveryLng ?? null;
        const priced = computeDeliveryPricing({
          zone,
          settings: settings ?? {
            hubLat: null,
            hubLng: null,
            costPerKm: null,
            riderPayPerDelivery: null,
          },
          orderTotal: total,
          lat,
          lng,
        });
        await tx.delivery.create({
          data: {
            businessId: business.id,
            orderId: order.id,
            addressLine: dto.deliveryAddress!.trim(),
            lat,
            lng,
            zoneId: zone?.id,
            deliveryNote: dto.deliveryNote?.trim() || null,
            deliveryFee: priced.fee,
            deliveryCost: priced.cost,
            distanceKm: priced.distanceKm,
            trackingToken: randomBytes(16).toString('hex'),
          },
        });
        await tx.activityEvent.create({
          data: {
            businessId: business.id,
            type: 'delivery',
            description: `New online delivery order #${orderNo} — waiting for a rider`,
            entityType: 'Delivery',
          },
        });
      }

      return order;
    });
  }
}
