import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { PricingService } from './pricing.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('PricingService (UPD-BE-015)', () => {
  let prisma: PrismaService;
  let pricingService: PricingService;
  let businessId: string;
  let productAId: string;
  let productBId: string;
  const aiInfra = { complete: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    pricingService = new PricingService(
      tenantPrisma,
      cls as unknown as ClsService,
      aiInfra as unknown as AiInfraService,
    );

    const business = await prisma.business.create({
      data: { name: 'Pricing Test Biz', slug: `pricing-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, 'test-actor');

    const productA = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        category: 'Snacks',
        name: 'Chips',
        costPrice: 10,
        sellingPrice: 20,
      },
    });
    productAId = productA.id;
    const productB = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        category: 'Snacks',
        name: 'Pretzels',
        costPrice: 10,
        sellingPrice: 22,
      },
    });
    productBId = productB.id;
  });

  afterEach(() => {
    aiInfra.complete.mockReset();
  });

  afterAll(async () => {
    await prisma.priceHistory.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('dryRun returns a preview without writing anything', async () => {
    const result = await pricingService.bulkPrice({
      category: 'Snacks',
      mode: 'percent',
      value: 10,
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: productAId,
          oldPrice: 20,
          newPrice: 22,
        }),
        expect.objectContaining({
          productId: productBId,
          oldPrice: 22,
          newPrice: 24.2,
        }),
      ]),
    );

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productAId },
    });
    expect(Number(product.sellingPrice)).toBe(20); // unchanged
    const history = await prisma.priceHistory.findMany({
      where: { businessId },
    });
    expect(history).toHaveLength(0);
  });

  it('a real (non-dry-run) change updates prices and writes price history', async () => {
    await pricingService.bulkPrice({
      productIds: [productAId],
      mode: 'amount',
      value: 5,
      dryRun: false,
    });

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productAId },
    });
    expect(Number(product.sellingPrice)).toBe(25);

    const history = await prisma.priceHistory.findMany({
      where: { businessId, productId: productAId },
    });
    expect(history).toHaveLength(1);
    expect(Number(history[0].oldPrice)).toBe(20);
    expect(Number(history[0].newPrice)).toBe(25);
    expect(history[0].changedByUserId).toBe('test-actor');
  });

  it('never lets a bulk change push a price below zero', async () => {
    await pricingService.bulkPrice({
      productIds: [productBId],
      mode: 'amount',
      value: -1000,
      dryRun: false,
    });
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: productBId },
    });
    expect(Number(product.sellingPrice)).toBe(0);
  });

  it('rejects a filter matching no products', async () => {
    await expect(
      pricingService.bulkPrice({
        productIds: ['not-a-real-id'],
        mode: 'percent',
        value: 10,
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('suggested-price is a deterministic formula grounded in real cost/margin, with an AI-phrased rationale', async () => {
    aiInfra.complete.mockResolvedValue('Raise the price — margin is thin.');

    // Fresh low-margin product: cost 10, price 10.5 -> margin ~4.8%, below LOW_MARGIN_RATE (15%).
    const thin = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Thin Margin Item',
        costPrice: 10,
        sellingPrice: 10.5,
      },
    });

    const result = await pricingService.suggestedPrice(businessId, thin.id);
    expect(result.suggestedPrice).toBeCloseTo(10 / 0.7, 2); // cost / (1 - 30%)
    expect(result.rationale).toBe('Raise the price — margin is thin.');
  });

  it('falls back to the plain, non-AI rationale when the AI call fails', async () => {
    aiInfra.complete.mockRejectedValue(new Error('AI down'));

    const result = await pricingService.suggestedPrice(businessId, productAId);
    expect(result.rationale).toContain('margin');
  });
});
