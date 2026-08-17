import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { StockCountService } from './stock-count.service';
import { ActivityService } from '../activity/activity.service';
import { AppException } from '../common/filters/app.exception';
import { StockCountStatus } from '../../generated/prisma';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('StockCountService (UPD-BE-037)', () => {
  let prisma: PrismaService;
  let service: StockCountService;
  let businessId: string;
  let productAId: string;
  let productBId: string;
  let serviceProductId: string;
  const activity = { record: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new StockCountService(
      tenantPrisma,
      activity as unknown as ActivityService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Stock Count Test Biz',
        slug: `stock-count-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const productA = await prisma.product.create({
      data: { businessId, kind: 'product', name: 'Widget A', stockQty: 50 },
    });
    productAId = productA.id;

    const productB = await prisma.product.create({
      data: { businessId, kind: 'product', name: 'Widget B', stockQty: 10 },
    });
    productBId = productB.id;

    const serviceProduct = await prisma.product.create({
      data: { businessId, kind: 'service', name: 'Haircut', stockQty: 0 },
    });
    serviceProductId = serviceProduct.id;
  });

  afterEach(() => {
    activity.record.mockClear();
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { businessId } });
    await prisma.stockCountLine.deleteMany({
      where: { stockCount: { businessId } },
    });
    await prisma.stockCount.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a real draft snapshotting expected/counted/variance, never touching stock', async () => {
    const count = await service.create(businessId, 'owner-1', {
      lines: [
        { productId: productAId, countedQty: 45 },
        { productId: productBId, countedQty: 10 },
      ],
    });
    expect(count.status).toBe('draft');

    const lineA = count.lines.find((l) => l.productId === productAId)!;
    expect(lineA.expectedQty).toBe(50);
    expect(lineA.countedQty).toBe(45);
    expect(lineA.variance).toBe(-5);

    const lineB = count.lines.find((l) => l.productId === productBId)!;
    expect(lineB.variance).toBe(0);

    const productA = await prisma.product.findUniqueOrThrow({
      where: { id: productAId },
    });
    expect(productA.stockQty).toBe(50); // unchanged — still just a draft
  });

  it('rejects a line referencing a service (non-physical-product) or unknown product', async () => {
    await expect(
      service.create(businessId, 'owner-1', {
        lines: [{ productId: serviceProductId, countedQty: 1 }],
      }),
    ).rejects.toBeInstanceOf(AppException);

    await expect(
      service.create(businessId, 'owner-1', {
        lines: [{ productId: 'not-a-real-product-id', countedQty: 1 }],
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('apply() writes real adjustment movements only for nonzero-variance lines and sets stock to the counted qty', async () => {
    const count = await service.create(businessId, 'owner-1', {
      lines: [
        { productId: productAId, countedQty: 42 }, // 50 -> 42, variance -8
        { productId: productBId, countedQty: 10 }, // 10 -> 10, no variance
      ],
    });

    const applied = await service.apply(businessId, count.id, 'owner-1');
    expect(applied.status).toBe('applied');
    expect(applied.appliedByUserId).toBe('owner-1');

    const productA = await prisma.product.findUniqueOrThrow({
      where: { id: productAId },
    });
    expect(productA.stockQty).toBe(42);
    const productB = await prisma.product.findUniqueOrThrow({
      where: { id: productBId },
    });
    expect(productB.stockQty).toBe(10); // unchanged

    const movements = await prisma.stockMovement.findMany({
      where: { businessId, kind: 'adjustment' },
    });
    expect(movements).toHaveLength(1); // only product A had a real variance
    expect(movements[0].productId).toBe(productAId);
    expect(movements[0].qty).toBe(-8);

    expect(activity.record).toHaveBeenCalledWith(
      businessId,
      expect.objectContaining({ type: 'stock', entityType: 'StockCount' }),
    );
  });

  it('rejects applying an already-applied stock count', async () => {
    const count = await service.create(businessId, 'owner-1', {
      lines: [{ productId: productAId, countedQty: 42 }],
    });
    await service.apply(businessId, count.id, 'owner-1');

    await expect(
      service.apply(businessId, count.id, 'owner-1'),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('re-derives variance against LIVE stock at apply time, not the stale creation-time snapshot', async () => {
    // Reset productA to a known baseline.
    await prisma.product.update({
      where: { id: productAId },
      data: { stockQty: 100 },
    });

    const count = await service.create(businessId, 'owner-1', {
      lines: [{ productId: productAId, countedQty: 90 }], // snapshot variance: -10
    });

    // A real sale happens AFTER the draft was created but BEFORE it's applied.
    await prisma.product.update({
      where: { id: productAId },
      data: { stockQty: { decrement: 15 } }, // now really at 85
    });

    await service.apply(businessId, count.id, 'owner-1');

    const productA = await prisma.product.findUniqueOrThrow({
      where: { id: productAId },
    });
    expect(productA.stockQty).toBe(90); // always set to the counted qty directly

    const movements = await prisma.stockMovement.findMany({
      where: { businessId, productId: productAId, kind: 'adjustment' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    // Live variance was 90 - 85 = 5, NOT the stale snapshot's -10.
    expect(movements[0].qty).toBe(5);
  });

  it('list() and findOne() return real rows', async () => {
    const list = await service.list();
    expect(list.length).toBeGreaterThan(0);

    const applied = await service.list(StockCountStatus.applied);
    expect(applied.every((c) => c.status === 'applied')).toBe(true);

    const found = await service.findOne(list[0].id);
    expect(found.id).toBe(list[0].id);

    await expect(service.findOne('not-a-real-id')).rejects.toThrow();
  });
});
