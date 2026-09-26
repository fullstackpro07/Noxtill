import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { IntegrationsService } from '../integrations.service';
import { ConnectorRegistry } from '../connector-registry';
import { AppException } from '../../common/filters/app.exception';
import { AccountingSyncService } from '../accounting/accounting-sync.service';
import { AccountingMappingService } from '../accounting/accounting-mapping.service';
import { EcommerceSyncService } from '../ecommerce/ecommerce-sync.service';
import { ListingSyncService } from '../../listings/listing-sync.service';
import { AdStatsSyncProcessor } from '../../ads/jobs/ad-stats-sync.processor';
import { OutboundWebhookService } from '../automation/outbound-webhook.service';
import {
  AUDIENCE_PROVIDERS,
  CapabilitySyncService,
  PAYMENT_PROVIDERS,
} from '../sync/capability-sync.service';
import {
  BOOKING_SYNC_PROVIDERS,
  BookingSyncService,
} from '../sync/booking-sync.service';
import { AD_PROVIDERS } from '../../ads/ads.constants';
import { ACCOUNTING_PROVIDERS } from '../accounting/accounting.constants';
import { ECOMMERCE_PROVIDERS } from '../ecommerce/ecommerce.constants';
import { AUTOMATION_PROVIDERS } from '../automation/automation.constants';
import {
  CONNECTION_DETAIL_ERROR_CODES,
  type ConnectionCategory,
} from './connection-detail.constants';
import { IntegrationProvider, IntegrationStatus } from '@prisma/client';

function parseProvider(value: string): IntegrationProvider {
  if (!(Object.values(IntegrationProvider) as string[]).includes(value)) {
    throw new AppException(
      CONNECTION_DETAIL_ERROR_CODES.UNKNOWN_PROVIDER,
      `Unknown provider: ${value}`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return value as IntegrationProvider;
}

/**
 * Connection Detail (UPD-BE-132) — one real, generic detail view across every connector category.
 * Automation platforms (zapier/make/n8n) have no OAuth connection at all (real REST-Hook
 * subscriptions instead, see `OutboundWebhook`), so they get a structurally different real shape
 * (a list of subscriptions + their own real delivery history) rather than a fabricated
 * connected-since/token-expiry for a connection that was never established.
 */
@Injectable()
export class ConnectionDetailService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    private readonly connectors: ConnectorRegistry,
    private readonly accountingSync: AccountingSyncService,
    private readonly accountingMapping: AccountingMappingService,
    private readonly ecommerceSync: EcommerceSyncService,
    private readonly listingSync: ListingSyncService,
    private readonly adStatsSync: AdStatsSyncProcessor,
    private readonly outboundWebhooks: OutboundWebhookService,
    private readonly capabilitySync: CapabilitySyncService,
    private readonly bookingSync: BookingSyncService,
  ) {}

  private categorize(provider: IntegrationProvider): ConnectionCategory {
    if ((AD_PROVIDERS as string[]).includes(provider)) return 'ads';
    if (this.connectors.directoryProviders().includes(provider))
      return 'directory';
    if ((ACCOUNTING_PROVIDERS as string[]).includes(provider))
      return 'accounting';
    if ((ECOMMERCE_PROVIDERS as string[]).includes(provider))
      return 'ecommerce';
    if (
      (AUTOMATION_PROVIDERS as string[]).includes(provider) ||
      provider === IntegrationProvider.developer
    )
      return 'automation';
    return 'other';
  }

  async detail(businessId: string, providerRaw: string) {
    const provider = parseProvider(providerRaw);
    const category = this.categorize(provider);

    if (category === 'automation') {
      const subscriptions =
        await this.tenantPrisma.client.outboundWebhook.findMany({
          where: { businessId, provider },
          orderBy: { createdAt: 'desc' },
        });
      const withDeliveries = await Promise.all(
        subscriptions.map(async (sub) => ({
          id: sub.id,
          triggerKey: sub.triggerKey,
          targetUrl: sub.targetUrl,
          active: sub.active,
          createdAt: sub.createdAt,
          recentDeliveries:
            await this.tenantPrisma.client.outboundWebhookDelivery.findMany({
              where: { webhookId: sub.id },
              orderBy: { createdAt: 'desc' },
              take: 10,
            }),
        })),
      );
      return { provider, category, subscriptions: withDeliveries };
    }

    const integration = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider } },
    });
    const tokens =
      integration?.status === IntegrationStatus.connected
        ? await this.integrations.getTokens(businessId, provider)
        : null;

    let syncLog: {
      occurredAt: Date;
      success: boolean;
      message: string | null;
    }[] = [];
    if (category === 'directory') {
      const rows = await this.tenantPrisma.client.listingSyncLog.findMany({
        where: { businessId, provider },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      syncLog = rows.map((r) => ({
        occurredAt: r.createdAt,
        success: r.status === 'success',
        message: r.message,
      }));
    } else if (category === 'accounting' || category === 'ecommerce') {
      const rows = await this.tenantPrisma.client.integrationSyncLog.findMany({
        where: { businessId, provider },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      syncLog = rows.map((r) => ({
        occurredAt: r.createdAt,
        success: r.success,
        message: r.message,
      }));
    }

    const fieldMapping =
      category === 'accounting'
        ? await this.accountingMapping.list(provider)
        : null;

    // E-commerce conflict history depth fix — the real, persisted conflict log for this
    // provider, not just the most recent sync run's own response.
    const conflicts =
      category === 'ecommerce'
        ? await this.ecommerceSync.listConflicts(businessId, provider)
        : null;

    return {
      provider,
      category,
      status: integration?.status ?? IntegrationStatus.not_connected,
      connectedAt: integration?.connectedAt ?? null,
      lastSyncAt: integration?.lastSyncAt ?? null,
      tokenExpiresAt: tokens?.expiresAt ?? null,
      syncLog,
      fieldMapping,
      conflicts,
    };
  }

  /**
   * `POST /integrations/:provider/sync` — dispatches to whichever real action actually applies for
   * that category. Accounting/E-commerce/Directory get the same real sync `AccountingSyncService`
   * etc. already run on their own hourly/on-demand paths; Ads gets a real on-demand run of the
   * hourly stats-refresh job scoped to this business+provider (never waiting up to an hour);
   * Automation platforms have no connection or stats to sync, so the real, meaningful action here
   * is re-attempting every real delivery that previously failed for this business's active
   * subscriptions on that provider — never a fabricated no-op success.
   */
  async triggerSync(businessId: string, providerRaw: string) {
    const provider = parseProvider(providerRaw);
    const category = this.categorize(provider);

    // Providers added in the Integrations redesign each have their own real sync.
    if (PAYMENT_PROVIDERS.includes(provider)) {
      return this.capabilitySync.syncPayments(businessId, provider);
    }
    if (AUDIENCE_PROVIDERS.includes(provider)) {
      return this.capabilitySync.syncAudience(businessId, provider);
    }
    if (provider === IntegrationProvider.google_analytics) {
      return this.capabilitySync.syncAnalytics(businessId);
    }
    if (provider === IntegrationProvider.merchant) {
      return this.capabilitySync.syncMerchant(businessId);
    }
    if (BOOKING_SYNC_PROVIDERS.includes(provider)) {
      return this.bookingSync.sync(businessId, provider, { manual: true });
    }

    switch (category) {
      case 'accounting':
        return this.accountingSync.sync(businessId);
      case 'ecommerce':
        return this.ecommerceSync.sync(businessId);
      case 'directory':
        return this.listingSync.sync(businessId);
      case 'ads':
        return this.adStatsSync.syncBusinessProvider(businessId, provider);
      case 'automation':
        return this.outboundWebhooks.retryFailedDeliveries(
          businessId,
          provider,
        );
      default:
        throw new AppException(
          CONNECTION_DETAIL_ERROR_CODES.SYNC_NOT_SUPPORTED,
          'This connector has no manual sync action.',
          HttpStatus.BAD_REQUEST,
        );
    }
  }
}
