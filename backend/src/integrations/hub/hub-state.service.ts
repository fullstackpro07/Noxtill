import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { TokenCipherService } from '../token-cipher.service';
import { OAuthTokens } from '../connector.interface';
import { startOfDayInZone } from '../../delivery/delivery-time.util';
import { ACCOUNTING_PROVIDERS } from '../accounting/accounting.constants';
import { ECOMMERCE_PROVIDERS } from '../ecommerce/ecommerce.constants';
import { AUTOMATION_PROVIDERS } from '../automation/automation.constants';
import { HUB_CATALOG, HubProviderDef, syncInfoOf } from './hub.catalog';
import {
  AttentionReason,
  HubHealth,
  HubProviderCard,
  HubStatus,
  HubToken,
} from './hub.types';
import {
  IntegrationProvider,
  IntegrationStatus,
  SocialAccountStatus,
  SocialPlatform,
} from '@prisma/client';

/** Days before a non-renewing token's expiry at which the connection is flagged. */
export const TOKEN_WARN_DAYS = 14;
const DAY_MS = 86_400_000;
/** Providers that act on events rather than syncing on demand. */
const EVENT_DRIVEN_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.slack,
  IntegrationProvider.whatsapp,
  IntegrationProvider.email,
];
/** Providers whose sync log lives in `ListingSyncLog` (Business Listings) rather than `IntegrationSyncLog`. */
const DIRECTORY_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.gmb,
  IntegrationProvider.bing_places,
  IntegrationProvider.apple_business_connect,
  IntegrationProvider.yelp,
];

/** A human label for the account a connection is bound to, from what the provider told Noxtill at connect time. */
function accountLabel(
  meta: unknown,
  tokens: OAuthTokens | null,
): string | null {
  const sources = [meta, tokens?.providerMeta].filter(
    (m): m is Record<string, unknown> => !!m && typeof m === 'object',
  );
  for (const source of sources) {
    for (const key of [
      'shop',
      'storeUrl',
      'account',
      'team',
      'verifiedName',
      'displayPhoneNumber',
      'channel',
      'accountId',
      'merchantId',
    ]) {
      const value = source[key];
      if (typeof value === 'string' && value) return value;
    }
  }
  return null;
}

function relativeDays(ms: number): number {
  return Math.max(0, Math.ceil(ms / DAY_MS));
}

/**
 * Reads the real connection state of every provider the Integrations hub lists and turns it into
 * one uniform card. Nothing here is invented: status comes from `Integration`/`SocialAccount`
 * rows, "last attempted" and "last successful" from the real sync logs, token expiry from the
 * decrypted token blob (never returned), and records from the tables each provider really writes.
 */
@Injectable()
export class HubStateService {
  private readonly logger = new Logger(HubStateService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tokenCipher: TokenCipherService,
    private readonly config: ConfigService,
  ) {}

  isConfigured(def: HubProviderDef): boolean {
    return (def.envKeys ?? []).every((k) => !!this.config.get<string>(k));
  }

  private tokenState(
    tokens: OAuthTokens | null,
    status: IntegrationStatus | SocialAccountStatus | null,
    now: Date,
  ): HubToken {
    if (!tokens || status === null || status === 'not_connected') {
      return {
        state: 'not_applicable',
        label: 'Not applicable',
        expiresAt: null,
      };
    }
    if (!tokens.expiresAt) {
      return { state: 'valid', label: 'Valid', expiresAt: null };
    }
    const expires = new Date(tokens.expiresAt);
    // An access token that has a refresh token renews itself — its expiry is not a problem.
    if (tokens.refreshToken) {
      return {
        state: 'valid',
        label: 'Valid · renews automatically',
        expiresAt: expires.toISOString(),
      };
    }
    const msLeft = expires.getTime() - now.getTime();
    if (msLeft <= 0) {
      return {
        state: 'expired',
        label: 'Authorisation expired',
        expiresAt: expires.toISOString(),
      };
    }
    const days = relativeDays(msLeft);
    if (days <= TOKEN_WARN_DAYS) {
      return {
        state: 'expiring',
        label: `Token expires in ${days} day${days === 1 ? '' : 's'}`,
        expiresAt: expires.toISOString(),
      };
    }
    return {
      state: 'valid',
      label: `Valid · expires in ${days} days`,
      expiresAt: expires.toISOString(),
    };
  }

  private decode(stored: string | null): OAuthTokens | null {
    if (!stored) return null;
    try {
      return JSON.parse(this.tokenCipher.decrypt(stored)) as OAuthTokens;
    } catch (error) {
      this.logger.warn(
        `Could not decrypt a stored token: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async businessClock(
    businessId: string,
  ): Promise<{ timezone: string; dayStart: Date }> {
    const business = await this.tenantPrisma.client.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    const timezone = business?.timezone ?? 'UTC';
    return { timezone, dayStart: startOfDayInZone(timezone) };
  }

  async cards(businessId: string): Promise<HubProviderCard[]> {
    const now = new Date();
    const { dayStart } = await this.businessClock(businessId);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const db = this.tenantPrisma.client;

    const [
      integrations,
      socialAccounts,
      syncLogs,
      listingLogs,
      failedToday,
      listingFailedToday,
      pendingConflicts,
      accountingFailed,
      campaignCounts,
      paymentCounts,
      trafficCounts,
      ecommerceOrders,
      accountingPosted,
      activeAutomationSubs,
      recentAutomationDeliveries,
      emailCampaigns,
      apiKeys,
      devWebhooks,
      apiRequestsMonth,
      webhookDeliveriesMonth,
      logProcessedSums,
      listingSuccess,
      inboxCounts,
      lastWebhookDelivery,
    ] = await Promise.all([
      db.integration.findMany({ where: { businessId } }),
      db.socialAccount.findMany({ where: { businessId } }),
      // Newest attempt + newest success per provider.
      db.integrationSyncLog.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 600,
      }),
      db.listingSyncLog.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      db.integrationSyncLog.groupBy({
        by: ['provider'],
        where: { businessId, success: false, createdAt: { gte: dayStart } },
        _count: { _all: true },
      }),
      db.listingSyncLog.groupBy({
        by: ['provider'],
        where: { businessId, status: 'failed', createdAt: { gte: dayStart } },
        _count: { _all: true },
      }),
      db.ecommerceSyncConflict.groupBy({
        by: ['provider'],
        where: { businessId, status: 'pending' },
        _count: { _all: true },
      }),
      db.order.count({
        where: {
          businessId,
          status: 'completed',
          accountingSyncedAt: null,
          accountingSyncError: { not: null },
        },
      }),
      db.adCampaign.groupBy({
        by: ['provider'],
        where: { businessId },
        _count: { _all: true },
      }),
      db.externalPayment.groupBy({
        by: ['provider'],
        where: { businessId },
        _count: { _all: true },
      }),
      db.webTrafficDaily.groupBy({
        by: ['provider'],
        where: { businessId },
        _count: { _all: true },
      }),
      db.order.groupBy({
        by: ['externalProvider'],
        where: { businessId, externalProvider: { in: ECOMMERCE_PROVIDERS } },
        _count: { _all: true },
      }),
      db.order.count({
        where: { businessId, accountingSyncedAt: { not: null } },
      }),
      db.outboundWebhook.findMany({
        where: {
          businessId,
          provider: { in: AUTOMATION_PROVIDERS },
          active: true,
        },
        select: { id: true, provider: true },
      }),
      db.outboundWebhookDelivery.findMany({
        where: {
          webhook: { businessId, provider: { in: AUTOMATION_PROVIDERS } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          createdAt: true,
          status: true,
          webhook: { select: { provider: true } },
        },
      }),
      db.emailCampaign.count({ where: { businessId } }),
      db.apiKey.findMany({ where: { businessId } }),
      db.outboundWebhook.findMany({
        where: { businessId, provider: IntegrationProvider.developer },
        select: { id: true },
      }),
      db.apiKeyUsageHour.aggregate({
        where: { businessId, bucketStart: { gte: monthStart } },
        _sum: { count: true },
      }),
      db.outboundWebhookDelivery.count({
        where: {
          createdAt: { gte: monthStart },
          webhook: { businessId, provider: IntegrationProvider.developer },
        },
      }),
      db.integrationSyncLog.groupBy({
        by: ['provider'],
        where: { businessId, success: true },
        _sum: { recordsProcessed: true },
      }),
      db.listingSyncLog.groupBy({
        by: ['provider'],
        where: { businessId, status: 'success' },
        _count: { _all: true },
      }),
      db.socialInboxItem.groupBy({
        by: ['platform'],
        where: { businessId },
        _count: { _all: true },
      }),
      db.outboundWebhookDelivery.findFirst({
        where: {
          webhook: { businessId, provider: IntegrationProvider.developer },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    const inboxByPlatform = new Map(
      inboxCounts.map((g) => [g.platform, g._count._all]),
    );

    const integrationByProvider = new Map(
      integrations.map((i) => [i.provider, i]),
    );
    const socialByPlatform = new Map(
      socialAccounts.map((s) => [s.platform, s]),
    );
    const errorsByProvider = new Map(
      failedToday.map((g) => [g.provider, g._count._all]),
    );
    // Directory pushes log to ListingSyncLog, not IntegrationSyncLog — count those failures too.
    for (const g of listingFailedToday) {
      errorsByProvider.set(
        g.provider,
        (errorsByProvider.get(g.provider) ?? 0) + g._count._all,
      );
    }
    const conflictsByProvider = new Map(
      pendingConflicts.map((g) => [g.provider, g._count._all]),
    );
    const campaignsByProvider = new Map(
      campaignCounts.map((g) => [g.provider, g._count._all]),
    );
    const paymentsByProvider = new Map(
      paymentCounts.map((g) => [g.provider, g._count._all]),
    );
    const trafficByProvider = new Map(
      trafficCounts.map((g) => [g.provider, g._count._all]),
    );
    const ecomOrdersByProvider = new Map(
      ecommerceOrders.map((g) => [g.externalProvider, g._count._all]),
    );
    const processedByProvider = new Map(
      logProcessedSums.map((g) => [g.provider, g._sum.recordsProcessed ?? 0]),
    );
    const listingSuccessByProvider = new Map(
      listingSuccess.map((g) => [g.provider, g._count._all]),
    );

    const latestAttempt = new Map<
      IntegrationProvider,
      { at: Date; success: boolean }
    >();
    const latestSuccess = new Map<IntegrationProvider, Date>();
    for (const log of syncLogs) {
      if (!latestAttempt.has(log.provider)) {
        latestAttempt.set(log.provider, {
          at: log.createdAt,
          success: log.success,
        });
      }
      if (log.success && !latestSuccess.has(log.provider)) {
        latestSuccess.set(log.provider, log.createdAt);
      }
    }
    for (const log of listingLogs) {
      const ok = log.status === 'success';
      const existing = latestAttempt.get(log.provider);
      if (!existing || existing.at < log.createdAt) {
        latestAttempt.set(log.provider, { at: log.createdAt, success: ok });
      }
      if (
        ok &&
        (!latestSuccess.get(log.provider) ||
          latestSuccess.get(log.provider)! < log.createdAt)
      ) {
        latestSuccess.set(log.provider, log.createdAt);
      }
    }

    const activeAccounting = integrations.find(
      (i) =>
        ACCOUNTING_PROVIDERS.includes(i.provider) &&
        i.status === IntegrationStatus.connected,
    );
    const automationCounts = new Map<IntegrationProvider, number>();
    for (const sub of activeAutomationSubs) {
      automationCounts.set(
        sub.provider,
        (automationCounts.get(sub.provider) ?? 0) + 1,
      );
    }
    const automationLatest = new Map<IntegrationProvider, Date>();
    for (const d of recentAutomationDeliveries) {
      if (!automationLatest.has(d.webhook.provider)) {
        automationLatest.set(d.webhook.provider, d.createdAt);
      }
    }
    const activeKeys = apiKeys.filter((k) => !k.revokedAt);
    const lastKeyUse = activeKeys
      .map((k) => k.lastUsedAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const cards: HubProviderCard[] = [];
    for (const def of HUB_CATALOG) {
      cards.push(
        this.buildCard(def, {
          now,
          integration:
            def.source.type === 'integration'
              ? (integrationByProvider.get(def.source.provider) ?? null)
              : null,
          social:
            def.source.type === 'social'
              ? (socialByPlatform.get(def.source.platform) ?? null)
              : null,
          latestAttempt,
          latestSuccess,
          inboxByPlatform,
          errorsByProvider,
          conflictsByProvider,
          accountingFailed,
          accountingPosted,
          activeAccounting: activeAccounting?.provider ?? null,
          campaignsByProvider,
          paymentsByProvider,
          trafficByProvider,
          ecomOrdersByProvider,
          processedByProvider,
          listingSuccessByProvider,
          automationCounts,
          automationLatest,
          emailCampaigns,
          activeKeys: activeKeys.length,
          lastKeyUse: lastKeyUse ?? null,
          apiRequestsMonth: apiRequestsMonth._sum.count ?? 0,
          devWebhooks: devWebhooks.length,
          webhookDeliveriesMonth,
          lastWebhookDelivery: lastWebhookDelivery?.createdAt ?? null,
        }),
      );
    }
    return cards;
  }

  private buildCard(
    def: HubProviderDef,
    ctx: {
      now: Date;
      integration: {
        status: IntegrationStatus;
        meta: unknown;
        tokens: string | null;
        connectedAt: Date | null;
        lastSyncAt: Date | null;
        pausedAt: Date | null;
        provider: IntegrationProvider;
      } | null;
      social: {
        status: SocialAccountStatus;
        tokens: string | null;
        createdAt: Date;
        updatedAt: Date;
        externalAccountName: string | null;
      } | null;
      latestAttempt: Map<IntegrationProvider, { at: Date; success: boolean }>;
      latestSuccess: Map<IntegrationProvider, Date>;
      inboxByPlatform: Map<SocialPlatform, number>;
      errorsByProvider: Map<IntegrationProvider, number>;
      conflictsByProvider: Map<IntegrationProvider, number>;
      accountingFailed: number;
      accountingPosted: number;
      activeAccounting: IntegrationProvider | null;
      campaignsByProvider: Map<IntegrationProvider, number>;
      paymentsByProvider: Map<IntegrationProvider, number>;
      trafficByProvider: Map<IntegrationProvider, number>;
      ecomOrdersByProvider: Map<IntegrationProvider | null, number>;
      processedByProvider: Map<IntegrationProvider, number>;
      listingSuccessByProvider: Map<IntegrationProvider, number>;
      automationCounts: Map<IntegrationProvider, number>;
      automationLatest: Map<IntegrationProvider, Date>;
      emailCampaigns: number;
      activeKeys: number;
      lastKeyUse: Date | null;
      apiRequestsMonth: number;
      devWebhooks: number;
      webhookDeliveriesMonth: number;
      lastWebhookDelivery: Date | null;
    },
  ): HubProviderCard {
    const base = {
      key: def.key,
      name: def.name,
      initials: def.initials,
      category: def.category,
      benefit: def.benefit,
      direction: def.direction,
      modules: def.modules,
      permissions: def.permissions,
      connectKind: def.connectKind,
      credentialFields: def.credentialFields ?? [],
      workspaceHref: def.workspaceHref ?? null,
      recordsUnit: def.recordsUnit,
      syncMode: syncInfoOf(def).mode,
      syncNote: syncInfoOf(def).note,
      setupRequired: !this.isConfigured(def),
    };

    const notApplicable: HubToken = {
      state: 'not_applicable',
      label: 'Not applicable',
      expiresAt: null,
    };
    const attention: AttentionReason[] = [];
    let status: HubStatus = 'not_connected';
    let connectedAt: Date | null = null;
    let lastAttempt: Date | null = null;
    let lastSuccess: Date | null = null;
    let records: number | null = null;
    let errorsToday = 0;
    let token = notApplicable;
    let externalAccountName: string | null = null;
    let canPause = false;
    let canSync = false;

    if (def.source.type === 'virtual') {
      // REST API / Webhooks are always available; "connected" means at least one is set up.
      const isApi = def.source.kind === 'rest_api';
      const active = isApi ? ctx.activeKeys > 0 : ctx.devWebhooks > 0;
      status = active ? 'connected' : 'not_connected';
      records = isApi ? ctx.apiRequestsMonth : ctx.webhookDeliveriesMonth;
      lastAttempt = isApi ? ctx.lastKeyUse : ctx.lastWebhookDelivery;
      lastSuccess = lastAttempt;
      token = {
        state: active ? 'valid' : 'not_applicable',
        label: active ? 'Valid' : 'Not applicable',
        expiresAt: null,
      };
    } else if (def.source.type === 'social') {
      const row = ctx.social;
      if (row && row.status !== SocialAccountStatus.not_connected) {
        const tokens = this.decode(row.tokens);
        token = this.tokenState(tokens, row.status, ctx.now);
        connectedAt = row.createdAt;
        externalAccountName = row.externalAccountName;
        records = ctx.inboxByPlatform.get(def.source.platform) ?? 0;
        if (row.status === SocialAccountStatus.needs_attention) {
          attention.push({
            code: token.state === 'expired' ? 'auth_expired' : 'auth_failed',
            text:
              token.state === 'expired'
                ? 'Authorisation expired'
                : 'Authorisation needs renewing',
            severity: 'critical',
          });
        } else if (token.state === 'expired') {
          attention.push({
            code: 'auth_expired',
            text: 'Authorisation expired',
            severity: 'critical',
          });
        } else if (token.state === 'expiring') {
          attention.push({
            code: 'token_expiring',
            text: token.label,
            severity: 'high',
          });
        }
        status = attention.length ? 'needs_attention' : 'connected';
      }
    } else {
      const provider = def.source.provider;
      const row = ctx.integration;
      const attempt = ctx.latestAttempt.get(provider);
      lastAttempt = attempt?.at ?? null;
      lastSuccess = ctx.latestSuccess.get(provider) ?? row?.lastSyncAt ?? null;
      errorsToday = ctx.errorsByProvider.get(provider) ?? 0;
      const connectedRow =
        row && row.status !== IntegrationStatus.not_connected;

      if (def.connectKind === 'automation') {
        const subs = ctx.automationCounts.get(provider) ?? 0;
        status = subs > 0 ? 'connected' : 'not_connected';
        records = subs;
        lastAttempt = ctx.automationLatest.get(provider) ?? null;
        lastSuccess = lastAttempt;
        token = {
          state: subs ? 'valid' : 'not_applicable',
          label: subs ? 'Valid' : 'Not applicable',
          expiresAt: null,
        };
        canSync = subs > 0;
      } else if (connectedRow) {
        const tokens = this.decode(row.tokens);
        token = this.tokenState(tokens, row.status, ctx.now);
        connectedAt = row.connectedAt;
        externalAccountName = accountLabel(row.meta, tokens);
        // WhatsApp is a sending channel, not a sync: pausing it would silently move a business's
        // messages to the shared platform number, so it is not offered.
        canPause = provider !== IntegrationProvider.whatsapp;
        // Slack, WhatsApp and email act when something happens (a sale, a message) rather than on a
        // schedule, so there is no meaningful "sync now" for them.
        canSync = !EVENT_DRIVEN_PROVIDERS.includes(provider);
        if (row.status === IntegrationStatus.needs_attention) {
          attention.push({
            code: token.state === 'expired' ? 'auth_expired' : 'auth_failed',
            text:
              token.state === 'expired'
                ? 'Authorisation expired'
                : 'Authorisation needs renewing',
            severity: 'critical',
          });
        } else if (token.state === 'expired') {
          attention.push({
            code: 'auth_expired',
            text: 'Authorisation expired',
            severity: 'critical',
          });
        } else if (token.state === 'expiring') {
          attention.push({
            code: 'token_expiring',
            text: token.label,
            severity: 'high',
          });
        }
        if (attempt && !attempt.success && !row.pausedAt) {
          attention.push({
            code: 'sync_failing',
            text: 'The latest sync failed',
            severity: 'high',
          });
        }
        const conflicts = ctx.conflictsByProvider.get(provider) ?? 0;
        if (conflicts > 0) {
          attention.push({
            code: 'conflicts_pending',
            text: `${conflicts} stock conflict${conflicts === 1 ? '' : 's'} awaiting your decision`,
            severity: 'high',
          });
        }
        if (ctx.activeAccounting === provider && ctx.accountingFailed > 0) {
          attention.push({
            code: 'records_failed',
            text: `${ctx.accountingFailed} record${ctx.accountingFailed === 1 ? '' : 's'} failed to post`,
            severity: 'medium',
          });
        }
        status = row.pausedAt
          ? 'paused'
          : attention.length
            ? 'needs_attention'
            : 'connected';
      }

      if (connectedRow) {
        records = this.recordsFor(def, provider, ctx) ?? records;
      }
      if (def.connectKind === 'channel' && connectedRow) canPause = true;
    }

    return {
      ...base,
      status,
      connectedAt: connectedAt?.toISOString() ?? null,
      lastAttemptAt: lastAttempt?.toISOString() ?? null,
      lastSuccessAt: lastSuccess?.toISOString() ?? null,
      records,
      errorsToday,
      token,
      attention,
      externalAccountName,
      canPause,
      canSync,
    };
  }

  private recordsFor(
    def: HubProviderDef,
    provider: IntegrationProvider,
    ctx: {
      accountingPosted: number;
      activeAccounting: IntegrationProvider | null;
      campaignsByProvider: Map<IntegrationProvider, number>;
      paymentsByProvider: Map<IntegrationProvider, number>;
      trafficByProvider: Map<IntegrationProvider, number>;
      ecomOrdersByProvider: Map<IntegrationProvider | null, number>;
      processedByProvider: Map<IntegrationProvider, number>;
      listingSuccessByProvider: Map<IntegrationProvider, number>;
      emailCampaigns: number;
    },
  ): number | null {
    if (ACCOUNTING_PROVIDERS.includes(provider)) {
      return ctx.activeAccounting === provider ? ctx.accountingPosted : 0;
    }
    if (ECOMMERCE_PROVIDERS.includes(provider))
      return ctx.ecomOrdersByProvider.get(provider) ?? 0;
    if (DIRECTORY_PROVIDERS.includes(provider))
      return ctx.listingSuccessByProvider.get(provider) ?? 0;
    if (def.category === 'Advertising' || def.recordsUnit === 'campaigns') {
      return ctx.campaignsByProvider.get(provider) ?? 0;
    }
    if (def.category === 'Payments')
      return ctx.paymentsByProvider.get(provider) ?? 0;
    if (provider === IntegrationProvider.google_analytics)
      return ctx.trafficByProvider.get(provider) ?? 0;
    if (provider === IntegrationProvider.email) return ctx.emailCampaigns;
    return ctx.processedByProvider.get(provider) ?? 0;
  }

  health(cards: HubProviderCard[]): HubHealth {
    const connectedCards = cards.filter((c) => c.status !== 'not_connected');
    const needs = cards.filter((c) => c.status === 'needs_attention');
    const paused = cards.filter((c) => c.status === 'paused');
    const healthy = cards.filter((c) => c.status === 'connected');
    const errorsToday = cards.reduce((n, c) => n + c.errorsToday, 0);
    const failing = cards.filter((c) => c.errorsToday > 0).length;
    const headline =
      needs.length === 0
        ? connectedCards.length === 0
          ? 'No integrations connected'
          : 'All connected integrations healthy'
        : `${needs.length} integration${needs.length === 1 ? '' : 's'} need${needs.length === 1 ? 's' : ''} attention`;
    return {
      headline,
      allHealthy: needs.length === 0 && connectedCards.length > 0,
      needsAttention: needs.length,
      connected: connectedCards.length,
      healthy: healthy.length,
      paused: paused.length,
      available: cards.filter((c) => c.status === 'not_connected').length,
      syncErrorsToday: errorsToday,
      syncErrorsAcrossConnections: failing,
    };
  }
}
