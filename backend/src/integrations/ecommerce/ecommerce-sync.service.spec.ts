import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { EcommerceSyncService } from './ecommerce-sync.service';
import type { IntegrationsService } from '../integrations.service';
import type { ConnectorRegistry } from '../connector-registry';
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
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('remote stock level wins when it was more recently updated — writes a real StockMovement adjustment', async () => {
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
  });

  it('local stock level wins when more recently updated — pushes to the platform instead of overwriting local', async () => {
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
      { shop: 'test-shop.myshopify.com' },
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
});
