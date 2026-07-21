import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ProfitService } from './profit.service';

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
        category: 'Rent',
        amount: 30,
        incurredOn: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.expense.deleteMany({ where: { businessId } });
    await prisma.orderItem.deleteMany({ where: { product: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
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
    const pnl = await profitService.pnl(month);

    expect(pnl.revenue).toBe(200);
    expect(pnl.cogs).toBe(50);
    expect(pnl.totalExpenses).toBe(30);
    expect(pnl.netProfit).toBe(120);
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
});
