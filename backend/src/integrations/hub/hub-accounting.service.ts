import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { startOfDayInZone } from '../../delivery/delivery-time.util';
import {
  ACCOUNTING_PROVIDERS,
  ACCOUNTING_SYNC_BATCH_SIZE,
} from '../accounting/accounting.constants';
import {
  IntegrationProvider,
  IntegrationStatus,
  OrderStatus,
} from '@prisma/client';

const DAY_MS = 86_400_000;

interface MappingRow {
  id: string;
  productCategory: string | null;
  externalAccountCode: string;
  externalTaxCode: string | null;
}

export interface AccountingBar {
  day: string;
  label: string;
  posted: number;
  failed: number;
}

export type AccountingTxStatus = 'posted' | 'failed' | 'pending';

export interface AccountingTransaction {
  id: string;
  date: string;
  orderNo: number;
  amount: number;
  externalId: string | null;
  status: AccountingTxStatus;
  error: string | null;
  attemptedAt: string | null;
  ledgerAccounts: string[];
  lines: Array<{
    name: string;
    qty: number;
    amount: number;
    category: string | null;
    account: string | null;
  }>;
}

/**
 * Accounting tab — everything is read from the orders Noxtill actually pushed as invoices
 * (`Order.accountingSyncedAt`, `accountingExternalId`, `accountingSyncError`), the real
 * `AccountingMapping` rows and `IntegrationSyncLog`. Only completed sales are ever pushed, so the
 * tab shows sales only — expenses, refunds and payments are not posted by this integration.
 */
@Injectable()
export class HubAccountingService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private async timezone(businessId: string) {
    const b = await this.tenantPrisma.client.business.findUnique({
      where: { id: businessId },
      select: { timezone: true, currency: true },
    });
    return { timezone: b?.timezone ?? 'UTC', currency: b?.currency ?? 'USD' };
  }

  private mappingRows(
    businessId: string,
    provider: IntegrationProvider,
  ): Promise<MappingRow[]> {
    return this.tenantPrisma.client.accountingMapping.findMany({
      where: { businessId, provider },
      orderBy: { productCategory: 'asc' },
    });
  }

  async overview(businessId: string) {
    const db = this.tenantPrisma.client;
    const { timezone, currency } = await this.timezone(businessId);
    const now = new Date();
    const todayStart = startOfDayInZone(timezone, now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const barsFrom = new Date(todayStart.getTime() - 13 * DAY_MS);

    const integrations = await db.integration.findMany({
      where: {
        provider: { in: ACCOUNTING_PROVIDERS },
        status: { not: IntegrationStatus.not_connected },
      },
    });
    const active =
      integrations.find((i) => i.status === IntegrationStatus.connected) ??
      integrations[0] ??
      null;
    const provider = active?.provider ?? null;

    const [
      postedMonth,
      postedTotal,
      pending,
      failed,
      latestLog,
      latestAttempt,
      postedRows,
      failedLogs,
      mappings,
      unsynced,
    ] = await Promise.all([
      db.order.count({
        where: { businessId, accountingSyncedAt: { gte: monthStart } },
      }),
      db.order.count({
        where: { businessId, accountingSyncedAt: { not: null } },
      }),
      db.order.count({
        where: {
          businessId,
          status: OrderStatus.completed,
          accountingSyncedAt: null,
          accountingSyncError: null,
        },
      }),
      db.order.count({
        where: {
          businessId,
          status: OrderStatus.completed,
          accountingSyncedAt: null,
          accountingSyncError: { not: null },
        },
      }),
      provider
        ? db.integrationSyncLog.findFirst({
            where: { businessId, provider, success: true },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve(null),
      provider
        ? db.integrationSyncLog.findFirst({
            where: { businessId, provider },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve(null),
      db.order.findMany({
        where: { businessId, accountingSyncedAt: { gte: barsFrom } },
        select: { accountingSyncedAt: true },
      }),
      provider
        ? db.integrationSyncLog.findMany({
            where: {
              businessId,
              provider,
              createdAt: { gte: barsFrom },
              recordsFailed: { gt: 0 },
            },
            select: { createdAt: true, recordsFailed: true },
          })
        : Promise.resolve([]),
      provider
        ? this.mappingRows(businessId, provider)
        : Promise.resolve([] as MappingRow[]),
      db.order.findMany({
        where: {
          businessId,
          status: OrderStatus.completed,
          accountingSyncedAt: null,
        },
        select: {
          id: true,
          items: { select: { product: { select: { category: true } } } },
        },
        take: 500,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const bars: AccountingBar[] = [];
    for (let i = 13; i >= 0; i--) {
      const dayStart = new Date(todayStart.getTime() - i * DAY_MS);
      const key = fmt.format(new Date(dayStart.getTime() + 12 * 3_600_000));
      bars.push({ day: key, label: key.slice(8), posted: 0, failed: 0 });
    }
    const byDay = new Map(bars.map((b) => [b.day, b]));
    for (const r of postedRows) {
      const bar = byDay.get(fmt.format(r.accountingSyncedAt!));
      if (bar) bar.posted += 1;
    }
    for (const l of failedLogs) {
      const bar = byDay.get(fmt.format(l.createdAt));
      if (bar) bar.failed += l.recordsFailed;
    }

    // Which product categories on not-yet-posted sales have no mapping and no default: those sales
    // are blocked, and posting to a guessed account is exactly what Noxtill refuses to do.
    const hasDefault = mappings.some((m) => m.productCategory === null);
    const mappedCategories = new Set(
      mappings
        .filter((m) => m.productCategory !== null)
        .map((m) => m.productCategory as string),
    );
    const blocked = new Map<string, Set<string>>();
    for (const order of unsynced) {
      for (const item of order.items) {
        const category = item.product?.category ?? '(none)';
        if (
          !hasDefault &&
          !(
            item.product?.category &&
            mappedCategories.has(item.product.category)
          )
        ) {
          if (!blocked.has(category)) blocked.set(category, new Set());
          blocked.get(category)!.add(order.id);
        }
      }
    }

    return {
      currency,
      provider,
      providerPaused: !!active?.pausedAt,
      connected: integrations.length > 0,
      kpis: {
        postedThisMonth: postedMonth,
        postedTotal,
        pending,
        failed,
        lastSyncAt:
          latestLog?.createdAt.toISOString() ??
          active?.lastSyncAt?.toISOString() ??
          null,
        lastAttemptAt: latestAttempt?.createdAt.toISOString() ?? null,
        lastAttemptOk: latestAttempt?.success ?? null,
        connectedSince: active?.connectedAt?.toISOString() ?? null,
      },
      bars,
      mapping: {
        hasDefault,
        rows: mappings.map((m) => ({
          id: m.id,
          category: m.productCategory,
          accountCode: m.externalAccountCode,
          taxCode: m.externalTaxCode,
        })),
        blocked: [...blocked.entries()].map(([category, ids]) => ({
          category,
          orders: ids.size,
        })),
      },
      settings: [
        {
          label: 'Sync trigger',
          detail: 'When posts are sent',
          value: 'On demand',
        },
        {
          label: 'Post as',
          detail: 'What is created in the ledger',
          value: 'Invoices',
        },
        {
          label: 'Retry failed',
          detail: 'A failed post is retried on every sync',
          value: 'Every sync',
        },
        {
          label: 'On unmapped account',
          detail: 'Block rather than substitute',
          value: 'Block',
        },
      ],
      batchSize: ACCOUNTING_SYNC_BATCH_SIZE,
    };
  }

  async transactions(
    businessId: string,
    status?: AccountingTxStatus,
    take = 50,
  ): Promise<AccountingTransaction[]> {
    const db = this.tenantPrisma.client;
    const provider = (
      await db.integration.findFirst({
        where: {
          provider: { in: ACCOUNTING_PROVIDERS },
          status: IntegrationStatus.connected,
        },
      })
    )?.provider;
    const mappings = provider
      ? await db.accountingMapping.findMany({ where: { businessId, provider } })
      : [];
    const byCategory = new Map(
      mappings
        .filter((m) => m.productCategory !== null)
        .map((m) => [m.productCategory as string, m.externalAccountCode]),
    );
    const fallback =
      mappings.find((m) => m.productCategory === null)?.externalAccountCode ??
      null;

    const orders = await db.order.findMany({
      where: {
        businessId,
        status: OrderStatus.completed,
        ...(status === 'posted' ? { accountingSyncedAt: { not: null } } : {}),
        ...(status === 'failed'
          ? { accountingSyncedAt: null, accountingSyncError: { not: null } }
          : {}),
        ...(status === 'pending'
          ? { accountingSyncedAt: null, accountingSyncError: null }
          : {}),
      },
      include: {
        items: { include: { product: { select: { category: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
    });

    return orders.map((o) => {
      const lines = o.items.map((i) => {
        const category = i.product?.category ?? null;
        return {
          name: i.name,
          qty: i.qty,
          amount: Number(i.price) * i.qty,
          category,
          account: (category && byCategory.get(category)) || fallback,
        };
      });
      return {
        id: o.id,
        date: o.createdAt.toISOString(),
        orderNo: o.orderNo,
        amount: Number(o.total),
        externalId: o.accountingExternalId,
        status: o.accountingSyncedAt
          ? 'posted'
          : o.accountingSyncError
            ? 'failed'
            : 'pending',
        error: o.accountingSyncError,
        attemptedAt: o.accountingSyncAttemptedAt?.toISOString() ?? null,
        ledgerAccounts: [
          ...new Set(
            lines.map((l) => l.account).filter((a): a is string => !!a),
          ),
        ],
        lines,
      } satisfies AccountingTransaction;
    });
  }
}
