import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CommerceChannelListingStatus,
  CommerceListingDraftStatus,
  IntegrationProvider,
  IntegrationStatus,
  Prisma,
} from '@prisma/client';
import { IntegrationsService } from '../integrations/integrations.service';
import { ConnectorRegistry } from '../integrations/connector-registry';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { COMMERCE_LISTING_ERROR_CODES } from './commerce.constants';

type Provider =
  typeof IntegrationProvider.shopify | typeof IntegrationProvider.woocommerce;

type SavedChannelListing = Prisma.CommerceChannelListingGetPayload<object>;

function parseProvider(value: string): Provider {
  if (
    value === IntegrationProvider.shopify ||
    value === IntegrationProvider.woocommerce
  ) {
    return value;
  }
  throw new AppException(
    COMMERCE_LISTING_ERROR_CODES.CHANNEL_NOT_SUPPORTED,
    'Unpublished listing sync is currently supported for connected Shopify and WooCommerce stores only.',
    HttpStatus.BAD_REQUEST,
  );
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasUnmappedVariants(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  const item = record(value);
  return item !== null && Object.keys(item).length > 0;
}

function groundedText(value: unknown, sourceIds: Set<string>): string | null {
  const item = record(value);
  if (
    !item ||
    typeof item.text !== 'string' ||
    !item.text.trim() ||
    !Array.isArray(item.sourceIds) ||
    item.sourceIds.length === 0 ||
    item.sourceIds.some(
      (sourceId) => typeof sourceId !== 'string' || !sourceIds.has(sourceId),
    )
  ) {
    return null;
  }
  return item.text.trim();
}

function canonicalSourceFactsMatch(
  value: Prisma.JsonValue,
  product: {
    name: string;
    category: string | null;
    sellingPrice: Prisma.Decimal;
  },
): boolean {
  if (!Array.isArray(value)) return false;
  const actualById = new Map<string, string | null>([
    ['product_name', product.name],
    ['product_category', product.category],
    ['product_selling_price', String(Number(product.sellingPrice))],
  ]);
  for (const source of value) {
    const item = record(source);
    if (item?.origin !== 'canonical_product') {
      continue;
    }
    if (
      typeof item.id !== 'string' ||
      typeof item.value !== 'string' ||
      !actualById.has(item.id) ||
      item.value !== actualById.get(item.id)
    ) {
      return false;
    }
  }
  return true;
}

function providerErrorStatus(error: unknown): number | null {
  const response = record(record(error)?.response);
  return typeof response?.status === 'number' ? response.status : null;
}

function safeProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('already used by a product not linked')) {
    return 'The generated Shopify handle belongs to another product. Change the handle in the provider store or contact support.';
  }
  if (message.includes('already used by a WooCommerce product not linked')) {
    return 'This SKU is already used by another WooCommerce product. Resolve the SKU conflict before syncing.';
  }
  const status = providerErrorStatus(error);
  return status
    ? `The provider returned HTTP ${status}. Check its connection and required product-write permission.`
    : 'The provider did not confirm the draft. Check the connection and required product-write permission, then retry.';
}

@Injectable()
export class CommerceChannelListingsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    private readonly connectors: ConnectorRegistry,
  ) {}

  async list(businessId: string) {
    const listings =
      await this.tenantPrisma.client.commerceChannelListing.findMany({
        where: { businessId },
        include: {
          product: {
            select: { id: true, name: true, sku: true, sellingPrice: true },
          },
          draft: {
            select: {
              id: true,
              channel: true,
              market: true,
              status: true,
              currentVersion: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 200,
      });
    return listings.map((listing) => ({
      id: listing.id,
      draftId: listing.draftId,
      product: {
        ...listing.product,
        sellingPrice: Number(listing.product.sellingPrice),
      },
      channel: listing.draft.channel,
      provider: listing.provider,
      market: listing.draft.market,
      // Lets the UI tell "re-sync now" apart from "a newer version still needs human review".
      draftStatus: listing.draft.status,
      externalProductId: listing.externalProductId,
      syncedVersion: listing.syncedVersion,
      currentVersion: listing.draft.currentVersion,
      outOfDate: listing.syncedVersion !== listing.draft.currentVersion,
      sellingPriceAtSync:
        listing.sellingPriceAtSync === null
          ? null
          : Number(listing.sellingPriceAtSync),
      priceOutOfDate:
        listing.sellingPriceAtSync === null ||
        !listing.sellingPriceAtSync.equals(listing.product.sellingPrice),
      status: listing.status,
      lastSyncedAt: listing.lastSyncedAt,
      lastError: listing.lastError,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
    }));
  }

  async syncApprovedDraft(
    businessId: string,
    actorUserId: string,
    draftId: string,
    providerValue: string,
  ) {
    const provider = parseProvider(providerValue);
    const draft = await this.tenantPrisma.client.commerceListingDraft.findFirst(
      {
        where: { id: draftId, businessId },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              category: true,
              sku: true,
              sellingPrice: true,
              active: true,
              variations: true,
            },
          },
        },
      },
    );
    if (!draft) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.NOT_FOUND,
        'Listing draft was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (draft.channel.trim().toLowerCase() !== provider) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.CHANNEL_NOT_SUPPORTED,
        `This draft targets ${draft.channel}. Generate a draft for ${provider} before syncing it there.`,
        HttpStatus.CONFLICT,
      );
    }
    if (draft.status !== CommerceListingDraftStatus.approved) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.INVALID_STATE,
        'Review and approve the current listing version before syncing it to a channel.',
        HttpStatus.CONFLICT,
      );
    }
    if (!draft.product.active) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.INVALID_STATE,
        'An inactive canonical product cannot be sent to a sales channel.',
        HttpStatus.CONFLICT,
      );
    }
    if (!draft.product.sku?.trim()) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.INVALID_STATE,
        'Add a canonical SKU in Products before syncing this listing.',
        HttpStatus.CONFLICT,
      );
    }
    if (!(Number(draft.product.sellingPrice) > 0)) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.INVALID_STATE,
        'Set a positive canonical selling price in Products before syncing this listing.',
        HttpStatus.CONFLICT,
      );
    }
    if (hasUnmappedVariants(draft.product.variations)) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.INVALID_STATE,
        'Variant mapping is not implemented yet. This sync supports one canonical SKU per product.',
        HttpStatus.CONFLICT,
      );
    }

    const version =
      await this.tenantPrisma.client.commerceListingDraftVersion.findFirst({
        where: {
          businessId,
          draftId,
          version: draft.currentVersion,
          approvedAt: { not: null },
        },
      });
    if (!version || !version.approvedByUserId || !version.approvalReason) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.INVALID_STATE,
        'The current version does not have a recorded human approval.',
        HttpStatus.CONFLICT,
      );
    }
    if (!canonicalSourceFactsMatch(version.sources, draft.product)) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.INVALID_STATE,
        'Canonical product facts changed after this version was approved. Generate a new version from the current product data and review it before syncing.',
        HttpStatus.CONFLICT,
      );
    }
    const sources = Array.isArray(version.sources)
      ? version.sources.flatMap((source) => {
          const item = record(source);
          return typeof item?.id === 'string' ? [item.id] : [];
        })
      : [];
    const content = record(version.content);
    const sourceIds = new Set(sources);
    const title = groundedText(content?.title, sourceIds);
    const description = groundedText(content?.description, sourceIds);
    if (
      !title ||
      !description ||
      title.length > 255 ||
      description.length > 5000
    ) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.INVALID_CONTENT,
        'The approved title and description must be valid and grounded in recorded sources.',
        HttpStatus.CONFLICT,
      );
    }

    const integration = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider } },
      select: { status: true, meta: true },
    });
    if (integration?.status !== IntegrationStatus.connected) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.CHANNEL_NOT_CONNECTED,
        `Connect ${provider} before syncing this approved listing.`,
        HttpStatus.CONFLICT,
      );
    }
    const connector = this.connectors.get(provider);
    if (!connector.upsertListingDraft) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.CHANNEL_NOT_SUPPORTED,
        `The ${provider} connector does not support product listing sync.`,
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    const tokens = await this.integrations.getTokens(businessId, provider);
    if (!tokens) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.CHANNEL_NOT_CONNECTED,
        `Reconnect ${provider} to provide a valid product-write credential.`,
        HttpStatus.CONFLICT,
      );
    }

    const meta = (integration.meta as Record<string, unknown> | null) ?? {};
    const existing =
      await this.tenantPrisma.client.commerceChannelListing.findUnique({
        where: {
          businessId_draftId_provider: { businessId, draftId, provider },
        },
      });
    const listing =
      await this.tenantPrisma.client.commerceChannelListing.upsert({
        where: {
          businessId_draftId_provider: { businessId, draftId, provider },
        },
        create: {
          businessId,
          draftId,
          productId: draft.product.id,
          provider,
          status: CommerceChannelListingStatus.pending,
        },
        update: {
          status: CommerceChannelListingStatus.pending,
          lastError: null,
        },
      });

    let result: { externalProductId: string };
    try {
      result = await connector.upsertListingDraft(
        tokens,
        meta,
        {
          businessId,
          productId: draft.product.id,
          handle: `noxtill-${businessId}-${draft.product.id}`,
          sku: draft.product.sku.trim(),
          title,
          description,
          sellingPrice: Number(draft.product.sellingPrice),
        },
        listing.externalProductId ?? existing?.externalProductId ?? undefined,
      );
    } catch (error) {
      const message = safeProviderError(error);
      await this.tenantPrisma.client.commerceChannelListing.update({
        where: { id: listing.id, businessId },
        data: {
          status: CommerceChannelListingStatus.failed,
          lastError: message,
        },
      });
      await this.tenantPrisma.client.commerceListingDraftAudit.create({
        data: {
          businessId,
          draftId,
          action: 'channel_sync_failed',
          reason: message,
          actorUserId,
          after: {
            provider,
            version: version.version,
            status: CommerceChannelListingStatus.failed,
          } as Prisma.InputJsonValue,
        },
      });
      await this.tenantPrisma.client.integrationSyncLog.create({
        data: {
          businessId,
          provider,
          success: false,
          recordsProcessed: 0,
          message,
        },
      });
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.PROVIDER_SYNC_FAILED,
        message,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const syncedAt = new Date();
    let savedListing: SavedChannelListing;
    try {
      savedListing = await this.tenantPrisma.client.$transaction(async (tx) => {
        const updated = await tx.commerceChannelListing.update({
          where: { id: listing.id, businessId },
          data: {
            externalProductId: result.externalProductId,
            syncedVersion: version.version,
            sellingPriceAtSync: draft.product.sellingPrice,
            status: CommerceChannelListingStatus.synced,
            lastSyncedAt: syncedAt,
            lastError: null,
          },
        });
        await tx.commerceListingDraftAudit.create({
          data: {
            businessId,
            draftId,
            action: 'channel_sync_succeeded',
            actorUserId,
            after: {
              provider,
              version: version.version,
              externalProductId: result.externalProductId,
              status: CommerceChannelListingStatus.synced,
            } as Prisma.InputJsonValue,
          },
        });
        await tx.integration.update({
          where: { businessId_provider: { businessId, provider } },
          data: { lastSyncAt: syncedAt },
        });
        await tx.integrationSyncLog.create({
          data: {
            businessId,
            provider,
            success: true,
            recordsProcessed: 1,
            message: `Synced approved product listing draft ${draft.id} version ${version.version}`,
          },
        });
        return updated;
      });
    } catch {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.PROVIDER_SYNC_FAILED,
        'The provider acknowledged the listing, but Noxtill could not save the sync result. Retry safely; this operation uses stable product identifiers to avoid creating duplicates.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return {
      id: savedListing.id,
      draftId: savedListing.draftId,
      provider: savedListing.provider,
      externalProductId: savedListing.externalProductId,
      status: savedListing.status,
      syncedVersion: savedListing.syncedVersion,
      currentVersion: draft.currentVersion,
      sellingPriceAtSync: Number(savedListing.sellingPriceAtSync),
      lastSyncedAt: savedListing.lastSyncedAt,
      outOfDate: savedListing.syncedVersion !== draft.currentVersion,
    };
  }
}
