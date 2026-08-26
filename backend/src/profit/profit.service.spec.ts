import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ProfitService } from './profit.service';
import { AiInfraService } from '../ai/ai-infra.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ProfitService (BE-036/BE-037)', () => {
  let prisma: PrismaService;
  let profitService: ProfitService;
  let businessId: string;
  let productId: string;
  let productId2: string;
  const aiInfra = { complete: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    profitService = new ProfitService(
      tenantPrisma,
      cls as unknown as ClsService,
      aiInfra as unknown as AiInfraService,
    );

    const business = await prisma.business.create({
      data: { name: 'Profit Test Biz', slug: `profit-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const product = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Thingamajig',
        costPrice: 5,
        sellingPrice: 20,
      },
    });
    productId = product.id;

    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        status: 'completed',
        orderType: 'counter',
        subtotal: 200,
        total: 200,
        cogs: 50,
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId,
        name: 'Thingamajig',
        price: 20,
        cost: 5,
        qty: 10,
      },
    });

    await prisma.expense.create({
      data: {
        businessId,
        description: 'Studio rent',
        category: 'Rent',
        amount: 30,
        incurredOn: new Date(),
      },
    });

    // Dedicated products/orders for the bundle-suggestions test below — kept separate from
    // `productId`/the order above so the byProduct/pnl assertions elsewhere stay unaffected.
    const gadget = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Gadget',
        costPrice: 3,
        sellingPrice: 10,
      },
    });
    const gadgetCase = await prisma.product.create({
      data: {
        businessId,
        kind: 'product',
        name: 'Gadget Case',
        costPrice: 2,
        sellingPrice: 8,
      },
    });
    productId2 = gadgetCase.id;

    // Two orders that always buy Gadget + Gadget Case together, clearing CO_PURCHASE_MIN_COUNT.
    for (let i = 0; i < 2; i++) {
      const coOrder = await prisma.order.create({
        data: {
          businessId,
          orderNo: 100 + i,
          status: 'completed',
          orderType: 'counter',
          subtotal: 18,
          total: 18,
          cogs: 5,
        },
      });
      await prisma.orderItem.createMany({
        data: [
          {
            orderId: coOrder.id,
            productId: gadget.id,
            name: 'Gadget',
            price: 10,
            cost: 3,
            qty: 1,
          },
          {
            orderId: coOrder.id,
            productId: gadgetCase.id,
            name: 'Gadget Case',
            price: 8,
            cost: 2,
            qty: 1,
          },
        ],
      });
    }
  });

  afterAll(async () => {
    await prisma.expense.deleteMany({ where: { businessId } });
    await prisma.orderItem.deleteMany({ where: { product: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.bundleItem.deleteMany({
      where: { bundle: { businessId } },
    });
    await prisma.bundle.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('computes per-product profit and margin, flagging low-margin/top performers', async () => {
    const { products } = await profitService.byProduct(90);
    const row = products.find((p) => p.productId === productId);

    expect(row).toBeDefined();
    expect(row?.units).toBe(10);
    expect(row?.revenue).toBe(200);
    expect(row?.cost).toBe(50);
    expect(row?.profit).toBe(150);
    expect(row?.margin).toBe(75);
    expect(row?.reviewPricing).toBe(false);
    expect(row?.isTopPerformer).toBe(true);
  });

  it('computes P&L for the current month: revenue - cogs - expenses = net', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const pnl = await profitService.pnl(businessId, month);

    // Includes the two Gadget/Gadget Case co-purchase orders seeded above (18 revenue, 5 cogs each).
    expect(pnl.revenue).toBe(236);
    expect(pnl.cogs).toBe(60);
    expect(pnl.totalExpenses).toBe(30);
    expect(pnl.netProfit).toBe(146);
    expect(pnl.expenses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'Rent', amount: 30 }),
      ]),
    );
  });

  it('produces a time-of-day insight string without throwing', async () => {
    const { insight, hourly } = await profitService.byTime();
    expect(typeof insight).toBe('string');
    expect(insight.length).toBeGreaterThan(0);
    expect(hourly.length).toBeGreaterThan(0);
  });

  it('returns real JSON-serializable numbers for hour/weekday — not raw MySQL bigints (UPD-BE-106 regression)', async () => {
    const { hourly, weekday } = await profitService.byTime();

    expect(hourly.length).toBeGreaterThan(0);
    for (const row of hourly) {
      expect(typeof row.hour).toBe('number');
    }
    // The real crash: JSON.stringify throws "Do not know how to serialize a BigInt" if any
    // field is still a raw bigint — this is what actually reproduces the bug, not a typeof check alone.
    expect(() => JSON.stringify({ hourly, weekday })).not.toThrow();

    expect(weekday.length).toBeGreaterThan(0);
    const validDayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];
    for (const row of weekday) {
      expect(typeof row.day).toBe('string');
      expect(validDayNames).toContain(row.day);
    }
  });

  describe('bundleSuggestions (UPD-BE-013)', () => {
    afterEach(() => {
      aiInfra.complete.mockReset();
    });

    it('finds a real, frequently co-purchased pair with a deterministic suggested price and AI-phrased pitch', async () => {
      aiInfra.complete.mockResolvedValue(
        JSON.stringify(['Bundle Gadget with its Case and save!']),
      );

      const suggestions = await profitService.bundleSuggestions();
      const pair = suggestions.find(
        (s) =>
          (s.productAId === productId2 || s.productBId === productId2) &&
          s.togetherCount === 2,
      );

      expect(pair).toBeDefined();
      expect(pair?.combinedPrice).toBe(18); // 10 + 8, real prices — never AI-invented
      expect(pair?.suggestedPrice).toBe(16.2); // 18 * (1 - 0.1)
      expect(pair?.pitch).toBe('Bundle Gadget with its Case and save!');
    });

    it('falls back to the plain, non-AI pitch when the AI call fails', async () => {
      aiInfra.complete.mockRejectedValue(new Error('AI unavailable'));

      const suggestions = await profitService.bundleSuggestions();
      const pair = suggestions.find(
        (s) => s.productAId === productId2 || s.productBId === productId2,
      );

      expect(pair?.pitch).toContain('bought together 2 times');
    });

    it('excludes a pair that is already bundled', async () => {
      const gadgetProduct = await prisma.product.create({
        data: {
          businessId,
          kind: 'product',
          name: 'Gadget Bundle',
          costPrice: 5,
          sellingPrice: 15,
        },
      });
      const [gadgetId, gadgetCaseId] = (
        await prisma.product.findMany({
          where: { businessId, name: { in: ['Gadget', 'Gadget Case'] } },
          orderBy: { name: 'asc' },
        })
      ).map((p) => p.id);
      await prisma.bundle.create({
        data: {
          businessId,
          productId: gadgetProduct.id,
          items: {
            create: [
              { productId: gadgetId, qty: 1 },
              { productId: gadgetCaseId, qty: 1 },
            ],
          },
        },
      });

      aiInfra.complete.mockResolvedValue(JSON.stringify([]));
      const suggestions = await profitService.bundleSuggestions();
      expect(
        suggestions.some(
          (s) => s.productAId === productId2 || s.productBId === productId2,
        ),
      ).toBe(false);
    });
  });
});
