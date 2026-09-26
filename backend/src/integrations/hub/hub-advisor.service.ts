import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { IntegrationProvider } from '@prisma/client';
import { AdvisorFinding, HubProviderCard } from './hub.types';

/** How long a dismissed finding stays hidden. The finding returns if its condition still holds after this. */
export const ADVISOR_DISMISS_DAYS = 7;
const DAY_MS = 86_400_000;
const UNUSED_KEY_DAYS = 7;

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2 } as const;

/**
 * The Integration Advisor. Every finding is computed from real connection state on each request —
 * there is no stored "alert" that can go stale, and a finding disappears the moment its condition
 * stops being true. Dismissals are real rows that lapse, so a still-broken connection reappears.
 */
@Injectable()
export class HubAdvisorService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async findings(
    businessId: string,
    cards: HubProviderCard[],
  ): Promise<AdvisorFinding[]> {
    const db = this.tenantPrisma.client;
    const now = new Date();
    const out: AdvisorFinding[] = [];

    for (const card of cards) {
      const modules = card.modules.join(' · ');
      for (const reason of card.attention) {
        switch (reason.code) {
          case 'auth_expired':
          case 'auth_failed':
            out.push({
              key: `${reason.code}:${card.key}`,
              severity: 'critical',
              icon: 'circle-alert',
              providerKey: card.key,
              finding:
                reason.code === 'auth_expired'
                  ? `${card.name} authorisation has expired`
                  : `${card.name} authorisation needs renewing`,
              why: `Noxtill cannot sync with ${card.name} until it is reconnected, so ${modules} will not receive new data from it.`,
              affectedModules: card.modules,
              recordsAffected: 'None written while unauthorised',
              primaryAction: {
                label: 'Reconnect',
                kind: 'reconnect',
                target: `provider:${card.key}`,
              },
            });
            break;
          case 'token_expiring':
            out.push({
              key: `token_expiring:${card.key}`,
              severity: 'high',
              icon: 'key-round',
              providerKey: card.key,
              finding: `${card.name} ${card.token.label.charAt(0).toLowerCase()}${card.token.label.slice(1)}`,
              why: `When the token lapses, ${modules} stop receiving data from ${card.name}. Reconnect before then to avoid a gap.`,
              affectedModules: card.modules,
              recordsAffected: 'None yet',
              primaryAction: {
                label: 'Reconnect',
                kind: 'reconnect',
                target: `provider:${card.key}`,
              },
            });
            break;
          case 'sync_failing':
            out.push({
              key: `sync_failing:${card.key}`,
              severity: 'high',
              icon: 'refresh-cw',
              providerKey: card.key,
              finding: `${card.name} sync is failing`,
              why: `The most recent sync attempt failed${card.lastSuccessAt ? ` and the last successful one was ${this.ago(card.lastSuccessAt, now)}` : ' and there has been no successful sync yet'}. The error is in the connection's sync log.`,
              affectedModules: card.modules,
              recordsAffected: `${card.errorsToday} failed sync${card.errorsToday === 1 ? '' : 's'} today`,
              primaryAction: {
                label: 'Review',
                kind: 'open',
                target: `provider:${card.key}`,
              },
            });
            break;
          case 'conflicts_pending': {
            const n = await db.ecommerceSyncConflict.count({
              where: {
                businessId,
                status: 'pending',
                provider: this.providerOf(card),
              },
            });
            out.push({
              key: `conflicts_pending:${card.key}`,
              severity: 'high',
              icon: 'git-compare',
              providerKey: card.key,
              finding: `${card.name} has ${n} stock conflict${n === 1 ? '' : 's'} awaiting a decision`,
              why: 'Noxtill and the store hold different stock for the same products. Nothing has been overwritten — both sides are unchanged until you choose.',
              affectedModules: ['Products', 'Inventory', 'Orders'],
              recordsAffected: `${n} product${n === 1 ? '' : 's'} · unchanged`,
              primaryAction: {
                label: 'Resolve',
                kind: 'resolve',
                target: '/integrations/ecommerce',
              },
            });
            break;
          }
          case 'records_failed': {
            const failing = await db.order.findMany({
              where: {
                businessId,
                status: 'completed',
                accountingSyncedAt: null,
                accountingSyncError: { not: null },
              },
              select: { accountingSyncError: true },
              take: 200,
              orderBy: { createdAt: 'desc' },
            });
            const counts = new Map<string, number>();
            for (const o of failing) {
              const e = o.accountingSyncError ?? 'Unknown error';
              counts.set(e, (counts.get(e) ?? 0) + 1);
            }
            const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
            out.push({
              key: `records_failed:${card.key}`,
              severity: 'medium',
              icon: 'receipt-text',
              providerKey: card.key,
              finding: `${card.name} failed to post ${failing.length} record${failing.length === 1 ? '' : 's'}`,
              why: `${top ? `Most common reason: ${top[0]}. ` : ''}The sales themselves are unaffected in Noxtill — only the accounting post is pending.`,
              affectedModules: ['Orders'],
              recordsAffected: `${failing.length} sale${failing.length === 1 ? '' : 's'} · unaffected in Noxtill`,
              primaryAction: {
                label: 'Fix mapping',
                kind: 'fix-mapping',
                target: '/integrations/accounting',
              },
            });
            break;
          }
        }
      }
    }

    // Developer surface: failed outbound webhook deliveries and API keys that were never used.
    const failedDeliveries = await db.outboundWebhookDelivery.count({
      where: {
        status: 'failed',
        createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) },
        webhook: { businessId, provider: IntegrationProvider.developer },
      },
    });
    if (failedDeliveries > 0) {
      out.push({
        key: 'webhook_deliveries_failed',
        severity: 'medium',
        icon: 'webhook',
        providerKey: 'webhooks',
        finding: `${failedDeliveries} webhook deliver${failedDeliveries === 1 ? 'y' : 'ies'} failed in the last 7 days`,
        why: 'Your endpoint did not accept these events after every retry. Every delivery keeps its response, so the cause is in the delivery detail.',
        affectedModules: ['Every module by event'],
        recordsAffected: `${failedDeliveries} deliver${failedDeliveries === 1 ? 'y' : 'ies'}`,
        primaryAction: {
          label: 'Review',
          kind: 'retry',
          target: '/integrations/developer',
        },
      });
    }
    const staleKeys = await db.apiKey.count({
      where: {
        businessId,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: { lt: new Date(now.getTime() - UNUSED_KEY_DAYS * DAY_MS) },
      },
    });
    if (staleKeys > 0) {
      out.push({
        key: 'api_key_never_used',
        severity: 'medium',
        icon: 'key-round',
        providerKey: 'rest_api',
        finding: `${staleKeys} API key${staleKeys === 1 ? ' has' : 's have'} never been used`,
        why: 'A key that is never used is a credential sitting idle — a risk with no benefit. Revoking it costs nothing if nothing depends on it.',
        affectedModules: ['Every module by scope'],
        recordsAffected: 'None',
        primaryAction: {
          label: 'Review keys',
          kind: 'revoke',
          target: '/integrations/developer',
        },
      });
    }

    const dismissals =
      await this.tenantPrisma.client.integrationAdvisorDismissal.findMany({
        where: { businessId, until: { gt: now } },
        select: { findingKey: true },
      });
    const hidden = new Set(dismissals.map((d) => d.findingKey));

    return out
      .filter((f) => !hidden.has(f.key))
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  }

  async dismiss(
    businessId: string,
    userId: string | undefined,
    findingKey: string,
  ) {
    const until = new Date(Date.now() + ADVISOR_DISMISS_DAYS * DAY_MS);
    await this.tenantPrisma.client.integrationAdvisorDismissal.upsert({
      where: { businessId_findingKey: { businessId, findingKey } },
      create: { businessId, findingKey, until, dismissedByUserId: userId },
      update: { until, dismissedByUserId: userId },
    });
    await this.audit.log({
      entity: 'IntegrationAdvisor',
      entityId: findingKey,
      action: 'integration.advisor.dismissed',
      after: { until: until.toISOString() },
    });
    return { dismissedUntil: until.toISOString() };
  }

  private providerOf(card: HubProviderCard): IntegrationProvider {
    return card.key as IntegrationProvider;
  }

  private ago(iso: string, now: Date): string {
    const ms = now.getTime() - new Date(iso).getTime();
    const mins = Math.round(ms / 60000);
    if (mins < 1) return 'moments ago';
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    return `${days} days ago`;
  }
}
