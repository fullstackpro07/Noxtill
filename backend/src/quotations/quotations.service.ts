import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  computeOrderTotals,
  resolveTaxRatePercent,
} from '../orders/order-totals.util';
import { ORDER_ERROR_CODES } from '../orders/orders.constants';
import { InvoiceService } from '../orders/invoice.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { resolvePolicies } from '../common/policies/policies.service';
import { OrderStatus, Prisma, QuotationStatus } from '@prisma/client';

/** A quotation's real, user-facing status: `quotationStatus` plus a read-time "expired" check
 * against `quotationValidUntil` — expiry is never written to the row by a background job, it's
 * just always true once the date has passed, so this is the single place that has to know that. */
export function effectiveQuotationStatus(quotation: {
  quotationStatus: QuotationStatus | null;
  quotationValidUntil: Date | null;
}): QuotationStatus {
  const status = quotation.quotationStatus ?? QuotationStatus.draft;
  if (
    status === QuotationStatus.sent &&
    quotation.quotationValidUntil &&
    quotation.quotationValidUntil.getTime() < Date.now()
  ) {
    return QuotationStatus.expired;
  }
  return status;
}

/**
 * Narrow shape of the transaction client `buildQuotationData` actually uses — the tenant-scoped
 * extended client's real `$transaction` callback type doesn't structurally match the plain
 * `Prisma.TransactionClient`, so this mirrors the same hand-written-subset-interface pattern
 * already used by `OrdersService`'s `CustomerUpsertTxClient`.
 */
interface QuotationBuildTxClient {
  customer: {
    upsert(args: {
      where: { businessId_phone: { businessId: string; phone: string } };
      create: { businessId: string; phone: string; name: string };
      update: Record<string, never>;
    }): Promise<{ id: string }>;
  };
  business: {
    findUniqueOrThrow(args: {
      where: { id: string };
    }): Promise<{ taxRate: Prisma.Decimal | number; policies?: Prisma.JsonValue }>;
  };
  product: {
    findMany(args: {
      where: { id: { in: string[] } };
    }): Promise<
      {
        id: string;
        name: string;
        sellingPrice: Prisma.Decimal;
        costPrice: Prisma.Decimal;
        category: string | null;
      }[]
    >;
  };
  taxRule: {
    findMany(args: {
      where: { businessId: string };
    }): Promise<{ category: string | null; rate: Prisma.Decimal; active: boolean }[]>;
  };
}

/**
 * Quotations (BE-028): same Order/OrderItem tables as sales (isQuotation=true,
 * no payment/stock/customer-stats effects), so `POST /orders/:id/invoice`
 * (BE-027) already covers "Send PDF" for a quotation with no extra code.
 *
 * Orders module redesign: quotations now carry their own real lifecycle
 * (`quotationStatus`/`quotationValidUntil`/`quotationSentAt`/`declineReason`), independent of the
 * fulfilment `status` enum, so the design's status column and KPIs are backed by real data.
 */
@Injectable()
export class QuotationsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly invoiceService: InvoiceService,
  ) {}

  async findAll() {
    const rows = await this.tenantPrisma.client.order.findMany({
      where: { isQuotation: true },
      orderBy: { createdAt: 'desc' },
      include: { items: true, customer: true },
    });
    return rows.map((row) => ({
      ...row,
      effectiveStatus: effectiveQuotationStatus(row),
    }));
  }

  private async buildQuotationData(
    businessId: string,
    dto: Pick<
      CreateQuotationDto,
      'customerId' | 'customerPhone' | 'customerName' | 'items' | 'discount'
    >,
    tx: QuotationBuildTxClient,
  ) {
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
    const taxRules = await tx.taxRule.findMany({ where: { businessId } });

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
        taxRatePercent: resolveTaxRatePercent(
          taxRules.map((r) => ({ ...r, rate: Number(r.rate) })),
          product.category,
          Number(business.taxRate),
        ),
      };
    });

    const discount = dto.discount ?? 0;
    const taxInclusive = resolvePolicies(business).bool('sales.pricesIncludeTax');
    const totals = computeOrderTotals(itemsData, discount, Number(business.taxRate), taxInclusive);

    return { customerId, itemsData, discount, totals, taxInclusive };
  }

  async create(businessId: string, dto: CreateQuotationDto) {
    return this.tenantPrisma.client.$transaction(async (tx) => {
      const { customerId, itemsData, discount, totals, taxInclusive } =
        await this.buildQuotationData(businessId, dto, tx);

      const [{ next: orderNoRaw }] = await tx.$queryRaw<{ next: bigint }[]>`
        SELECT COALESCE(MAX(order_no), 0) + 1 AS next FROM orders WHERE business_id = ${businessId}
      `;
      const orderNo = Number(orderNoRaw);

      const quotation = await tx.order.create({
        data: {
          businessId,
          orderNo,
          customerId,
          orderType: 'quotation',
          status: OrderStatus.pending,
          isQuotation: true,
          quotationStatus: QuotationStatus.draft,
          quotationValidUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          quotationTerms: dto.terms,
          subtotal: totals.subtotal,
          tax: totals.tax,
          discount,
          total: totals.total,
          taxInclusive,
          cogs: totals.cogs,
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
          taxRatePercent: item.taxRatePercent,
        })),
      });

      return quotation;
    });
  }

  /** "Send PDF" — marks the quotation sent and actually emails the real invoice/quote PDF through
   * the existing invoice generator, the same one Sales History and Invoices use. */
  async send(businessId: string, id: string) {
    const quotation = await this.tenantPrisma.client.order.findUnique({
      where: { id },
    });
    if (!quotation || !quotation.isQuotation) {
      throw new NotFoundException('Quotation not found');
    }
    await this.tenantPrisma.client.order.update({
      where: { id },
      data: { quotationStatus: QuotationStatus.sent, quotationSentAt: new Date() },
    });
    return this.invoiceService.generate(businessId, id, true);
  }

  async decline(id: string, reason?: string) {
    const quotation = await this.tenantPrisma.client.order.findUnique({
      where: { id },
    });
    if (!quotation || !quotation.isQuotation) {
      throw new NotFoundException('Quotation not found');
    }
    return this.tenantPrisma.client.order.update({
      where: { id },
      data: { quotationStatus: QuotationStatus.declined, declineReason: reason },
    });
  }

  /** Clones an existing quotation into a fresh draft — same customer/items/discount, no
   * validity date or terms carried over (those are specific to the original proposal). */
  async duplicate(businessId: string, id: string) {
    const source = await this.tenantPrisma.client.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!source || !source.isQuotation) {
      throw new NotFoundException('Quotation not found');
    }
    return this.create(businessId, {
      customerId: source.customerId ?? undefined,
      discount: Number(source.discount),
      items: source.items
        .filter((item) => item.productId)
        .map((item) => ({
          productId: item.productId as string,
          qty: item.qty,
          priceOverride: Number(item.price),
        })),
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
          taxInclusive: quotation.taxInclusive,
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

      await tx.order.update({
        where: { id: quotation.id },
        data: { quotationStatus: QuotationStatus.accepted },
      });

      return tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: {
          items: true,
          payments: true,
          creditEntries: true,
          customer: true,
        },
      });
    });
  }

  /** KPI tiles + the conversion-trend chart on the Quotations screen — all real, derived from
   * `quotationStatus`/`quotationSentAt`/`quotationValidUntil` and `updatedAt` (the closest real
   * timestamp to "when this was accepted", since there's no dedicated `quotationAcceptedAt`). */
  async summary() {
    const all = await this.tenantPrisma.client.order.findMany({
      where: { isQuotation: true },
      select: {
        total: true,
        quotationStatus: true,
        quotationValidUntil: true,
        quotationSentAt: true,
        updatedAt: true,
      },
    });
    const withStatus = all.map((q) => ({
      ...q,
      effective: effectiveQuotationStatus(q),
    }));

    const open = withStatus.filter(
      (q) => q.effective === QuotationStatus.draft || q.effective === QuotationStatus.sent,
    );
    const valueOpen = open.reduce((sum, q) => sum + Number(q.total), 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const acceptedThisMonth = withStatus.filter(
      (q) => q.effective === QuotationStatus.accepted && q.updatedAt >= startOfMonth,
    ).length;

    const everSent = withStatus.filter((q) => q.quotationSentAt != null);
    const acceptedEver = everSent.filter(
      (q) => q.effective === QuotationStatus.accepted,
    ).length;
    const conversionRate =
      everSent.length > 0 ? (acceptedEver / everSent.length) * 100 : 0;

    // Real month-by-month sent/accepted counts for the last 6 months, for the trend chart.
    const months: { key: string; sent: number; accepted: number }[] = [];
    const cursor = new Date();
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
      months.push({ key: d.toISOString().slice(0, 7), sent: 0, accepted: 0 });
    }
    const monthIndex = new Map(months.map((m, i) => [m.key, i]));
    for (const q of withStatus) {
      if (q.quotationSentAt) {
        const key = q.quotationSentAt.toISOString().slice(0, 7);
        const idx = monthIndex.get(key);
        if (idx != null) months[idx].sent += 1;
      }
      if (q.effective === QuotationStatus.accepted) {
        const key = q.updatedAt.toISOString().slice(0, 7);
        const idx = monthIndex.get(key);
        if (idx != null) months[idx].accepted += 1;
      }
    }
    const trend = months.map((m) => ({
      month: m.key,
      rate: m.sent > 0 ? Math.round((m.accepted / m.sent) * 1000) / 10 : 0,
    }));

    return {
      open: open.length,
      valueOpen: Math.round(valueOpen * 100) / 100,
      acceptedThisMonth,
      conversionRate: Math.round(conversionRate * 10) / 10,
      trend,
    };
  }
}
