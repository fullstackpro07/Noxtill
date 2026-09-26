import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { IntegrationsService } from '../integrations.service';
import { ConnectorRegistry } from '../connector-registry';
import { AppException } from '../../common/filters/app.exception';
import { AccountingInvoiceLine } from '../connector.interface';
import {
  ACCOUNTING_ERROR_CODES,
  ACCOUNTING_PROVIDERS,
  ACCOUNTING_SYNC_BATCH_SIZE,
} from './accounting.constants';
import { IntegrationStatus, OrderStatus } from '@prisma/client';

export interface AccountingSyncResult {
  provider: string;
  pushed: number;
  failed: number;
  results: Array<{
    orderId: string;
    orderNo: number;
    status: 'success' | 'failed';
    message?: string;
  }>;
}

/**
 * Accounting Sync (UPD-BE-072) — pushes real completed, not-yet-synced orders as real invoices to
 * whichever accounting provider is connected. Every line resolves through `AccountingMapping`
 * (category-specific row, falling back to the business's default row); an order with no matching
 * mapping and no default fails loudly for that one order rather than guessing an account code.
 */
@Injectable()
export class AccountingSyncService {
  private readonly logger = new Logger(AccountingSyncService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    private readonly connectors: ConnectorRegistry,
  ) {}

  /**
   * `orderIds` (Integrations redesign) retries just those orders — the per-record "Retry" on a
   * failed row — instead of the next batch. Without it, the batch is ordered so orders never tried
   * come first, then the least recently tried, so a permanently failing order can never starve
   * newer ones out of the batch.
   */
  async sync(
    businessId: string,
    opts: { orderIds?: string[] } = {},
  ): Promise<AccountingSyncResult> {
    const startedAt = Date.now();
    const integration = await this.tenantPrisma.client.integration.findFirst({
      where: {
        provider: { in: ACCOUNTING_PROVIDERS },
        status: IntegrationStatus.connected,
      },
    });
    if (!integration) {
      throw new AppException(
        ACCOUNTING_ERROR_CODES.NO_PROVIDER_CONNECTED,
        'Connect QuickBooks or Xero before syncing',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (integration.pausedAt) {
      throw new AppException(
        ACCOUNTING_ERROR_CODES.SYNC_PAUSED,
        `${integration.provider} sync is paused — resume it before posting`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const provider = integration.provider;
    const connector = this.connectors.get(provider);
    const tokens = await this.integrations.getTokens(businessId, provider);
    if (!tokens || !connector.pushInvoice) {
      throw new AppException(
        ACCOUNTING_ERROR_CODES.NO_PROVIDER_CONNECTED,
        `${provider} is connected but not ready to sync invoices`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const meta = integration.meta as Record<string, unknown>;

    const mappings = await this.tenantPrisma.client.accountingMapping.findMany({
      where: { businessId, provider },
    });
    const mappingByCategory = new Map(
      mappings
        .filter((m) => m.productCategory !== null)
        .map((m) => [m.productCategory as string, m]),
    );
    const defaultMapping = mappings.find((m) => m.productCategory === null);

    const orders = await this.tenantPrisma.client.order.findMany({
      where: {
        businessId,
        status: OrderStatus.completed,
        accountingSyncedAt: null,
        ...(opts.orderIds ? { id: { in: opts.orderIds } } : {}),
      },
      include: { items: { include: { product: true } }, customer: true },
      orderBy: [{ accountingSyncAttemptedAt: 'asc' }, { createdAt: 'asc' }],
      take: opts.orderIds ? opts.orderIds.length : ACCOUNTING_SYNC_BATCH_SIZE,
    });

    const result: AccountingSyncResult = {
      provider,
      pushed: 0,
      failed: 0,
      results: [],
    };

    for (const order of orders) {
      try {
        const lines: AccountingInvoiceLine[] = order.items.map((item) => {
          const category = item.product?.category ?? null;
          const mapping =
            (category && mappingByCategory.get(category)) || defaultMapping;
          if (!mapping) {
            throw new Error(
              `No accounting mapping for category "${category ?? '(none)'}" and no default mapping configured`,
            );
          }
          return {
            description: item.name,
            qty: item.qty,
            unitAmount: Number(item.price),
            accountCode: mapping.externalAccountCode,
            taxCode: mapping.externalTaxCode ?? undefined,
          };
        });

        const invoiceResult = await connector.pushInvoice(tokens, meta, {
          orderNo: order.orderNo,
          customerName: order.customer?.name,
          lines,
        });

        await this.tenantPrisma.client.order.update({
          where: { id: order.id },
          data: {
            accountingSyncedAt: new Date(),
            accountingExternalId: invoiceResult.externalId,
            accountingSyncError: null,
            accountingSyncAttemptedAt: new Date(),
          },
        });
        result.pushed += 1;
        result.results.push({
          orderId: order.id,
          orderNo: order.orderNo,
          status: 'success',
        });
      } catch (error) {
        const message = (error as Error).message;
        this.logger.warn(
          `Accounting push failed for order ${order.orderNo} (provider=${provider}): ${message}`,
        );
        result.failed += 1;
        result.results.push({
          orderId: order.id,
          orderNo: order.orderNo,
          status: 'failed',
          message,
        });
        // Integrations redesign — the reason is kept on the order itself, so a failed post is
        // visible per record (and its cause is fixable) instead of only in a server log.
        await this.tenantPrisma.client.order.update({
          where: { id: order.id },
          data: {
            accountingSyncError: message.slice(0, 500),
            accountingSyncAttemptedAt: new Date(),
          },
        });
      }
    }

    // Connection Detail depth fix — a real record of this sync attempt, so `GET
    // /integrations/:provider` has real activity to show, not a fabricated timeline.
    await this.tenantPrisma.client.integration.update({
      where: { businessId_provider: { businessId, provider } },
      data: { lastSyncAt: new Date() },
    });
    await this.tenantPrisma.client.integrationSyncLog.create({
      data: {
        businessId,
        provider,
        success: result.failed === 0,
        recordsProcessed: result.pushed,
        recordsFailed: result.failed,
        durationMs: Date.now() - startedAt,
        message:
          result.failed === 0
            ? `Pushed ${result.pushed} invoice(s)`
            : `Pushed ${result.pushed}, failed ${result.failed}`,
      },
    });

    return result;
  }
}
