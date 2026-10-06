import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  computeOrderTotals,
  resolveTaxRatePercent,
} from '../orders/order-totals.util';
import { ORDER_ERROR_CODES } from '../orders/orders.constants';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { Order, OrderStatus, Prisma, ProductKind } from '@prisma/client';
import { resolvePolicies } from '../common/policies/policies.service';
import { createHash, randomBytes } from 'crypto';
import { computeDeliveryPricing } from '../delivery/delivery-pricing.util';
import { DELIVERY_ERROR_CODES } from '../delivery/delivery.constants';
import { ActivityService } from '../activity/activity.service';
import { readStorefront } from '../website/website-content.util';

/**
 * Public online-ordering / dine-in endpoints (BE-029). No auth — the
 * business is resolved by its public slug, so every query here scopes
 * explicitly by businessId (there's no JWT to bind CLS tenancy from).
 */
@Injectable()
export class PublicOrderingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  private async resolveBusiness(slug: string) {
    const business = await this.prisma.business.findUnique({ where: { slug } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  async getMenu(slug: string) {
    const business = await this.resolveBusiness(slug);
    const allowNegativeStock = resolvePolicies(business).bool(
      'sales.allowNegativeStock',
    );
    const products = await this.prisma.product.findMany({
      where: { businessId: business.id, active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        category: true,
        sellingPrice: true,
        kind: true,
        stockQty: true,
      },
    });

    const [site, productSettings] = await Promise.all([
      this.prisma.websiteSite.findUnique({
        where: { businessId: business.id },
        select: { settings: true },
      }),
      this.prisma.websiteProductSetting.findMany({
        where: { businessId: business.id },
      }),
    ]);
    const storefront = readStorefront(site?.settings);
    const presentation = new Map(productSettings.map((s) => [s.productId, s]));

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
      checkout: {
        deliveryAvailable: Boolean(
          settings && (!settings.enforceZoneCoverage || zones.length > 0),
        ),
        deliveryRequiresZone: settings?.enforceZoneCoverage ?? false,
      },
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
        acceptedPaymentMethods: Array.isArray(business.acceptedPaymentMethods)
          ? business.acceptedPaymentMethods.filter(
              (method): method is string => typeof method === 'string',
            )
          : [],
        onlinePayment: {
          availability: 'not_configured' as const,
          detail:
            'Online payment processing is not connected. Orders submitted here are unpaid until the business confirms payment.',
        },
      },
      // Website & Commerce storefront presentation: hidden products are left out, the owner's
      // out-of-stock rule applies, and web-only wording replaces the display name only.
      storefront: {
        showPrices: storefront.showPrices,
        checkoutEnabled: storefront.checkoutEnabled,
      },
      // Return only fields the storefront needs; never expose cost, SKU, stock counts or internal thresholds.
      products: products
        .map((product) => ({
          product,
          setting: presentation.get(product.id),
          available:
            product.kind === ProductKind.service ||
            product.stockQty > 0 ||
            allowNegativeStock,
        }))
        .filter(
          ({ setting, available }) =>
            setting?.visible !== false &&
            (available || storefront.outOfStockBehavior === 'show_unavailable'),
        )
        .sort(
          (a, b) =>
            (b.setting?.sortPriority ?? 0) - (a.setting?.sortPriority ?? 0),
        )
        .map(({ product, setting, available }) => ({
          id: product.id,
          name: setting?.webTitle || product.name,
          category: product.category,
          sellingPrice: Number(product.sellingPrice),
          kind: product.kind,
          available,
          badge: setting?.badge ?? null,
          summary: setting?.webSummary ?? null,
        })),
    };
  }

  async createOrder(
    slug: string,
    dto: CreatePublicOrderDto,
    idempotencyKey?: string,
  ) {
    const business = await this.resolveBusiness(slug);
    const normalizedKey = idempotencyKey?.trim();
    if (
      !normalizedKey ||
      normalizedKey.length > 128 ||
      !/^[A-Za-z0-9._~:-]+$/.test(normalizedKey)
    ) {
      throw new AppException(
        'PUBLIC_ORDER_IDEMPOTENCY_KEY_REQUIRED',
        'A valid Idempotency-Key header is required to submit an order.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const idempotencyKeyHash = createHash('sha256')
      .update(normalizedKey)
      .digest('hex');
    const requestFingerprint = {
      items: dto.items.map((item) => ({
        productId: item.productId,
        qty: item.qty,
      })),
      orderType: dto.orderType ?? 'online',
      tableNo: dto.tableNo ?? null,
      customerPhone: dto.customerPhone ?? null,
      customerName: dto.customerName ?? null,
      deliveryAddress: dto.deliveryAddress?.trim() ?? null,
      deliveryZoneId: dto.deliveryZoneId ?? null,
      deliveryLat: dto.deliveryLat ?? null,
      deliveryLng: dto.deliveryLng ?? null,
      deliveryNote: dto.deliveryNote?.trim() ?? null,
    };
    const requestHash = createHash('sha256')
      .update(JSON.stringify(requestFingerprint))
      .digest('hex');
    const priorResponse = await this.findIdempotentResponse(
      business.id,
      business.currency,
      idempotencyKeyHash,
      requestHash,
    );
    if (priorResponse) return priorResponse;

    // Website & Commerce storefront: honour the owner's checkout switch and hidden products.
    const [site, hiddenSettings] = await Promise.all([
      this.prisma.websiteSite.findUnique({
        where: { businessId: business.id },
        select: { settings: true },
      }),
      this.prisma.websiteProductSetting.findMany({
        where: {
          businessId: business.id,
          visible: false,
          productId: { in: dto.items.map((item) => item.productId) },
        },
        select: { productId: true },
      }),
    ]);
    if (
      !readStorefront(site?.settings).checkoutEnabled &&
      dto.orderType !== 'dine_in'
    ) {
      throw new AppException(
        'PUBLIC_ORDER_CHECKOUT_DISABLED',
        'Online ordering is turned off for this store right now.',
        HttpStatus.CONFLICT,
      );
    }
    if (hiddenSettings.length > 0) {
      throw new AppException(
        ORDER_ERROR_CODES.PRODUCT_NOT_FOUND,
        'One of these items is no longer available online.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.items.length === 0) {
      throw new AppException(
        'PUBLIC_ORDER_ITEMS_REQUIRED',
        'Add at least one item before placing an order.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const allowNegativeStock = resolvePolicies(business).bool(
      'sales.allowNegativeStock',
    );
    const requestedQuantityByProduct = new Map<string, number>();
    for (const item of dto.items) {
      requestedQuantityByProduct.set(
        item.productId,
        (requestedQuantityByProduct.get(item.productId) ?? 0) + item.qty,
      );
    }

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

    let deliveryId: string | undefined;
    let order: Order;
    try {
      order = await this.prisma.$transaction(async (tx) => {
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
          where: {
            id: { in: productIds },
            businessId: business.id,
            active: true,
          },
        });
        const productMap = new Map(products.map((p) => [p.id, p]));
        if (!allowNegativeStock) {
          for (const [productId, requestedQty] of requestedQuantityByProduct) {
            const product = productMap.get(productId);
            if (
              product?.kind === ProductKind.product &&
              product.stockQty < requestedQty
            ) {
              throw new AppException(
                ORDER_ERROR_CODES.INSUFFICIENT_STOCK,
                `Insufficient stock for "${product.name}" (have ${product.stockQty}, need ${requestedQty})`,
                HttpStatus.BAD_REQUEST,
              );
            }
          }
        }
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
            publicIdempotencyKeyHash: idempotencyKeyHash,
            publicIdempotencyRequestHash: requestHash,
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
          const delivery = await tx.delivery.create({
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
          deliveryId = delivery.id;
        }

        return order;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const racedResponse = await this.findIdempotentResponse(
          business.id,
          business.currency,
          idempotencyKeyHash,
          requestHash,
        );
        if (racedResponse) return racedResponse;
      }
      throw error;
    }

    // Record business events after the transaction commits so the shared activity pipeline can
    // trigger native workflows and outbound webhooks without firing for a rolled-back order.
    await this.activity.record(business.id, {
      type: 'sale',
      description: `Sale #${order.orderNo} — ${Number(order.total)}`,
      amount: Number(order.total),
      entityType: 'Order',
      entityId: order.id,
    });
    if (deliveryId) {
      await this.activity.record(business.id, {
        type: 'delivery',
        description: `New online delivery order #${order.orderNo} — waiting for a rider`,
        entityType: 'Delivery',
        entityId: deliveryId,
      });
    }

    return this.serializePublicOrder(order, business.currency);
  }

  private async findIdempotentResponse(
    businessId: string,
    currency: string,
    keyHash: string,
    requestHash: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: {
        businessId_publicIdempotencyKeyHash: {
          businessId,
          publicIdempotencyKeyHash: keyHash,
        },
      },
      select: {
        id: true,
        orderNo: true,
        total: true,
        publicIdempotencyRequestHash: true,
      },
    });
    if (!order) return null;
    if (order.publicIdempotencyRequestHash !== requestHash) {
      throw this.idempotencyConflict();
    }
    return this.serializePublicOrder(order, currency);
  }

  private serializePublicOrder(
    order: Pick<Order, 'id' | 'orderNo' | 'total'>,
    currency: string,
  ) {
    return {
      id: order.id,
      orderNo: order.orderNo,
      status: OrderStatus.pending,
      total: Number(order.total),
      currency,
      paymentStatus: 'unpaid' as const,
    };
  }

  private idempotencyConflict() {
    return new AppException(
      'PUBLIC_ORDER_IDEMPOTENCY_CONFLICT',
      'This Idempotency-Key was already used for a different order. Start a new checkout attempt.',
      HttpStatus.CONFLICT,
    );
  }
}
