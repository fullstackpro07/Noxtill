import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { AccountingSyncService } from './accounting-sync.service';
import { AccountingMappingService } from './accounting-mapping.service';
import type { IntegrationsService } from '../integrations.service';
import type { ConnectorRegistry } from '../connector-registry';
import {
  IntegrationProvider,
  IntegrationStatus,
  OrderStatus,
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

describe('AccountingSyncService (UPD-BE-072)', () => {
  let prisma: PrismaService;
  let service: AccountingSyncService;
  let mapping: AccountingMappingService;
  let businessId: string;
  const getTokens = jest.fn();
  const pushInvoice = jest.fn();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const integrations = { getTokens };
    const connectors = { get: () => ({ pushInvoice }) };
    service = new AccountingSyncService(
      tenantPrisma,
      integrations as unknown as IntegrationsService,
      connectors as unknown as ConnectorRegistry,
    );
    mapping = new AccountingMappingService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Accounting Sync Test Biz',
        slug: `accounting-sync-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.accountingMapping.deleteMany({ where: { businessId } });
    await prisma.integration.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('throws a real, clear error when no accounting provider is connected', async () => {
    await expect(service.sync(businessId)).rejects.toThrow();
  });

  it('pushes a real completed order as an invoice using the default mapping, and marks it synced', async () => {
    await prisma.integration.create({
      data: {
        businessId,
        provider: IntegrationProvider.quickbooks,
        status: IntegrationStatus.connected,
        meta: { realmId: 'realm-1' },
      },
    });
    getTokens.mockResolvedValue({ accessToken: 'tok' });
    pushInvoice.mockResolvedValue({ externalId: 'qbo-inv-1' });
    await mapping.upsert(businessId, {
      provider: IntegrationProvider.quickbooks,
      externalAccountCode: 'ACC-DEFAULT',
    });

    const product = await prisma.product.create({
      data: { businessId, name: 'Untagged Widget', sellingPrice: 10 },
    });
    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: 1001,
        status: OrderStatus.completed,
        total: 10,
        items: {
          create: [
            {
              productId: product.id,
              name: 'Untagged Widget',
              price: 10,
              cost: 5,
              qty: 1,
            },
          ],
        },
      },
    });

    const result = await service.sync(businessId);
    expect(result.pushed).toBe(1);
    expect(result.provider).toBe(IntegrationProvider.quickbooks);
    expect(pushInvoice).toHaveBeenCalledWith(
      { accessToken: 'tok' },
      { realmId: 'realm-1' },
      expect.objectContaining({
        orderNo: 1001,
        lines: [expect.objectContaining({ accountCode: 'ACC-DEFAULT' })],
      }),
    );

    const refreshed = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(refreshed.accountingExternalId).toBe('qbo-inv-1');
    expect(refreshed.accountingSyncedAt).not.toBeNull();
  });

  it('a category-specific mapping overrides the default for that one product', async () => {
    pushInvoice.mockResolvedValue({ externalId: 'qbo-inv-2' });
    await mapping.upsert(businessId, {
      provider: IntegrationProvider.quickbooks,
      productCategory: 'Beverages',
      externalAccountCode: 'ACC-BEVERAGES',
    });

    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Soda',
        category: 'Beverages',
        sellingPrice: 3,
      },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 1002,
        status: OrderStatus.completed,
        total: 3,
        items: {
          create: [
            { productId: product.id, name: 'Soda', price: 3, cost: 1, qty: 1 },
          ],
        },
      },
    });

    await service.sync(businessId);
    expect(pushInvoice).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        lines: [expect.objectContaining({ accountCode: 'ACC-BEVERAGES' })],
      }),
    );
  });

  it('a real second sync() run never re-pushes an already-synced order', async () => {
    pushInvoice.mockResolvedValue({ externalId: 'should-not-be-used' });
    const result = await service.sync(businessId);
    expect(result.pushed).toBe(0);
    expect(pushInvoice).not.toHaveBeenCalled();
  });

  it('fails loudly (not silently) for an order whose product has no matching mapping and no default exists', async () => {
    await prisma.accountingMapping.deleteMany({
      where: { businessId, provider: IntegrationProvider.quickbooks },
    });
    const product = await prisma.product.create({
      data: { businessId, name: 'Unmapped Widget', sellingPrice: 7 },
    });
    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: 1003,
        status: OrderStatus.completed,
        total: 7,
        items: {
          create: [
            {
              productId: product.id,
              name: 'Unmapped Widget',
              price: 7,
              cost: 3,
              qty: 1,
            },
          ],
        },
      },
    });

    const result = await service.sync(businessId);
    expect(result.failed).toBe(1);
    expect(result.results[0]).toMatchObject({
      orderId: order.id,
      status: 'failed',
    });
    const refreshed = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(refreshed.accountingSyncedAt).toBeNull();
  });
});
