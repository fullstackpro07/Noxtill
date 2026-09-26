import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { AppException } from '../../common/filters/app.exception';
import { IntegrationAuditService } from '../integration-audit.service';
import { IntegrationsService } from '../integrations.service';
import { ConnectorRegistry } from '../connector-registry';
import {
  Connector,
  EcommerceProduct,
  OAuthTokens,
} from '../connector.interface';
import {
  ECOMMERCE_FETCH_LIMIT,
  ECOMMERCE_PROVIDERS,
  ECOMMERCE_ERROR_CODES,
  SOURCE_OF_TRUTH_DEFAULT,
  type SourceOfTruth,
  isSourceOfTruth,
} from './ecommerce.constants';
import {
  IntegrationProvider,
  IntegrationStatus,
  OrderStatus,
  OrderType,
  Prisma,
  StockMovementKind,
} from '@prisma/client';

export interface ProductConflictResult {
  sku: string;
  /** `none` = queued for the owner (source of truth "manual") - neither side was changed. */
  winner: 'local' | 'remote' | 'none';
  localQty: number;
  remoteQty: number;
}

export interface EcommerceSyncResult {
  provider: string;
  productsReconciled: number;
  conflicts: ProductConflictResult[];
  ordersImported: number;
}

/**
 * E-commerce Sync (UPD-BE-073) — real two-way stock reconciliation. Which side wins when both
 * differ is the connection's own "source of truth" setting (Integrations redesign): `noxtill`
 * (default — Noxtill's stock is pushed to the store), `store` (the store's stock is applied
 * locally), or `manual` (neither side is touched; the difference is queued as a pending conflict
 * for the owner to resolve). Plus a real, deliberately one-directional order pull: a platform sale
 * reduces stock the business's own POS also sells from, so it needs to appear as a real local
 * `Order` (tagged `orderType: online`, deduped by `(provider, externalId)`); pushing a walk-in POS
 * sale back into Shopify/WooCommerce as a fabricated online order is not something any real
 * business wants, so that direction is a disclosed scope boundary, not an oversight.
 */
@Injectable()
export class EcommerceSyncService {
  private readonly logger = new Logger(EcommerceSyncService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrations: IntegrationsService,
    private readonly connectors: ConnectorRegistry,
    private readonly audit: IntegrationAuditService,
  ) {}

  /** E-commerce conflict history depth fix — the real, persisted conflict log, most recent first. */
  listConflicts(
    businessId: string,
    provider?: IntegrationProvider,
    status?: 'pending' | 'resolved' | 'auto',
  ) {
    return this.tenantPrisma.client.ecommerceSyncConflict.findMany({
      where: {
        businessId,
        ...(provider ? { provider } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** The connection's source-of-truth setting; `noxtill` until the owner changes it. */
  async sourceOfTruth(
    businessId: string,
    provider: IntegrationProvider,
  ): Promise<SourceOfTruth> {
    const row = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider } },
    });
    const value = (row?.meta as Record<string, unknown> | null)?.sourceOfTruth;
    return isSourceOfTruth(value) ? value : SOURCE_OF_TRUTH_DEFAULT;
  }

  async setSourceOfTruth(
    businessId: string,
    actorUserId: string | undefined,
    provider: IntegrationProvider,
    value: SourceOfTruth,
  ) {
    const row = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider } },
    });
    if (!row || row.status === IntegrationStatus.not_connected) {
      throw new AppException(
        ECOMMERCE_ERROR_CODES.NOT_CONNECTED,
        `${provider} is not connected`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const before = await this.sourceOfTruth(businessId, provider);
    await this.tenantPrisma.client.integration.update({
      where: { businessId_provider: { businessId, provider } },
      data: {
        meta: {
          ...((row.meta as Record<string, unknown>) ?? {}),
          sourceOfTruth: value,
        },
      },
    });
    await this.audit.record({
      businessId,
      key: provider,
      action: 'integration.source_of_truth_changed',
      actorUserId,
      before: { sourceOfTruth: before },
      after: { sourceOfTruth: value },
    });
    return { sourceOfTruth: value };
  }

  /**
   * Resolves one pending conflict the owner chose a side for. `noxtill` pushes Noxtill's current
   * stock to the store; `store` applies the store's quantity locally (as a stock movement);
   * `custom` sets both sides to the quantity the owner typed. Every resolution is audited.
   */
  async resolveConflict(
    businessId: string,
    actorUserId: string | undefined,
    conflictId: string,
    choice: 'noxtill' | 'store' | 'custom',
    qty?: number,
  ) {
    const conflict =
      await this.tenantPrisma.client.ecommerceSyncConflict.findFirst({
        where: { id: conflictId, businessId },
      });
    if (!conflict) {
      throw new AppException(
        ECOMMERCE_ERROR_CODES.CONFLICT_NOT_FOUND,
        'Conflict not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (conflict.status !== 'pending') {
      throw new AppException(
        ECOMMERCE_ERROR_CODES.CONFLICT_NOT_PENDING,
        'This conflict has already been resolved',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      choice === 'custom' &&
      (!Number.isInteger(qty) || (qty as number) < 0)
    ) {
      throw new AppException(
        ECOMMERCE_ERROR_CODES.INVALID_QTY,
        'Enter a whole number of units, zero or more',
        HttpStatus.BAD_REQUEST,
      );
    }

    const product = await this.tenantPrisma.client.product.findFirst({
      where: { businessId, sku: conflict.sku },
    });
    if (!product) {
      throw new AppException(
        ECOMMERCE_ERROR_CODES.PRODUCT_NOT_FOUND,
        `No Noxtill product with SKU ${conflict.sku}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const provider = conflict.provider;
    const connector = this.connectors.get(provider);
    const tokens = await this.integrations.getTokens(businessId, provider);
    const integration = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider } },
    });
    const meta = (integration?.meta as Record<string, unknown>) ?? {};

    const target =
      choice === 'noxtill'
        ? product.stockQty
        : choice === 'store'
          ? conflict.remoteQty
          : (qty as number);

    // Push to the store first when the store's number changes, so a failed push leaves the
    // conflict pending instead of half-applied.
    if (choice !== 'store') {
      if (!tokens || !connector.pushInventory) {
        throw new AppException(
          ECOMMERCE_ERROR_CODES.PUSH_FAILED,
          `${provider} cannot receive stock updates right now`,
          HttpStatus.BAD_GATEWAY,
        );
      }
      try {
        await connector.pushInventory(tokens, meta, conflict.sku, target);
      } catch (error) {
        throw new AppException(
          ECOMMERCE_ERROR_CODES.PUSH_FAILED,
          `The store rejected the update: ${(error as Error).message}`,
          HttpStatus.BAD_GATEWAY,
        );
      }
    }
    if (target !== product.stockQty) {
      await this.tenantPrisma.client.product.update({
        where: { id: product.id },
        data: { stockQty: target },
      });
      await this.tenantPrisma.client.stockMovement.create({
        data: {
          businessId,
          productId: product.id,
          kind: StockMovementKind.adjustment,
          qty: target - product.stockQty,
          reason: `E-commerce conflict resolved (${provider}): ${
            choice === 'store'
              ? 'store quantity applied'
              : choice === 'custom'
                ? 'quantity set by owner'
                : 'Noxtill quantity kept'
          }`,
        },
      });
    }
    const resolved =
      await this.tenantPrisma.client.ecommerceSyncConflict.update({
        where: { id: conflict.id },
        data: {
          status: 'resolved',
          resolution: choice,
          resolvedQty: target,
          resolvedAt: new Date(),
          resolvedByUserId: actorUserId,
          winner: choice === 'store' ? 'remote' : 'local',
        },
      });
    await this.audit.record({
      businessId,
      key: provider,
      action: 'integration.conflict_resolved',
      actorUserId,
      after: { sku: conflict.sku, choice, quantity: target },
    });
    return resolved;
  }

  async sync(businessId: string): Promise<EcommerceSyncResult[]> {
    const integrations = await this.tenantPrisma.client.integration.findMany({
      where: {
        provider: { in: ECOMMERCE_PROVIDERS },
        status: IntegrationStatus.connected,
        pausedAt: null,
      },
    });

    const results: EcommerceSyncResult[] = [];
    for (const integration of integrations) {
      results.push(await this.syncProvider(businessId, integration.provider));
    }
    return results;
  }

  private async syncProvider(
    businessId: string,
    provider: IntegrationProvider,
  ): Promise<EcommerceSyncResult> {
    const connector = this.connectors.get(provider);
    const tokens = await this.integrations.getTokens(businessId, provider);
    const integration = await this.tenantPrisma.client.integration.findUnique({
      where: { businessId_provider: { businessId, provider } },
    });
    const meta = (integration?.meta as Record<string, unknown>) ?? {};

    const result: EcommerceSyncResult = {
      provider,
      productsReconciled: 0,
      conflicts: [],
      ordersImported: 0,
    };
    if (!tokens || !connector.fetchProducts || !connector.fetchOrders)
      return result;
    const startedAt = Date.now();
    const sourceOfTruth = await this.sourceOfTruth(businessId, provider);

    const stockFetchOk = await this.reconcileStock(
      businessId,
      provider,
      connector,
      tokens,
      meta,
      result,
      sourceOfTruth,
    );
    const ordersFetchOk = await this.importOrders(
      businessId,
      provider,
      connector,
      tokens,
      meta,
      result,
    );

    // Connection Detail depth fix — a real record of this sync attempt. `success` reflects
    // whether the real fetches actually reached the provider, not just that nothing threw —
    // `reconcileStock`/`importOrders` log-and-return on a fetch failure rather than throwing, so
    // checking their own outcome (not just "no exception") is what keeps this honest.
    await this.tenantPrisma.client.integration.update({
      where: { businessId_provider: { businessId, provider } },
      data: { lastSyncAt: new Date() },
    });
    await this.tenantPrisma.client.integrationSyncLog.create({
      data: {
        businessId,
        provider,
        success: stockFetchOk && ordersFetchOk,
        recordsProcessed: result.productsReconciled + result.ordersImported,
        durationMs: Date.now() - startedAt,
        details: {
          productsReconciled: result.productsReconciled,
          ordersImported: result.ordersImported,
          conflictsQueued: result.conflicts.filter((c) => c.winner === 'none')
            .length,
          conflictsAutoResolved: result.conflicts.filter(
            (c) => c.winner !== 'none',
          ).length,
          sourceOfTruth,
        },
        message:
          stockFetchOk && ordersFetchOk
            ? `Reconciled ${result.productsReconciled} product(s), imported ${result.ordersImported} order(s)`
            : 'One or more real fetches from the provider failed — see server logs',
      },
    });

    return result;
  }

  private async reconcileStock(
    businessId: string,
    provider: IntegrationProvider,
    connector: Connector,
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    result: EcommerceSyncResult,
    sourceOfTruth: SourceOfTruth,
  ): Promise<boolean> {
    let remoteProducts: EcommerceProduct[];
    try {
      remoteProducts = await connector.fetchProducts!(tokens, meta);
    } catch (error) {
      this.logger.warn(
        `E-commerce product fetch failed for provider=${provider}: ${(error as Error).message}`,
      );
      return false;
    }

    for (const remoteProduct of remoteProducts.slice(
      0,
      ECOMMERCE_FETCH_LIMIT,
    )) {
      const localProduct = await this.tenantPrisma.client.product.findFirst({
        where: { businessId, sku: remoteProduct.sku },
      });
      if (!localProduct) continue;

      const remoteUpdatedAt = new Date(remoteProduct.updatedAt);
      result.productsReconciled += 1;

      if (remoteProduct.quantity === localProduct.stockQty) {
        // Both sides agree again - a queued conflict for this SKU no longer needs a decision.
        await this.tenantPrisma.client.ecommerceSyncConflict.updateMany({
          where: {
            businessId,
            provider,
            sku: remoteProduct.sku,
            status: 'pending',
          },
          data: {
            status: 'resolved',
            resolution: 'matched',
            resolvedQty: localProduct.stockQty,
            resolvedAt: new Date(),
          },
        });
        continue; // already in sync
      }

      const conflictData = {
        businessId,
        provider,
        sku: remoteProduct.sku,
        productId: localProduct.id,
        productName: localProduct.name,
        localQty: localProduct.stockQty,
        remoteQty: remoteProduct.quantity,
        localUpdatedAt: localProduct.updatedAt,
        remoteUpdatedAt,
      };

      if (sourceOfTruth === 'manual') {
        // Queue it: neither side is changed until the owner resolves it. A SKU already waiting
        // gets its numbers refreshed instead of a duplicate row.
        const waiting =
          await this.tenantPrisma.client.ecommerceSyncConflict.findFirst({
            where: {
              businessId,
              provider,
              sku: remoteProduct.sku,
              status: 'pending',
            },
          });
        if (waiting) {
          await this.tenantPrisma.client.ecommerceSyncConflict.update({
            where: { id: waiting.id },
            data: {
              localQty: conflictData.localQty,
              remoteQty: conflictData.remoteQty,
              localUpdatedAt: conflictData.localUpdatedAt,
              remoteUpdatedAt: conflictData.remoteUpdatedAt,
            },
          });
        } else {
          await this.tenantPrisma.client.ecommerceSyncConflict.create({
            data: { ...conflictData, winner: 'none', status: 'pending' },
          });
        }
        result.conflicts.push({
          sku: remoteProduct.sku,
          winner: 'none',
          localQty: localProduct.stockQty,
          remoteQty: remoteProduct.quantity,
        });
        continue;
      }

      const remoteWins = sourceOfTruth === 'store';
      result.conflicts.push({
        sku: remoteProduct.sku,
        winner: remoteWins ? 'remote' : 'local',
        localQty: localProduct.stockQty,
        remoteQty: remoteProduct.quantity,
      });
      // E-commerce conflict history depth fix - a real, persisted row per real conflict, so
      // Connection Detail has a real browsable log rather than only this run's own response.
      await this.tenantPrisma.client.ecommerceSyncConflict.create({
        data: {
          ...conflictData,
          winner: remoteWins ? 'remote' : 'local',
          status: 'auto',
          resolution: sourceOfTruth,
        },
      });

      if (remoteWins) {
        const delta = remoteProduct.quantity - localProduct.stockQty;
        await this.tenantPrisma.client.product.update({
          where: { id: localProduct.id },
          data: { stockQty: remoteProduct.quantity },
        });
        await this.tenantPrisma.client.stockMovement.create({
          data: {
            businessId,
            productId: localProduct.id,
            kind: StockMovementKind.adjustment,
            qty: delta,
            reason: `E-commerce sync (${provider}): the store is the source of truth`,
          },
        });
      } else if (connector.pushInventory) {
        await connector
          .pushInventory(tokens, meta, remoteProduct.sku, localProduct.stockQty)
          .catch((error: Error) =>
            this.logger.warn(
              `Inventory push failed for SKU ${remoteProduct.sku} (provider=${provider}): ${error.message}`,
            ),
          );
      }
    }
    return true;
  }

  private async importOrders(
    businessId: string,
    provider: IntegrationProvider,
    connector: Connector,
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    result: EcommerceSyncResult,
  ): Promise<boolean> {
    const lastImported = await this.tenantPrisma.client.order.findFirst({
      where: { businessId, externalProvider: provider },
      orderBy: { createdAt: 'desc' },
    });

    let remoteOrders: Awaited<
      ReturnType<NonNullable<Connector['fetchOrders']>>
    >;
    try {
      remoteOrders = await connector.fetchOrders!(
        tokens,
        meta,
        lastImported?.createdAt.toISOString(),
      );
    } catch (error) {
      this.logger.warn(
        `E-commerce order fetch failed for provider=${provider}: ${(error as Error).message}`,
      );
      return false;
    }

    for (const remoteOrder of remoteOrders.slice(0, ECOMMERCE_FETCH_LIMIT)) {
      const existing = await this.tenantPrisma.client.order.findUnique({
        where: {
          businessId_externalProvider_externalId: {
            businessId,
            externalProvider: provider,
            externalId: remoteOrder.externalId,
          },
        },
      });
      if (existing) continue;

      await this.tenantPrisma.client.$transaction(async (tx) => {
        const [{ next: orderNoRaw }] = await tx.$queryRaw<{ next: bigint }[]>`
          SELECT COALESCE(MAX(order_no), 0) + 1 AS next FROM orders WHERE business_id = ${businessId}
        `;
        const orderNo = Number(orderNoRaw);

        const skus = remoteOrder.lines
          .map((l) => l.sku)
          .filter((sku): sku is string => !!sku);
        const matchedProducts = skus.length
          ? await tx.product.findMany({
              where: { businessId, sku: { in: skus } },
            })
          : [];
        const productBySku = new Map(matchedProducts.map((p) => [p.sku, p]));

        await tx.order.create({
          data: {
            businessId,
            orderNo,
            orderType: OrderType.online,
            status: OrderStatus.completed,
            subtotal: remoteOrder.subtotal,
            tax: remoteOrder.tax,
            total: remoteOrder.total,
            externalId: remoteOrder.externalId,
            externalProvider: provider,
            createdAt: new Date(remoteOrder.createdAt),
            items: {
              create: remoteOrder.lines.map((line) => ({
                productId: line.sku
                  ? productBySku.get(line.sku)?.id
                  : undefined,
                name: line.name,
                price: line.price,
                cost:
                  productBySku.get(line.sku ?? '')?.costPrice ??
                  new Prisma.Decimal(0),
                qty: line.qty,
              })),
            },
          },
        });
      });
      result.ordersImported += 1;
    }
    return true;
  }
}
