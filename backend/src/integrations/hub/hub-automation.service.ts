import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import {
  AUTOMATION_PROVIDERS,
  AUTOMATION_TRIGGERS,
} from '../automation/automation.constants';
import { catalogByKey } from './hub.catalog';

/**
 * Automation tab — Zapier / Make / n8n connect as REST-Hook subscriptions (`OutboundWebhook`), so
 * "connected" means at least one active subscription, "automations" are subscriptions, and
 * "triggers fired" are real `OutboundWebhookDelivery` rows.
 */
@Injectable()
export class HubAutomationService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async overview(businessId: string) {
    const db = this.tenantPrisma.client;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const subs = await db.outboundWebhook.findMany({
      where: { businessId, provider: { in: AUTOMATION_PROVIDERS } },
      orderBy: { createdAt: 'desc' },
    });
    const ids = subs.map((s) => s.id);
    const [firedMonth, failedMonth, recent] = ids.length
      ? await Promise.all([
          db.outboundWebhookDelivery.count({
            where: { webhookId: { in: ids }, createdAt: { gte: monthStart } },
          }),
          db.outboundWebhookDelivery.count({
            where: {
              webhookId: { in: ids },
              createdAt: { gte: monthStart },
              status: 'failed',
            },
          }),
          db.outboundWebhookDelivery.findMany({
            where: { webhookId: { in: ids } },
            orderBy: { createdAt: 'desc' },
            take: 300,
            select: { webhookId: true, createdAt: true },
          }),
        ])
      : [0, 0, [] as Array<{ webhookId: string; createdAt: Date }>];

    const lastFiredBySub = new Map<string, Date>();
    for (const r of recent)
      if (!lastFiredBySub.has(r.webhookId))
        lastFiredBySub.set(r.webhookId, r.createdAt);

    const active = subs.filter((s) => s.active);
    const platforms = AUTOMATION_PROVIDERS.map((provider) => {
      const def = catalogByKey(provider)!;
      const mine = subs.filter((s) => s.provider === provider);
      const mineActive = mine.filter((s) => s.active);
      const last = mine
        .map((s) => lastFiredBySub.get(s.id))
        .filter((d): d is Date => !!d)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      return {
        key: provider,
        name: def.name,
        initials: def.initials,
        benefit: def.benefit,
        connected: mineActive.length > 0,
        automations: mineActive.length,
        lastFiredAt: last?.toISOString() ?? null,
        subscriptions: mine.map((s) => ({
          id: s.id,
          triggerKey: s.triggerKey,
          targetUrl: s.targetUrl,
          active: s.active,
          createdAt: s.createdAt.toISOString(),
          lastFiredAt: lastFiredBySub.get(s.id)?.toISOString() ?? null,
        })),
      };
    });

    return {
      kpis: {
        activeAutomations: active.length,
        platformsConnected: platforms.filter((p) => p.connected).length,
        triggersFiredMonth: firedMonth,
        failedDeliveriesMonth: failedMonth,
        // Actions that an automation performs *inside* Noxtill arrive as ordinary API calls under
        // an API key and are not attributed to an automation, so there is no honest number.
        actionsPerformed: null as number | null,
      },
      platforms,
      triggers: AUTOMATION_TRIGGERS.map((t) => ({
        key: t.key,
        label: t.label,
        description: t.description,
        samplePayload: t.samplePayload,
        automations: active.filter((s) => s.triggerKey === t.key).length,
      })),
    };
  }
}
