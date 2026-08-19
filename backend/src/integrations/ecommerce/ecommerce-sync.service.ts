import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
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
  winner: 'local' | 'remote';
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
 * E-commerce Sync (UPD-BE-073) — real two-way stock reconciliation (whichever side's record was
 * more recently updated wins; the loser gets overwritten and, when the local side lost, pushed
 * back to the platform) plus a real, deliberately one-directional order pull: a platform sale
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
  ) {}

  async sync(businessId: string): Promise<EcommerceSyncResult[]> {
    const integrations = await this.tenantPrisma.client.integration.findMany({
      where: {
        provider: { in: ECOMMERCE_PROVIDERS },
        status: IntegrationStatus.connected,
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

    await this.reconcileStock(
      businessId,
      provider,
      connector,
      tokens,
      meta,
      result,
    );
    await this.importOrders(
      businessId,
      provider,
      connector,
      tokens,
      meta,
      result,
    );
    return result;
  }

  private async reconcileStock(
    businessId: string,
    provider: IntegrationProvider,
    connector: Connector,
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    result: EcommerceSyncResult,
  ): Promise<void> {
    let remoteProducts: EcommerceProduct[];
    try {
      remoteProducts = await connector.fetchProducts!(tokens, meta);
    } catch (error) {
      this.logger.warn(
        `E-commerce product fetch failed for provider=${provider}: ${(error as Error).message}`,
      );
      return;
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
      const remoteWins = remoteUpdatedAt > localProduct.updatedAt;
      result.productsReconciled += 1;

      if (remoteProduct.quantity === localProduct.stockQty) continue; // already in sync

      result.conflicts.push({
        sku: remoteProduct.sku,
        winner: remoteWins ? 'remote' : 'local',
        localQty: localProduct.stockQty,
        remoteQty: remoteProduct.quantity,
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
            reason: `E-commerce sync (${provider}): remote stock level wins (more recently updated)`,
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
  }

  private async importOrders(
    businessId: string,
    provider: IntegrationProvider,
    connector: Connector,
    tokens: OAuthTokens,
    meta: Record<string, unknown>,
    result: EcommerceSyncResult,
  ): Promise<void> {
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
      return;
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
  }
}
