import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../common/storage/s3.service';
import { AppException } from '../../common/filters/app.exception';
import { IntegrationsService } from '../integrations.service';
import { ConnectorRegistry } from '../connector-registry';
import { AudienceContact, CatalogProductInput } from '../connector.interface';
import { SyncLogService } from './sync-log.service';
import { IntegrationProvider, Prisma } from '@prisma/client';

export const PAYMENT_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.stripe,
  IntegrationProvider.square,
  IntegrationProvider.paypal,
];
export const AUDIENCE_PROVIDERS: IntegrationProvider[] = [
  IntegrationProvider.mailchimp,
  IntegrationProvider.klaviyo,
];
const AUDIENCE_BATCH = 500;
const MERCHANT_BATCH = 100;
const PAYMENT_DEFAULT_LOOKBACK_DAYS = 30;
const TRAFFIC_DAYS = 14;

export interface CapabilitySyncResult {
  provider: string;
  processed: number;
  failed: number;
  message: string;
}

/**
 * The real "Sync now" for the connectors that read from or write to a provider on demand:
 * payment processors (charges/refunds/payouts -> `ExternalPayment`), Google Analytics (daily
 * traffic -> `WebTrafficDaily`), Mailchimp/Klaviyo (marketing-consented customers -> the
 * provider's audience) and Google Merchant Center (catalog products -> Merchant Center). Every run
 * writes an `IntegrationSyncLog` row, and a failed provider call is recorded as a failed run — it
 * is never reported as a success.
 */
@Injectable()
export class CapabilitySyncService {
  private readonly logger = new Logger(CapabilitySyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly connectors: ConnectorRegistry,
    private readonly runs: SyncLogService,
    private readonly s3: S3Service,
  ) {}

  async syncPayments(
    businessId: string,
    provider: IntegrationProvider,
  ): Promise<CapabilitySyncResult> {
    const startedAt = Date.now();
    const integration = await this.runs.requireRunnable(businessId, provider);
    const connector = this.connectors.get(provider);
    const tokens = await this.integrations.getTokens(businessId, provider);
    if (!tokens || !connector.fetchPayments) {
      throw new AppException(
        'INTEGRATION_NOT_READY',
        `${provider} cannot read payments right now`,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const latest = await this.prisma.externalPayment.findFirst({
        where: { businessId, provider },
        orderBy: { occurredAt: 'desc' },
      });
      // Re-read a day before the newest stored row so a payment that settled late is not missed;
      // the unique key makes the overlap harmless.
      const since = latest
        ? new Date(latest.occurredAt.getTime() - 86_400_000).toISOString()
        : new Date(
            Date.now() - PAYMENT_DEFAULT_LOOKBACK_DAYS * 86_400_000,
          ).toISOString();
      const payments = await connector.fetchPayments(
        tokens,
        (integration.meta as Record<string, unknown>) ?? {},
        since,
      );
      const created = await this.prisma.externalPayment.createMany({
        data: payments.map((p) => ({
          businessId,
          provider,
          externalId: p.externalId,
          kind: p.kind,
          status: p.status,
          amount: new Prisma.Decimal(p.amount),
          currency: p.currency,
          occurredAt: new Date(p.occurredAt),
        })),
        skipDuplicates: true,
      });
      const message = `Read ${payments.length} transaction(s), ${created.count} new`;
      await this.runs.record(businessId, provider, {
        startedAt,
        success: true,
        processed: created.count,
        message,
      });
      return { provider, processed: created.count, failed: 0, message };
    } catch (error) {
      return this.failed(businessId, provider, startedAt, error);
    }
  }

  async syncAnalytics(businessId: string): Promise<CapabilitySyncResult> {
    const provider = IntegrationProvider.google_analytics;
    const startedAt = Date.now();
    const integration = await this.runs.requireRunnable(businessId, provider);
    const connector = this.connectors.get(provider);
    const tokens = await this.integrations.getTokens(businessId, provider);
    if (!tokens || !connector.fetchTraffic) {
      throw new AppException(
        'INTEGRATION_NOT_READY',
        'Google Analytics cannot be read right now',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const days = await connector.fetchTraffic(
        tokens,
        (integration.meta as Record<string, unknown>) ?? {},
        TRAFFIC_DAYS,
      );
      for (const d of days) {
        await this.prisma.webTrafficDaily.upsert({
          where: {
            businessId_provider_day: {
              businessId,
              provider,
              day: new Date(`${d.day}T00:00:00Z`),
            },
          },
          create: {
            businessId,
            provider,
            day: new Date(`${d.day}T00:00:00Z`),
            sessions: d.sessions,
            conversions: d.conversions,
          },
          update: { sessions: d.sessions, conversions: d.conversions },
        });
      }
      const message = `Imported ${days.length} day(s) of traffic`;
      await this.runs.record(businessId, provider, {
        startedAt,
        success: true,
        processed: days.length,
        message,
      });
      return { provider, processed: days.length, failed: 0, message };
    } catch (error) {
      return this.failed(businessId, provider, startedAt, error);
    }
  }

  async syncAudience(
    businessId: string,
    provider: IntegrationProvider,
  ): Promise<CapabilitySyncResult> {
    const startedAt = Date.now();
    const integration = await this.runs.requireRunnable(businessId, provider);
    const connector = this.connectors.get(provider);
    const tokens = await this.integrations.getTokens(businessId, provider);
    if (!tokens || !connector.pushContacts) {
      throw new AppException(
        'INTEGRATION_NOT_READY',
        `${provider} cannot receive contacts right now`,
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      // Only customers who consented to marketing, haven't opted out and are active are ever sent.
      const customers = await this.prisma.customer.findMany({
        where: {
          businessId,
          consentMarketing: true,
          optedOut: false,
          status: 'active',
          ...(provider === IntegrationProvider.mailchimp
            ? { email: { not: null } }
            : {}),
        },
        select: { name: true, email: true, phone: true },
        orderBy: { createdAt: 'asc' },
        take: AUDIENCE_BATCH,
      });
      const contacts: AudienceContact[] = customers.map((c) => {
        const [first, ...rest] = c.name.trim().split(/\s+/);
        return {
          email: c.email ?? undefined,
          phone: c.phone || undefined,
          firstName: first,
          lastName: rest.join(' ') || undefined,
        };
      });
      const result = await connector.pushContacts(
        tokens,
        (integration.meta as Record<string, unknown>) ?? {},
        contacts,
      );
      const message = `Sent ${result.pushed} contact(s)${result.failed ? `, ${result.failed} failed` : ''}`;
      await this.runs.record(businessId, provider, {
        startedAt,
        success: result.failed === 0,
        processed: result.pushed,
        failed: result.failed,
        message,
      });
      return {
        provider,
        processed: result.pushed,
        failed: result.failed,
        message,
      };
    } catch (error) {
      return this.failed(businessId, provider, startedAt, error);
    }
  }

  async syncMerchant(businessId: string): Promise<CapabilitySyncResult> {
    const provider = IntegrationProvider.merchant;
    const startedAt = Date.now();
    const integration = await this.runs.requireRunnable(businessId, provider);
    const connector = this.connectors.get(provider);
    const tokens = await this.integrations.getTokens(businessId, provider);
    if (!tokens || !connector.pushProducts) {
      throw new AppException(
        'INTEGRATION_NOT_READY',
        'Merchant Center cannot receive products right now',
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const [business, listing, products] = await Promise.all([
        this.prisma.business.findUniqueOrThrow({
          where: { id: businessId },
          select: { currency: true },
        }),
        this.prisma.masterListing.findFirst({
          where: { businessId },
          select: { website: true },
        }),
        this.prisma.product.findMany({
          where: {
            businessId,
            active: true,
            kind: 'product',
            sku: { not: null },
          },
          orderBy: { createdAt: 'asc' },
          take: MERCHANT_BATCH,
        }),
      ]);
      const website = listing?.website?.trim();
      if (!website) {
        throw new Error(
          'Add your website in Business Listings first — Google Shopping needs a link for every product',
        );
      }
      const inputs: CatalogProductInput[] = [];
      for (const p of products) {
        inputs.push({
          sku: p.sku as string,
          title: p.name,
          price: Number(p.sellingPrice),
          currency: business.currency,
          link: website,
          imageLink: p.photoKey
            ? await this.s3.getSignedDownloadUrl(p.photoKey)
            : undefined,
          inStock: p.stockQty > 0,
        });
      }
      const result = await connector.pushProducts(
        tokens,
        (integration.meta as Record<string, unknown>) ?? {},
        inputs,
      );
      const bySku = new Map(products.map((p) => [p.sku as string, p.id]));
      const failedSkus = new Map(
        result.errors.map((e) => [e.split(':')[0], e]),
      );
      for (const [sku, productId] of bySku) {
        const issue = failedSkus.get(sku);
        await this.prisma.productFeedItem.upsert({
          where: { businessId_productId: { businessId, productId } },
          create: {
            businessId,
            productId,
            syncState: issue ? 'error' : 'synced',
            issues: issue ? [issue] : [],
          },
          update: {
            syncState: issue ? 'error' : 'synced',
            issues: issue ? [issue] : [],
          },
        });
      }
      const message = `Published ${result.pushed} product(s)${result.failed ? `, ${result.failed} rejected` : ''}${result.errors[0] ? ` — ${result.errors[0]}` : ''}`;
      await this.runs.record(businessId, provider, {
        startedAt,
        success: result.failed === 0,
        processed: result.pushed,
        failed: result.failed,
        message,
      });
      return {
        provider,
        processed: result.pushed,
        failed: result.failed,
        message,
      };
    } catch (error) {
      return this.failed(businessId, provider, startedAt, error);
    }
  }

  private async failed(
    businessId: string,
    provider: IntegrationProvider,
    startedAt: number,
    error: unknown,
  ): Promise<CapabilitySyncResult> {
    const message = (error as Error).message;
    this.logger.warn(`Sync failed for provider=${provider}: ${message}`);
    await this.runs.record(businessId, provider, {
      startedAt,
      success: false,
      processed: 0,
      failed: 1,
      message,
    });
    return { provider, processed: 0, failed: 1, message };
  }
}
