import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { AiService } from './ai.service';
import { AiInfraService } from './ai-infra.service';
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

describe('AiService.whatIf (BE-038)', () => {
  let prisma: PrismaService;
  let aiService: AiService;
  let businessId: string;
  let productId: string;
  const aiInfra = { complete: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    aiService = new AiService(
      tenantPrisma,
      new LocaleService(),
      aiInfra as unknown as AiInfraService,
    );

    const business = await prisma.business.create({
      data: { name: 'AI Test Biz', slug: `ai-test-${Date.now()}` },
    });
    businessId = business.id;

    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Gizmo',
        costPrice: 10,
        sellingPrice: 25,
        stockQty: 50,
      },
    });
    productId = product.id;
  });

  afterEach(() => {
    aiInfra.complete.mockClear();
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { product: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('returns an honest message with no fabricated numbers when there is no sales history', async () => {
    const result = await aiService.whatIf(businessId, {
      productId,
      priceDeltaPct: 10,
    });

    expect(aiInfra.complete).not.toHaveBeenCalled();
    expect(result.estimate).toMatch(/not enough/i);
    expect(result.disclaimer).toMatch(/not a guarantee/i);
  });

  it('calls Claude with the product history and always returns the disclaimer', async () => {
    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        status: 'completed',
        orderType: 'counter',
        total: 250,
        subtotal: 250,
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId,
        name: 'Gizmo',
        price: 25,
        cost: 10,
        qty: 10,
      },
    });

    aiInfra.complete.mockResolvedValue(
      'Revenue would likely increase by about 5%.',
    );

    const result = await aiService.whatIf(businessId, {
      productId,
      priceDeltaPct: 10,
    });

    expect(aiInfra.complete).toHaveBeenCalledTimes(1);
    expect(aiInfra.complete).toHaveBeenCalledWith(
      businessId,
      expect.stringContaining('Gizmo'),
      0,
      'what_if',
    );
    expect(result.estimate).toContain('Revenue would likely increase');
    expect(result.disclaimer).toMatch(/not a guarantee/i);
  });

  it('throws a typed AI_UNAVAILABLE error when Claude fails, never fabricating an estimate', async () => {
    aiInfra.complete.mockRejectedValue(new Error('network error'));

    await expect(
      aiService.whatIf(businessId, { productId, priceDeltaPct: 5 }),
    ).rejects.toBeInstanceOf(AppException);
  });
});
