import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { startOfDayInZone } from '../../delivery/delivery-time.util';
import {
  ECOMMERCE_PROVIDERS,
  SOURCE_OF_TRUTH_DEFAULT,
  isSourceOfTruth,
} from '../ecommerce/ecommerce.constants';
import { IntegrationStatus, OrderStatus, OrderType } from '@prisma/client';

const DAY_MS = 86_400_000;

export interface ChannelBar {
  label: string;
  weekStart: string;
  inStore: number;
  online: number;
}

/**
 * E-commerce tab — connection settings, real order/stock counts and the conflict queue. "Orders by
 * channel" is a real count of completed orders grouped by `orderType`; "products reconciled" is
 * what the last real sync wrote into its `IntegrationSyncLog.details`.
 */
@Injectable()
export class HubEcommerceService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async overview(businessId: string) {
    const db = this.tenantPrisma.client;
    const now = new Date();
    const b = await db.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    const todayStart = startOfDayInZone(b?.timezone ?? 'UTC', now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weeksFrom = new Date(todayStart.getTime() - 7 * 7 * DAY_MS);

    const integrations = await db.integration.findMany({
      where: {
        provider: { in: ECOMMERCE_PROVIDERS },
        status: { not: IntegrationStatus.not_connected },
      },
      orderBy: { provider: 'asc' },
    });

    const connections = await Promise.all(
      integrations.map(async (i) => {
        const [lastOk, lastAttempt, pending] = await Promise.all([
          db.integrationSyncLog.findFirst({
            where: { businessId, provider: i.provider, success: true },
            orderBy: { createdAt: 'desc' },
          }),
          db.integrationSyncLog.findFirst({
            where: { businessId, provider: i.provider },
            orderBy: { createdAt: 'desc' },
          }),
          db.ecommerceSyncConflict.count({
            where: { businessId, provider: i.provider, status: 'pending' },
          }),
        ]);
        const raw = (i.meta as Record<string, unknown> | null)?.sourceOfTruth;
        const details = (lastOk?.details ?? null) as {
          productsReconciled?: number;
        } | null;
        return {
          provider: i.provider,
          status: i.status,
          paused: !!i.pausedAt,
          sourceOfTruth: isSourceOfTruth(raw) ? raw : SOURCE_OF_TRUTH_DEFAULT,
          lastSyncAt:
            lastOk?.createdAt.toISOString() ??
            i.lastSyncAt?.toISOString() ??
            null,
          lastAttemptOk: lastAttempt?.success ?? null,
          productsReconciled: details?.productsReconciled ?? null,
          pendingConflicts: pending,
        };
      }),
    );

    const [ordersMonth, ordersTotal, weekOrders] = await Promise.all([
      db.order.count({
        where: {
          businessId,
          externalProvider: { in: ECOMMERCE_PROVIDERS },
          createdAt: { gte: monthStart },
        },
      }),
      db.order.count({
        where: { businessId, externalProvider: { in: ECOMMERCE_PROVIDERS } },
      }),
      db.order.findMany({
        where: {
          businessId,
          status: OrderStatus.completed,
          createdAt: { gte: weeksFrom },
          orderType: { not: OrderType.quotation },
        },
        select: { createdAt: true, orderType: true },
      }),
    ]);

    const bars: ChannelBar[] = [];
    for (let w = 7; w >= 0; w--) {
      const start = new Date(todayStart.getTime() - (w * 7 + 6) * DAY_MS);
      bars.push({
        label: `W${8 - w}`,
        weekStart: start.toISOString(),
        inStore: 0,
        online: 0,
      });
    }
    for (const o of weekOrders) {
      const idx = bars.findIndex((bar, i) => {
        const start = new Date(bar.weekStart).getTime();
        const end =
          i === bars.length - 1
            ? Infinity
            : new Date(bars[i + 1].weekStart).getTime();
        return o.createdAt.getTime() >= start && o.createdAt.getTime() < end;
      });
      if (idx < 0) continue;
      if (o.orderType === OrderType.online) bars[idx].online += 1;
      else bars[idx].inStore += 1;
    }

    return {
      connected: connections.length > 0,
      connections,
      kpis: {
        productsReconciled: connections.reduce(
          (n, c) => n + (c.productsReconciled ?? 0),
          0,
        ),
        productsKnown: connections.some((c) => c.productsReconciled !== null),
        ordersImportedMonth: ordersMonth,
        ordersImportedTotal: ordersTotal,
        pendingConflicts: connections.reduce(
          (n, c) => n + c.pendingConflicts,
          0,
        ),
        lastSyncAt:
          connections
            .map((c) => c.lastSyncAt)
            .filter((d): d is string => !!d)
            .sort()
            .reverse()[0] ?? null,
      },
      channelBars: bars,
    };
  }

  /** Imported orders and stock conflicts, newest first — the "Product and order sync" table. */
  async items(businessId: string) {
    const db = this.tenantPrisma.client;
    const [orders, conflicts] = await Promise.all([
      db.order.findMany({
        where: { businessId, externalProvider: { in: ECOMMERCE_PROVIDERS } },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          orderNo: true,
          externalId: true,
          externalProvider: true,
          total: true,
          createdAt: true,
        },
      }),
      db.ecommerceSyncConflict.findMany({
        where: { businessId, status: { in: ['pending', 'resolved'] } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);
    return {
      orders: orders.map((o) => ({
        id: o.id,
        orderNo: o.orderNo,
        storeRef: o.externalId,
        provider: o.externalProvider,
        total: Number(o.total),
        at: o.createdAt.toISOString(),
      })),
      conflicts: conflicts.map((c) => ({
        id: c.id,
        provider: c.provider,
        sku: c.sku,
        productName: c.productName,
        localQty: c.localQty,
        remoteQty: c.remoteQty,
        localUpdatedAt: c.localUpdatedAt?.toISOString() ?? null,
        remoteUpdatedAt: c.remoteUpdatedAt?.toISOString() ?? null,
        status: c.status,
        resolution: c.resolution,
        resolvedQty: c.resolvedQty,
        resolvedAt: c.resolvedAt?.toISOString() ?? null,
        detectedAt: c.createdAt.toISOString(),
      })),
    };
  }
}
