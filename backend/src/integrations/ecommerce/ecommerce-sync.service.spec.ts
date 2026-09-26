import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { EcommerceSyncService } from './ecommerce-sync.service';
import type { IntegrationsService } from '../integrations.service';
import type { ConnectorRegistry } from '../connector-registry';
import type { IntegrationAuditService } from '../integration-audit.service';
import type { SourceOfTruth } from './ecommerce.constants';
import {
  IntegrationProvider,
  IntegrationStatus,
  StockMovementKind,
} from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('EcommerceSyncService (UPD-BE-073)', () => {
  let prisma: PrismaService;
  let service: EcommerceSyncService;
  let businessId: string;
  const getTokens = jest.fn();
  const fetchProducts = jest.fn();
  const pushInventory = jest.fn();
  const fetchOrders = jest.fn();
  const auditRecord = jest.fn();

  /** Sets the connection's source-of-truth (the redesign's per-connection conflict policy). */
  async function setSourceOfTruth(value: SourceOfTruth) {
    await prisma.integration.update({
      where: {
        businessId_provider: {
          businessId,
          provider: IntegrationProvider.shopify,
        },
      },
      data: { meta: { shop: 'test-shop.myshopify.com', sourceOfTruth: value } },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const integrations = { getTokens };
    const connectors = {
      get: () => ({ fetchProducts, pushInventory, fetchOrders }),
    };
    service = new EcommerceSyncService(
      tenantPrisma,
      integrations as unknown as IntegrationsService,
      connectors as unknown as ConnectorRegistry,
      { record: auditRecord } as unknown as IntegrationAuditService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Ecommerce Sync Test Biz',
        slug: `ecommerce-sync-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.shopify,
        status: IntegrationStatus.connected,
        meta: { shop: 'test-shop.myshopify.com' },
      },
    });
    getTokens.mockResolvedValue({ accessToken: 'tok' });
    pushInventory.mockResolvedValue(undefined);
  });

  afterEach(() => {
    fetchProducts.mockReset();
    fetchOrders.mockReset();
    pushInventory.mockClear();
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.integrationSyncLog.deleteMany({ where: { businessId } });
    await prisma.ecommerceSyncConflict.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('store as source of truth: the remote stock level is applied — writes a real StockMovement adjustment', async () => {
    await setSourceOfTruth('store');
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Blue Shirt',
        sku: 'SKU-BLUE',
        sellingPrice: 20,
        stockQty: 5,
      },
    });
    fetchProducts.mockResolvedValue([
      { sku: 'SKU-BLUE', quantity: 12, updatedAt: '2099-01-01T00:00:00Z' },
    ]);
    fetchOrders.mockResolvedValue([]);

    const [result] = await service.sync(businessId);
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({
        sku: 'SKU-BLUE',
        winner: 'remote',
        localQty: 5,
        remoteQty: 12,
      }),
    );
    expect(pushInventory).not.toHaveBeenCalled();

    const refreshed = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(refreshed.stockQty).toBe(12);
    const movement = await prisma.stockMovement.findFirst({
      where: { businessId, productId: product.id },
    });
    expect(movement?.kind).toBe(StockMovementKind.adjustment);
    expect(movement?.qty).toBe(7);

    // E-commerce conflict history depth fix — a real, persisted row for this real conflict.
    const persisted = await prisma.ecommerceSyncConflict.findFirst({
      where: { businessId, sku: 'SKU-BLUE' },
    });
    expect(persisted).toMatchObject({
      winner: 'remote',
      localQty: 5,
      remoteQty: 12,
    });
  });

  it('Noxtill as source of truth (the default): pushes local stock to the platform instead of overwriting local', async () => {
    await setSourceOfTruth('noxtill');
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Red Shirt',
        sku: 'SKU-RED',
        sellingPrice: 20,
        stockQty: 9,
      },
    });
    fetchProducts.mockResolvedValue([
      { sku: 'SKU-RED', quantity: 3, updatedAt: '2000-01-01T00:00:00Z' },
    ]);
    fetchOrders.mockResolvedValue([]);

    const [result] = await service.sync(businessId);
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({ sku: 'SKU-RED', winner: 'local' }),
    );
    expect(pushInventory).toHaveBeenCalledWith(
      { accessToken: 'tok' },
      { shop: 'test-shop.myshopify.com', sourceOfTruth: 'noxtill' },
      'SKU-RED',
      9,
    );
    const refreshed = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(refreshed.stockQty).toBe(9); // unchanged — local already correct
  });

  it('imports a real remote order once, matching a line to a local product by SKU, and is idempotent on a second sync', async () => {
    await prisma.product.create({
      data: {
        businessId,
        name: 'Green Hat',
        sku: 'SKU-GREEN',
        sellingPrice: 15,
        costPrice: 6,
      },
    });
    fetchProducts.mockResolvedValue([]);
    fetchOrders.mockResolvedValue([
      {
        externalId: 'shop-order-1',
        status: 'paid',
        subtotal: 15,
        tax: 1.5,
        total: 16.5,
        createdAt: '2026-01-01T00:00:00Z',
        lines: [{ sku: 'SKU-GREEN', name: 'Green Hat', qty: 1, price: 15 }],
      },
    ]);

    const [first] = await service.sync(businessId);
    expect(first.ordersImported).toBe(1);

    const order = await prisma.order.findFirst({
      where: {
        businessId,
        externalProvider: IntegrationProvider.shopify,
        externalId: 'shop-order-1',
      },
      include: { items: true },
    });
    expect(order?.orderType).toBe('online');
    expect(order?.items[0]?.name).toBe('Green Hat');
    expect(Number(order?.total)).toBe(16.5);

    const [second] = await service.sync(businessId);
    expect(second.ordersImported).toBe(0); // re-delivered/re-fetched order is not duplicated

    const rows = await prisma.order.findMany({
      where: {
        businessId,
        externalProvider: IntegrationProvider.shopify,
        externalId: 'shop-order-1',
      },
    });
    expect(rows).toHaveLength(1);
  });

  describe('Connection Detail depth fix (UPD-BE-132)', () => {
    it('records a real successful sync — lastSyncAt set, a real IntegrationSyncLog row written', async () => {
      fetchProducts.mockResolvedValue([]);
      fetchOrders.mockResolvedValue([]);

      await service.sync(businessId);

      const integration = await prisma.integration.findUniqueOrThrow({
        where: {
          businessId_provider: {
            businessId,
            provider: IntegrationProvider.shopify,
          },
        },
      });
      expect(integration.lastSyncAt).not.toBeNull();

      const [latestLog] = await prisma.integrationSyncLog.findMany({
        where: { businessId, provider: IntegrationProvider.shopify },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      expect(latestLog.success).toBe(true);
    });

    it('honestly records a failed sync when the real product fetch throws, rather than reporting success', async () => {
      fetchProducts.mockRejectedValue(new Error('rate limited'));
      fetchOrders.mockResolvedValue([]);

      await service.sync(businessId);

      const [latestLog] = await prisma.integrationSyncLog.findMany({
        where: { businessId, provider: IntegrationProvider.shopify },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      expect(latestLog.success).toBe(false);
    });
  });

  describe('source of truth "manual" — conflicts are queued, never overwritten', () => {
    async function seed(sku: string, local: number, remote: number) {
      const product = await prisma.product.create({
        data: {
          businessId,
          name: `Queue ${sku}`,
          sku,
          sellingPrice: 10,
          stockQty: local,
        },
      });
      fetchProducts.mockResolvedValue([
        { sku, quantity: remote, updatedAt: '2099-01-01T00:00:00Z' },
      ]);
      fetchOrders.mockResolvedValue([]);
      return product;
    }

    it('creates a pending conflict and changes neither side', async () => {
      await setSourceOfTruth('manual');
      const product = await seed('SKU-Q1', 10, 4);

      const [result] = await service.sync(businessId);
      expect(result.conflicts).toContainEqual(
        expect.objectContaining({ sku: 'SKU-Q1', winner: 'none' }),
      );
      expect(pushInventory).not.toHaveBeenCalled();
      const untouched = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      expect(untouched.stockQty).toBe(10);
      const pending = await service.listConflicts(
        businessId,
        IntegrationProvider.shopify,
        'pending',
      );
      const row = pending.find((c) => c.sku === 'SKU-Q1');
      expect(row).toMatchObject({
        status: 'pending',
        localQty: 10,
        remoteQty: 4,
        productId: product.id,
        productName: 'Queue SKU-Q1',
      });
    });

    it('does not duplicate a pending conflict on the next sync — it refreshes the numbers', async () => {
      await seed('SKU-Q2', 8, 3);
      await service.sync(businessId);
      fetchProducts.mockResolvedValue([
        { sku: 'SKU-Q2', quantity: 2, updatedAt: '2099-01-02T00:00:00Z' },
      ]);
      await service.sync(businessId);

      const rows = await prisma.ecommerceSyncConflict.findMany({
        where: { businessId, sku: 'SKU-Q2' },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'pending', remoteQty: 2 });
    });

    it('resolves a pending conflict with the store quantity — applied locally as a stock movement, audited', async () => {
      const product = await seed('SKU-Q3', 10, 6);
      await service.sync(businessId);
      const row = await prisma.ecommerceSyncConflict.findFirstOrThrow({
        where: { businessId, sku: 'SKU-Q3' },
      });

      const resolved = await service.resolveConflict(
        businessId,
        undefined,
        row.id,
        'store',
      );
      expect(resolved).toMatchObject({
        status: 'resolved',
        resolution: 'store',
        resolvedQty: 6,
      });
      const after = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      expect(after.stockQty).toBe(6);
      expect(auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'integration.conflict_resolved' }),
      );
      await expect(
        service.resolveConflict(businessId, undefined, row.id, 'store'),
      ).rejects.toMatchObject({
        response: { code: 'ECOMMERCE_CONFLICT_NOT_PENDING' },
      });
    });

    it('resolves with Noxtill quantity — pushed to the store, local unchanged', async () => {
      const product = await seed('SKU-Q4', 10, 6);
      await service.sync(businessId);
      const row = await prisma.ecommerceSyncConflict.findFirstOrThrow({
        where: { businessId, sku: 'SKU-Q4' },
      });
      pushInventory.mockClear();

      await service.resolveConflict(businessId, undefined, row.id, 'noxtill');
      expect(pushInventory).toHaveBeenCalledWith(
        { accessToken: 'tok' },
        expect.anything(),
        'SKU-Q4',
        10,
      );
      const after = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      expect(after.stockQty).toBe(10);
    });

    it('resolves with a custom quantity — both sides set, and rejects a negative number', async () => {
      const product = await seed('SKU-Q5', 10, 6);
      await service.sync(businessId);
      const row = await prisma.ecommerceSyncConflict.findFirstOrThrow({
        where: { businessId, sku: 'SKU-Q5' },
      });

      await expect(
        service.resolveConflict(businessId, undefined, row.id, 'custom', -1),
      ).rejects.toMatchObject({ response: { code: 'ECOMMERCE_INVALID_QTY' } });

      pushInventory.mockClear();
      await service.resolveConflict(businessId, undefined, row.id, 'custom', 7);
      expect(pushInventory).toHaveBeenCalledWith(
        { accessToken: 'tok' },
        expect.anything(),
        'SKU-Q5',
        7,
      );
      const after = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      });
      expect(after.stockQty).toBe(7);
    });

    it('leaves the conflict pending when the store rejects the push', async () => {
      await seed('SKU-Q6', 10, 6);
      await service.sync(businessId);
      const row = await prisma.ecommerceSyncConflict.findFirstOrThrow({
        where: { businessId, sku: 'SKU-Q6' },
      });
      pushInventory.mockRejectedValueOnce(new Error('403 forbidden'));

      await expect(
        service.resolveConflict(businessId, undefined, row.id, 'noxtill'),
      ).rejects.toMatchObject({ response: { code: 'ECOMMERCE_PUSH_FAILED' } });
      const still = await prisma.ecommerceSyncConflict.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(still.status).toBe('pending');
    });

    it('closes a pending conflict on its own once both sides agree again', async () => {
      await seed('SKU-Q7', 10, 6);
      await service.sync(businessId);
      fetchProducts.mockResolvedValue([
        { sku: 'SKU-Q7', quantity: 10, updatedAt: '2099-01-03T00:00:00Z' },
      ]);
      await service.sync(businessId);
      const row = await prisma.ecommerceSyncConflict.findFirstOrThrow({
        where: { businessId, sku: 'SKU-Q7' },
      });
      expect(row).toMatchObject({ status: 'resolved', resolution: 'matched' });
    });

    it('setSourceOfTruth() persists the choice and audits it; sync skips a paused connection', async () => {
      await service.setSourceOfTruth(
        businessId,
        undefined,
        IntegrationProvider.shopify,
        'store',
      );
      expect(
        await service.sourceOfTruth(businessId, IntegrationProvider.shopify),
      ).toBe('store');
      expect(auditRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'integration.source_of_truth_changed',
          after: { sourceOfTruth: 'store' },
        }),
      );

      await prisma.integration.update({
        where: {
          businessId_provider: {
            businessId,
            provider: IntegrationProvider.shopify,
          },
        },
        data: { pausedAt: new Date() },
      });
      expect(await service.sync(businessId)).toEqual([]);
      await prisma.integration.update({
        where: {
          businessId_provider: {
            businessId,
            provider: IntegrationProvider.shopify,
          },
        },
        data: { pausedAt: null },
      });
      await setSourceOfTruth('noxtill');
    });
  });

  describe('listConflicts() (e-commerce conflict history depth fix)', () => {
    it('returns real persisted conflicts for this business, most recent first, optionally filtered by provider', async () => {
      await prisma.product.create({
        data: {
          businessId,
          name: 'Conflict Widget',
          sku: 'SKU-CONFLICT',
          sellingPrice: 9,
          stockQty: 1,
        },
      });
      fetchProducts.mockResolvedValue([
        { sku: 'SKU-CONFLICT', quantity: 4, updatedAt: '2099-01-01T00:00:00Z' },
      ]);
      fetchOrders.mockResolvedValue([]);
      await service.sync(businessId);

      const all = await service.listConflicts(businessId);
      expect(
        all.some((c) => c.sku === 'SKU-CONFLICT' && c.remoteQty === 4),
      ).toBe(true);

      const filtered = await service.listConflicts(
        businessId,
        IntegrationProvider.shopify,
      );
      expect(
        filtered.every((c) => c.provider === IntegrationProvider.shopify),
      ).toBe(true);

      const wrongProvider = await service.listConflicts(
        businessId,
        IntegrationProvider.woocommerce,
      );
      expect(wrongProvider).toHaveLength(0);
      // No manual cleanup here — this suite's own `afterAll` bulk-deletes stockMovement/product
      // rows for the whole businessId, and this product's real conflict-triggered StockMovement
      // row would otherwise block a standalone delete.
    });
  });
});
