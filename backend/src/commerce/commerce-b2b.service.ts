import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CommerceB2bAccountStatus,
  CommerceB2bPriceListStatus,
  OrderStatus,
  Prisma,
  ProductKind,
  QuotationStatus,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  COMMERCE_B2B_ERROR_CODES as CODES,
  COMMERCE_B2B_MIN_ORDERS_FOR_CADENCE,
} from './commerce.constants';
import type {
  CommerceB2bAccountFieldsDto,
  CommerceB2bPriceListItemDto,
  CommerceB2bTierFieldsDto,
  CreateCommerceB2bAccountDto,
  CreateCommerceB2bPriceListDto,
  CreateCommerceB2bTierDto,
  PreviewCommerceB2bQuoteDto,
  UpdateCommerceB2bPriceListDto,
} from './dto/commerce-b2b.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

function num(value: Prisma.Decimal | number | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

export type ReorderSignal =
  | { status: 'insufficient_history'; orders: number }
  | {
      status: 'due' | 'not_due';
      averageGapDays: number;
      lastOrderAt: Date;
      nextExpectedAt: Date;
    };

/**
 * Estimates when an account usually reorders from the gaps between its past order dates. It is a
 * plain average shown as an estimate, never a promise; fewer than the minimum orders → no signal.
 */
export function reorderSignal(
  orderDates: Date[],
  now = new Date(),
): ReorderSignal {
  const dates = [...orderDates]
    .sort((a, b) => a.getTime() - b.getTime())
    .slice(-10);
  if (dates.length < COMMERCE_B2B_MIN_ORDERS_FOR_CADENCE) {
    return { status: 'insufficient_history', orders: dates.length };
  }
  let total = 0;
  for (let i = 1; i < dates.length; i += 1) {
    total += dates[i].getTime() - dates[i - 1].getTime();
  }
  const averageGapMs = total / (dates.length - 1);
  const lastOrderAt = dates[dates.length - 1];
  const nextExpectedAt = new Date(lastOrderAt.getTime() + averageGapMs);
  return {
    status: now.getTime() >= nextExpectedAt.getTime() ? 'due' : 'not_due',
    averageGapDays: Math.round((averageGapMs / DAY_MS) * 10) / 10,
    lastOrderAt,
    nextExpectedAt,
  };
}

/**
 * B2B & Wholesale (Autonomous Commerce screen 13). A wholesale layer over canonical records:
 * accounts wrap a CRM customer, price lists and tier discounts overlay (never overwrite) product
 * prices, credit limit/balance come from Customers/Credit (`v_credit_balances`), and quotes,
 * orders and invoices stay in Orders. Quote pricing here is a preview only.
 */
@Injectable()
export class CommerceB2bService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private audit(
    businessId: string,
    entityType: string,
    entityId: string,
    action: string,
    actorUserId: string,
    extra: { reason?: string | null; before?: unknown; after?: unknown } = {},
  ) {
    return this.tenantPrisma.client.commerceB2bAudit.create({
      data: {
        businessId,
        entityType,
        entityId,
        action,
        actorUserId,
        reason: extra.reason ?? null,
        before: (extra.before ?? undefined) as Prisma.InputJsonValue,
        after: (extra.after ?? undefined) as Prisma.InputJsonValue,
      },
    });
  }

  // ---- Tiers ---------------------------------------------------------------------------------

  async listTiers(businessId: string) {
    const tiers = await this.tenantPrisma.client.commerceB2bTier.findMany({
      where: { businessId },
      include: { _count: { select: { accounts: true } } },
      orderBy: { name: 'asc' },
    });
    return tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      defaultDiscountPct: Number(tier.defaultDiscountPct),
      minOrderValue: num(tier.minOrderValue),
      paymentTermsDays: tier.paymentTermsDays,
      accounts: tier._count.accounts,
    }));
  }

  private tierData(dto: CommerceB2bTierFieldsDto) {
    const data: Prisma.CommerceB2bTierUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.defaultDiscountPct !== undefined)
      data.defaultDiscountPct = dto.defaultDiscountPct;
    if (dto.minOrderValue !== undefined) data.minOrderValue = dto.minOrderValue;
    if (dto.paymentTermsDays !== undefined)
      data.paymentTermsDays = dto.paymentTermsDays;
    return data;
  }

  async createTier(
    businessId: string,
    actorUserId: string,
    dto: CreateCommerceB2bTierDto,
  ) {
    try {
      const tier = await this.tenantPrisma.client.commerceB2bTier.create({
        data: {
          ...(this.tierData(dto) as Prisma.CommerceB2bTierUncheckedCreateInput),
          businessId,
          name: dto.name.trim(),
        },
      });
      await this.audit(
        businessId,
        'tier',
        tier.id,
        'tier_created',
        actorUserId,
        {
          after: {
            name: tier.name,
            defaultDiscountPct: Number(tier.defaultDiscountPct),
          },
        },
      );
      return tier;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          CODES.NAME_TAKEN,
          'A tier with this name already exists.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async updateTier(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: CommerceB2bTierFieldsDto,
  ) {
    const before = await this.tenantPrisma.client.commerceB2bTier.findFirst({
      where: { id, businessId },
    });
    if (!before) {
      throw new AppException(
        CODES.TIER_NOT_FOUND,
        'Tier was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      const tier = await this.tenantPrisma.client.commerceB2bTier.update({
        where: { id, businessId },
        data: this.tierData(dto),
      });
      await this.audit(businessId, 'tier', id, 'tier_updated', actorUserId, {
        before: {
          name: before.name,
          defaultDiscountPct: Number(before.defaultDiscountPct),
        },
        after: {
          name: tier.name,
          defaultDiscountPct: Number(tier.defaultDiscountPct),
        },
      });
      return tier;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          CODES.NAME_TAKEN,
          'A tier with this name already exists.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  // ---- Price lists ---------------------------------------------------------------------------

  async listPriceLists(businessId: string) {
    const lists = await this.tenantPrisma.client.commerceB2bPriceList.findMany({
      where: { businessId },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, sellingPrice: true },
            },
          },
          orderBy: { product: { name: 'asc' } },
        },
        _count: { select: { accounts: true } },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    return lists.map((list) => ({
      id: list.id,
      name: list.name,
      status: list.status,
      notes: list.notes,
      accounts: list._count.accounts,
      items: list.items.map((item) => ({
        id: item.id,
        unitPrice: Number(item.unitPrice),
        minQty: item.minQty,
        product: {
          id: item.product.id,
          name: item.product.name,
          sku: item.product.sku,
          basePrice: Number(item.product.sellingPrice),
        },
      })),
    }));
  }

  private async assertProducts(businessId: string, productIds: string[]) {
    if (!productIds.length) return;
    const found = await this.tenantPrisma.client.product.count({
      where: {
        businessId,
        id: { in: [...new Set(productIds)] },
        kind: ProductKind.product,
      },
    });
    if (found !== new Set(productIds).size) {
      throw new AppException(
        CODES.PRODUCT_NOT_FOUND,
        'Every price list line must be a physical product from Products.',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async createPriceList(
    businessId: string,
    actorUserId: string,
    dto: CreateCommerceB2bPriceListDto,
  ) {
    const items = dto.items ?? [];
    if (new Set(items.map((item) => item.productId)).size !== items.length) {
      throw new AppException(
        CODES.INVALID_STATE,
        'List each product once in a price list.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertProducts(
      businessId,
      items.map((item) => item.productId),
    );
    try {
      const list = await this.tenantPrisma.client.commerceB2bPriceList.create({
        data: {
          businessId,
          name: dto.name.trim(),
          notes: dto.notes?.trim() || null,
          items: {
            create: items.map((item) => ({
              businessId,
              productId: item.productId,
              unitPrice: item.unitPrice,
              minQty: item.minQty ?? 1,
            })),
          },
        },
      });
      await this.audit(
        businessId,
        'price_list',
        list.id,
        'price_list_created',
        actorUserId,
        {
          after: { name: list.name, lines: items.length },
        },
      );
      return list;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          CODES.NAME_TAKEN,
          'A price list with this name already exists.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  private async findPriceList(businessId: string, id: string) {
    const list = await this.tenantPrisma.client.commerceB2bPriceList.findFirst({
      where: { id, businessId },
    });
    if (!list) {
      throw new AppException(
        CODES.PRICE_LIST_NOT_FOUND,
        'Price list was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return list;
  }

  async updatePriceList(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: UpdateCommerceB2bPriceListDto,
  ) {
    const before = await this.findPriceList(businessId, id);
    const updated = await this.tenantPrisma.client.commerceB2bPriceList.update({
      where: { id, businessId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    await this.audit(
      businessId,
      'price_list',
      id,
      'price_list_updated',
      actorUserId,
      {
        before: { name: before.name, status: before.status },
        after: { name: updated.name, status: updated.status },
      },
    );
    return updated;
  }

  async setPriceListItem(
    businessId: string,
    actorUserId: string,
    priceListId: string,
    dto: CommerceB2bPriceListItemDto,
  ) {
    await this.findPriceList(businessId, priceListId);
    await this.assertProducts(businessId, [dto.productId]);
    const item = await this.tenantPrisma.client.commerceB2bPriceListItem.upsert(
      {
        where: {
          priceListId_productId: { priceListId, productId: dto.productId },
        },
        create: {
          businessId,
          priceListId,
          productId: dto.productId,
          unitPrice: dto.unitPrice,
          minQty: dto.minQty ?? 1,
        },
        update: { unitPrice: dto.unitPrice, minQty: dto.minQty ?? 1 },
      },
    );
    await this.audit(
      businessId,
      'price_list',
      priceListId,
      'price_set',
      actorUserId,
      {
        after: {
          productId: dto.productId,
          unitPrice: dto.unitPrice,
          minQty: dto.minQty ?? 1,
        },
      },
    );
    return item;
  }

  async removePriceListItem(
    businessId: string,
    actorUserId: string,
    priceListId: string,
    productId: string,
  ) {
    await this.findPriceList(businessId, priceListId);
    const removed =
      await this.tenantPrisma.client.commerceB2bPriceListItem.deleteMany({
        where: { businessId, priceListId, productId },
      });
    if (removed.count) {
      await this.audit(
        businessId,
        'price_list',
        priceListId,
        'price_removed',
        actorUserId,
        {
          before: { productId },
        },
      );
    }
    return { removed: removed.count > 0 };
  }

  // ---- Accounts ------------------------------------------------------------------------------

  private async assertLinks(
    businessId: string,
    tierId: string | null | undefined,
    priceListId: string | null | undefined,
  ) {
    if (tierId) {
      const tier = await this.tenantPrisma.client.commerceB2bTier.findFirst({
        where: { id: tierId, businessId },
        select: { id: true },
      });
      if (!tier) {
        throw new AppException(
          CODES.TIER_NOT_FOUND,
          'Tier was not found.',
          HttpStatus.NOT_FOUND,
        );
      }
    }
    if (priceListId) {
      const list = await this.findPriceList(businessId, priceListId);
      if (list.status !== CommerceB2bPriceListStatus.active) {
        throw new AppException(
          CODES.INVALID_STATE,
          'Assign an active price list; archived lists are kept for history only.',
          HttpStatus.CONFLICT,
        );
      }
    }
  }

  private accountData(dto: CommerceB2bAccountFieldsDto) {
    const data: Prisma.CommerceB2bAccountUncheckedUpdateInput = {};
    if (dto.companyName !== undefined)
      data.companyName = dto.companyName.trim();
    if (dto.taxId !== undefined) data.taxId = dto.taxId?.trim() || null;
    if (dto.tierId !== undefined) data.tierId = dto.tierId || null;
    if (dto.priceListId !== undefined)
      data.priceListId = dto.priceListId || null;
    if (dto.paymentTermsDays !== undefined)
      data.paymentTermsDays = dto.paymentTermsDays;
    if (dto.minOrderValue !== undefined) data.minOrderValue = dto.minOrderValue;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    return data;
  }

  async createAccount(
    businessId: string,
    actorUserId: string,
    dto: CreateCommerceB2bAccountDto,
  ) {
    const customer = await this.tenantPrisma.client.customer.findFirst({
      where: { id: dto.customerId, businessId },
      select: { id: true },
    });
    if (!customer) {
      throw new AppException(
        CODES.CUSTOMER_NOT_FOUND,
        'Customer was not found in Customers (CRM).',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.assertLinks(businessId, dto.tierId, dto.priceListId);
    try {
      const account = await this.tenantPrisma.client.commerceB2bAccount.create({
        data: {
          ...(this.accountData(
            dto,
          ) as Prisma.CommerceB2bAccountUncheckedCreateInput),
          businessId,
          customerId: dto.customerId,
          companyName: dto.companyName.trim(),
        },
      });
      await this.audit(
        businessId,
        'account',
        account.id,
        'account_created',
        actorUserId,
        {
          after: {
            customerId: dto.customerId,
            companyName: account.companyName,
          },
        },
      );
      return account;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          CODES.ACCOUNT_EXISTS,
          'This customer already has a wholesale account.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  private async findAccount(businessId: string, id: string) {
    const account = await this.tenantPrisma.client.commerceB2bAccount.findFirst(
      {
        where: { id, businessId },
        include: {
          tier: true,
          priceList: { include: { items: true } },
          customer: { select: { id: true, name: true, creditLimit: true } },
        },
      },
    );
    if (!account) {
      throw new AppException(
        CODES.ACCOUNT_NOT_FOUND,
        'Wholesale account was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return account;
  }

  async updateAccount(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: CommerceB2bAccountFieldsDto,
  ) {
    const before = await this.findAccount(businessId, id);
    await this.assertLinks(businessId, dto.tierId, dto.priceListId);
    const updated = await this.tenantPrisma.client.commerceB2bAccount.update({
      where: { id, businessId },
      data: this.accountData(dto),
    });
    await this.audit(
      businessId,
      'account',
      id,
      'account_updated',
      actorUserId,
      {
        before: {
          tierId: before.tierId,
          priceListId: before.priceListId,
          paymentTermsDays: before.paymentTermsDays,
        },
        after: {
          tierId: updated.tierId,
          priceListId: updated.priceListId,
          paymentTermsDays: updated.paymentTermsDays,
        },
      },
    );
    return updated;
  }

  async setAccountStatus(
    businessId: string,
    actorUserId: string,
    id: string,
    status: CommerceB2bAccountStatus,
    reason?: string,
  ) {
    const before = await this.findAccount(businessId, id);
    if (before.status === status) return before;
    const updated = await this.tenantPrisma.client.commerceB2bAccount.update({
      where: { id, businessId },
      data: {
        status,
        suspendedReason:
          status === CommerceB2bAccountStatus.suspended
            ? (reason?.trim() ?? null)
            : null,
      },
    });
    await this.audit(
      businessId,
      'account',
      id,
      status === CommerceB2bAccountStatus.suspended
        ? 'account_suspended'
        : 'account_reactivated',
      actorUserId,
      { reason: reason?.trim() || null },
    );
    return updated;
  }

  /** Canonical outstanding credit balance per customer, from the same view Credit uses. */
  private async balances(businessId: string, customerIds: string[]) {
    if (!customerIds.length) return new Map<string, number>();
    const rows = await this.tenantPrisma.client.$queryRaw<
      { customer_id: string; balance: string | number }[]
    >`
      SELECT customer_id, balance FROM v_credit_balances
      WHERE business_id = ${businessId} AND customer_id IN (${Prisma.join(customerIds)})
    `;
    return new Map(rows.map((row) => [row.customer_id, Number(row.balance)]));
  }

  async listAccounts(businessId: string, now = new Date()) {
    const accounts = await this.tenantPrisma.client.commerceB2bAccount.findMany(
      {
        where: { businessId },
        include: {
          tier: {
            select: {
              id: true,
              name: true,
              defaultDiscountPct: true,
              paymentTermsDays: true,
              minOrderValue: true,
            },
          },
          priceList: { select: { id: true, name: true } },
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              creditLimit: true,
            },
          },
        },
        orderBy: { companyName: 'asc' },
      },
    );
    const customerIds = accounts.map((account) => account.customerId);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const [orders, quotes, balances] = await Promise.all([
      // `in: []` matches nothing, so these are safe with no accounts.
      this.tenantPrisma.client.order.findMany({
        where: {
          businessId,
          customerId: { in: customerIds },
          isQuotation: false,
          status: { not: OrderStatus.cancelled },
        },
        select: { customerId: true, total: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.tenantPrisma.client.order.findMany({
        where: {
          businessId,
          customerId: { in: customerIds },
          isQuotation: true,
          quotationStatus: {
            in: [QuotationStatus.draft, QuotationStatus.sent],
          },
        },
        select: { customerId: true },
      }),
      this.balances(businessId, customerIds),
    ]);
    return accounts.map((account) => {
      const own = orders.filter(
        (order) => order.customerId === account.customerId,
      );
      const ytd = own.filter((order) => order.createdAt >= yearStart);
      const creditLimit = num(account.customer.creditLimit);
      const balance = balances.get(account.customerId) ?? 0;
      return {
        id: account.id,
        companyName: account.companyName,
        taxId: account.taxId,
        status: account.status,
        suspendedReason: account.suspendedReason,
        notes: account.notes,
        customer: {
          id: account.customer.id,
          name: account.customer.name,
          phone: account.customer.phone,
          email: account.customer.email,
        },
        tier: account.tier
          ? {
              id: account.tier.id,
              name: account.tier.name,
              defaultDiscountPct: Number(account.tier.defaultDiscountPct),
            }
          : null,
        priceList: account.priceList,
        // Account overrides win over the tier's defaults.
        paymentTermsDays:
          account.paymentTermsDays ?? account.tier?.paymentTermsDays ?? null,
        minOrderValue:
          num(account.minOrderValue) ??
          num(account.tier?.minOrderValue) ??
          null,
        credit: {
          limit: creditLimit,
          balance,
          available:
            creditLimit === null ? null : round2(creditLimit - balance),
          overLimit: creditLimit !== null && balance > creditLimit,
        },
        ytdOrderValue: round2(
          ytd.reduce((sum, order) => sum + Number(order.total), 0),
        ),
        ytdOrders: ytd.length,
        lastOrderAt: own.length ? own[own.length - 1].createdAt : null,
        openQuotes: quotes.filter(
          (row) => row.customerId === account.customerId,
        ).length,
        reorder: reorderSignal(
          own.map((order) => order.createdAt),
          now,
        ),
      };
    });
  }

  async summary(businessId: string) {
    const accounts = await this.listAccounts(businessId);
    const active = accounts.filter(
      (account) => account.status === CommerceB2bAccountStatus.active,
    );
    return {
      activeAccounts: active.length,
      suspendedAccounts: accounts.length - active.length,
      ytdOrderValue: round2(
        accounts.reduce((sum, account) => sum + account.ytdOrderValue, 0),
      ),
      receivables: round2(
        accounts.reduce(
          (sum, account) => sum + Math.max(account.credit.balance, 0),
          0,
        ),
      ),
      overCreditLimit: accounts.filter((account) => account.credit.overLimit)
        .length,
      openQuotes: accounts.reduce(
        (sum, account) => sum + account.openQuotes,
        0,
      ),
      reordersDue: active.filter((account) => account.reorder.status === 'due')
        .length,
    };
  }

  /**
   * Prices a draft wholesale order for an account without creating anything: price-list line
   * when the quantity meets its minimum, otherwise the canonical price less the tier discount.
   * Also checks the account's minimum order value and available canonical credit.
   */
  async previewQuote(
    businessId: string,
    accountId: string,
    dto: PreviewCommerceB2bQuoteDto,
  ) {
    const account = await this.findAccount(businessId, accountId);
    const productIds = [...new Set(dto.lines.map((line) => line.productId))];
    const products = await this.tenantPrisma.client.product.findMany({
      where: { businessId, id: { in: productIds }, kind: ProductKind.product },
      select: { id: true, name: true, sellingPrice: true, active: true },
    });
    if (products.length !== productIds.length) {
      throw new AppException(
        CODES.PRODUCT_NOT_FOUND,
        'Every line must be a physical product from Products.',
        HttpStatus.NOT_FOUND,
      );
    }
    const listItems = new Map(
      (account.priceList?.status === CommerceB2bPriceListStatus.active
        ? account.priceList.items
        : []
      ).map((item) => [item.productId, item]),
    );
    const discountPct = account.tier
      ? Number(account.tier.defaultDiscountPct)
      : 0;
    const lines = dto.lines.map((line) => {
      const product = products.find((item) => item.id === line.productId)!;
      const basePrice = Number(product.sellingPrice);
      const listItem = listItems.get(line.productId);
      const usesList = !!listItem && line.qty >= listItem.minQty;
      const unitPrice = usesList
        ? Number(listItem.unitPrice)
        : round2(basePrice * (1 - discountPct / 100));
      return {
        productId: product.id,
        name: product.name,
        qty: line.qty,
        basePrice,
        unitPrice,
        source: usesList
          ? 'price_list'
          : discountPct > 0
            ? 'tier_discount'
            : 'base_price',
        note:
          listItem && !usesList
            ? `Price list needs at least ${listItem.minQty} units.`
            : !product.active
              ? 'Product is inactive in Products.'
              : null,
        lineTotal: round2(unitPrice * line.qty),
      };
    });
    const total = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    const minOrderValue =
      num(account.minOrderValue) ?? num(account.tier?.minOrderValue) ?? null;
    const balance =
      (await this.balances(businessId, [account.customerId])).get(
        account.customerId,
      ) ?? 0;
    const creditLimit = num(account.customer.creditLimit);
    const warnings: string[] = [];
    if (account.status === CommerceB2bAccountStatus.suspended)
      warnings.push('This account is suspended.');
    if (minOrderValue !== null && total < minOrderValue)
      warnings.push(
        `Below the account's minimum order value (${minOrderValue}).`,
      );
    if (creditLimit !== null && balance + total > creditLimit)
      warnings.push(
        'This order would take the customer over their credit limit in Credit.',
      );
    return {
      accountId,
      lines,
      total,
      minOrderValue,
      credit: {
        limit: creditLimit,
        balance,
        availableAfter:
          creditLimit === null ? null : round2(creditLimit - balance - total),
      },
      paymentTermsDays:
        account.paymentTermsDays ?? account.tier?.paymentTermsDays ?? null,
      warnings,
    };
  }
}
