import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CommerceChannelListingStatus,
  IntegrationProvider,
  IntegrationStatus,
  Prisma,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { IntegrationsService } from '../integrations/integrations.service';

export const COMMERCE_RECON_ERROR_CODES = {
  NOT_FOUND: 'COMMERCE_RECON_ITEM_NOT_FOUND',
  CLOSED: 'COMMERCE_RECON_ITEM_CLOSED',
  NOTE_REQUIRED: 'COMMERCE_RECON_NOTE_REQUIRED',
} as const;

/**
 * Channel-listing reconciliation (backend spec §13.2). For each provider with synced channel
 * listings, reads the provider's products (SKU + stock — all the connectors return today) and
 * compares them with Noxtill's records by SKU. Discrepancies become items; canonical data is never
 * changed here. Price, title and content drift cannot be checked because the connectors don't read
 * them back.
 */
@Injectable()
export class CommerceReconciliationService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    private readonly connectors: ConnectorRegistry,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  async run(businessId: string, actorUserId: string) {
    const listings = await this.db.commerceChannelListing.findMany({
      where: { businessId, status: CommerceChannelListingStatus.synced },
      select: {
        id: true,
        provider: true,
        externalProductId: true,
        product: {
          select: { id: true, name: true, sku: true, stockQty: true },
        },
      },
    });
    const providers = [...new Set(listings.map((row) => row.provider))];
    const runs: Prisma.CommerceReconciliationRunGetPayload<object>[] = [];
    for (const provider of providers) {
      runs.push(
        await this.runProvider(
          businessId,
          actorUserId,
          provider,
          listings.filter((row) => row.provider === provider),
        ),
      );
    }
    return { runs };
  }

  private async runProvider(
    businessId: string,
    actorUserId: string,
    provider: IntegrationProvider,
    listings: {
      id: string;
      externalProductId: string | null;
      product: {
        id: string;
        name: string;
        sku: string | null;
        stockQty: number;
      };
    }[],
  ) {
    const start = (status: string, detail: string) =>
      this.db.commerceReconciliationRun.create({
        data: {
          businessId,
          provider,
          status,
          detail,
          actorUserId,
          listingsChecked: 0,
          finishedAt: new Date(),
        },
      });
    const integration = await this.db.integration.findUnique({
      where: { businessId_provider: { businessId, provider } },
      select: { status: true, meta: true },
    });
    if (integration?.status !== IntegrationStatus.connected) {
      return start('skipped', `${provider} is not connected.`);
    }
    const connector = this.connectors.get(provider);
    if (!connector.fetchProducts) {
      return start(
        'skipped',
        `The ${provider} connector cannot read products back, so its listings can't be reconciled.`,
      );
    }
    const tokens = await this.integrations.getTokens(businessId, provider);
    if (!tokens)
      return start('skipped', `Reconnect ${provider} to read its products.`);

    let remote: { sku: string; quantity: number }[];
    try {
      remote = await connector.fetchProducts(
        tokens,
        (integration.meta as Record<string, unknown> | null) ?? {},
      );
    } catch {
      return start(
        'failed',
        `${provider} did not return its products. Nothing was changed.`,
      );
    }
    const bySku = new Map(
      remote.map((row) => [row.sku.trim().toLowerCase(), row]),
    );
    const items: Prisma.CommerceReconciliationItemCreateManyRunInput[] = [];
    for (const listing of listings) {
      const local = {
        productId: listing.product.id,
        name: listing.product.name,
        sku: listing.product.sku,
        stockQty: listing.product.stockQty,
        externalProductId: listing.externalProductId,
      };
      const base = {
        businessId,
        channelListingId: listing.id,
        provider,
        local,
      };
      const sku = listing.product.sku?.trim().toLowerCase();
      if (!sku) {
        items.push({ ...base, kind: 'no_sku' });
        continue;
      }
      const match = bySku.get(sku);
      if (!match) {
        items.push({ ...base, kind: 'missing_on_provider' });
      } else if (match.quantity !== listing.product.stockQty) {
        items.push({
          ...base,
          kind: 'stock_mismatch',
          remote: { sku: match.sku, quantity: match.quantity },
        });
      }
    }
    return this.db.commerceReconciliationRun.create({
      data: {
        businessId,
        provider,
        status: 'completed',
        listingsChecked: listings.length,
        discrepancies: items.length,
        detail: `Compared ${listings.length} synced listing(s) with ${remote.length} provider SKU(s).`,
        actorUserId,
        finishedAt: new Date(),
        items: { createMany: { data: items } },
      },
    });
  }

  async overview(businessId: string) {
    const [runs, items] = await Promise.all([
      this.db.commerceReconciliationRun.findMany({
        where: { businessId },
        orderBy: { startedAt: 'desc' },
        take: 20,
      }),
      this.db.commerceReconciliationItem.findMany({
        where: { businessId },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 300,
      }),
    ]);
    return {
      runs,
      items,
      openItems: items.filter((item) => item.status === 'open').length,
      checks: {
        presence:
          'Checked: is each synced product still on the store (by SKU)?',
        stock: 'Checked: does the store’s stock match Noxtill’s?',
        notChecked:
          'Not checked: price, title, description and images — the connectors do not read them back.',
      },
    };
  }

  async decide(
    businessId: string,
    actorUserId: string,
    id: string,
    status: 'resolved' | 'dismissed',
    note: string,
  ) {
    const item = await this.db.commerceReconciliationItem.findFirst({
      where: { id, businessId },
    });
    if (!item) {
      throw new AppException(
        COMMERCE_RECON_ERROR_CODES.NOT_FOUND,
        'Reconciliation item was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (item.status !== 'open') {
      throw new AppException(
        COMMERCE_RECON_ERROR_CODES.CLOSED,
        'This item is already closed.',
        HttpStatus.CONFLICT,
      );
    }
    if (!note.trim()) {
      throw new AppException(
        COMMERCE_RECON_ERROR_CODES.NOTE_REQUIRED,
        'Record what was done or why it is dismissed.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.db.commerceReconciliationItem.update({
      where: { id, businessId },
      data: {
        status,
        resolutionNote: note.trim(),
        resolvedByUserId: actorUserId,
        resolvedAt: new Date(),
      },
    });
  }
}
