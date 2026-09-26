import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { startOfDayInZone } from '../delivery/delivery-time.util';
import { ALL_CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { AUTOMATION_TRIGGERS } from '../integrations/automation/automation.constants';
import {
  API_KEY_FORBIDDEN_SCOPES,
  API_KEY_HOURLY_LIMIT,
} from './api-key.constants';
import { IntegrationProvider } from '@prisma/client';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** "integrations.manage" -> group "Integrations", action "Manage". */
function humanize(scope: string): { group: string; label: string } {
  const [group, ...rest] = scope.split('.');
  const title = (s: string) =>
    s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  return {
    group: title(group),
    label: `${title(group)} · ${rest.join(' ').replace(/_/g, ' ')}`,
  };
}

/**
 * Developer tab data. Requests are counted from `ApiKeyUsageHour` (written for every API-key
 * request), deliveries from `OutboundWebhookDelivery` — the same rows the delivery pipeline writes.
 */
@Injectable()
export class DeveloperOverviewService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** The scopes an API key may be granted — every capability except the destructive/admin ones. */
  scopes() {
    return ALL_CAPABILITIES.filter(
      (c) => !(API_KEY_FORBIDDEN_SCOPES as readonly string[]).includes(c),
    ).map((key) => ({ key, ...humanize(key) }));
  }

  async overview(businessId: string) {
    const db = this.tenantPrisma.client;
    const now = new Date();
    const biz = await db.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    const timezone = biz?.timezone ?? 'UTC';
    const todayStart = startOfDayInZone(timezone, now);
    const from14 = new Date(todayStart.getTime() - 13 * DAY_MS);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const hourStart = new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);

    const [
      keys,
      usage14,
      usageMonthByKey,
      thisHour,
      webhooks,
      deliveries14,
      deliveriesMonth,
      failedMonth,
    ] = await Promise.all([
      db.apiKey.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          lastUsedAt: true,
          revokedAt: true,
          createdAt: true,
        },
      }),
      db.apiKeyUsageHour.findMany({
        where: { businessId, bucketStart: { gte: from14 } },
        select: { bucketStart: true, count: true },
      }),
      db.apiKeyUsageHour.groupBy({
        by: ['apiKeyId'],
        where: { businessId, bucketStart: { gte: monthStart } },
        _sum: { count: true },
      }),
      db.apiKeyUsageHour.findMany({
        where: { businessId, bucketStart: hourStart },
        select: { apiKeyId: true, count: true },
      }),
      db.outboundWebhook.findMany({
        where: { businessId, provider: IntegrationProvider.developer },
        orderBy: { createdAt: 'desc' },
      }),
      db.outboundWebhookDelivery.findMany({
        where: {
          createdAt: { gte: from14 },
          webhook: { businessId, provider: IntegrationProvider.developer },
        },
        select: { createdAt: true, status: true },
      }),
      db.outboundWebhookDelivery.count({
        where: {
          createdAt: { gte: monthStart },
          webhook: { businessId, provider: IntegrationProvider.developer },
        },
      }),
      db.outboundWebhookDelivery.count({
        where: {
          createdAt: { gte: monthStart },
          status: 'failed',
          webhook: { businessId, provider: IntegrationProvider.developer },
        },
      }),
    ]);

    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const days: Array<{
      day: string;
      label: string;
      requests: number;
      ok: number;
      failed: number;
    }> = [];
    for (let i = 13; i >= 0; i--) {
      const key = fmt.format(
        new Date(todayStart.getTime() - i * DAY_MS + 12 * HOUR_MS),
      );
      days.push({
        day: key,
        label: key.slice(8),
        requests: 0,
        ok: 0,
        failed: 0,
      });
    }
    const byDay = new Map(days.map((d) => [d.day, d]));
    for (const u of usage14) {
      const d = byDay.get(fmt.format(u.bucketStart));
      if (d) d.requests += u.count;
    }
    for (const dl of deliveries14) {
      const d = byDay.get(fmt.format(dl.createdAt));
      if (!d) continue;
      if (dl.status === 'failed') d.failed += 1;
      else if (dl.status === 'success') d.ok += 1;
    }

    const requestsMonth = usageMonthByKey.reduce(
      (n, k) => n + (k._sum.count ?? 0),
      0,
    );
    const monthByKey = new Map(
      usageMonthByKey.map((k) => [k.apiKeyId, k._sum.count ?? 0]),
    );
    const busiestKeyHour = thisHour.reduce((m, r) => Math.max(m, r.count), 0);
    const activeKeys = keys.filter((k) => !k.revokedAt);

    const latest = await Promise.all(
      webhooks.map((w) =>
        db.outboundWebhookDelivery.findFirst({
          where: { webhookId: w.id },
          orderBy: { createdAt: 'desc' },
        }),
      ),
    );
    const label = new Map(
      AUTOMATION_TRIGGERS.map((t) => [t.key as string, t.label]),
    );

    const settled = deliveries14.filter(
      (d) => d.status === 'success' || d.status === 'failed',
    );
    const okCount = settled.filter((d) => d.status === 'success').length;

    return {
      hourlyLimit: API_KEY_HOURLY_LIMIT,
      kpis: {
        activeKeys: activeKeys.length,
        totalKeys: keys.length,
        requestsMonth,
        busiestKeyThisHour: busiestKeyHour,
        headroomPct: Math.max(
          0,
          Math.round((1 - busiestKeyHour / API_KEY_HOURLY_LIMIT) * 100),
        ),
        deliveriesMonth,
        failedDeliveriesMonth: failedMonth,
        failedPct: deliveriesMonth
          ? Math.round((failedMonth / deliveriesMonth) * 1000) / 10
          : 0,
        deliveredPct14d: settled.length
          ? Math.round((okCount / settled.length) * 1000) / 10
          : null,
      },
      days,
      keys: keys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.keyPrefix,
        scopes: k.scopes as string[],
        createdAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        revokedAt: k.revokedAt?.toISOString() ?? null,
        requestsMonth: monthByKey.get(k.id) ?? 0,
      })),
      webhooks: webhooks.map((w, i) => {
        const d = latest[i];
        return {
          id: w.id,
          triggerKey: w.triggerKey,
          event: label.get(w.triggerKey) ?? w.triggerKey,
          targetUrl: w.targetUrl,
          active: w.active,
          createdAt: w.createdAt.toISOString(),
          latest: d
            ? {
                id: d.id,
                status: d.status,
                attempts: d.attempts,
                responseStatus: d.responseStatus,
                lastAttemptAt: d.lastAttemptAt?.toISOString() ?? null,
                error: d.error,
                payload: d.payload,
              }
            : null,
        };
      }),
      events: AUTOMATION_TRIGGERS.map((t) => ({ key: t.key, label: t.label })),
    };
  }
}
