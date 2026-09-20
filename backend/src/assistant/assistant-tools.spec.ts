import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ASSISTANT_TOOLS, findAssistantTool } from './assistant-tools';
import { TOOL_TOPIC } from './assistant-history.constants';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('ASSISTANT_TOOLS registry', () => {
  it('has unique names, and every tool is mapped to a Chat History topic', () => {
    const names = ASSISTANT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(TOOL_TOPIC[name]).toBeDefined();
    }
  });
});

describe('assistant tools that query the tenant DB directly', () => {
  let prisma: PrismaService;
  let ctx: Parameters<NonNullable<ReturnType<typeof findAssistantTool>>['execute']>[0];
  let businessId: string;
  let otherBusinessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(prisma, cls as unknown as ClsService);

    const business = await prisma.business.create({
      data: { name: 'Tools Test Biz', slug: `tools-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const other = await prisma.business.create({
      data: { name: 'Other Tools Biz', slug: `tools-other-${Date.now()}` },
    });
    otherBusinessId = other.id;

    ctx = { businessId, tenantPrisma, prisma } as typeof ctx;

    const spends = [500, 100, 900, 300, 700, 50];
    for (const [i, spend] of spends.entries()) {
      await prisma.customer.create({
        data: { businessId, phone: `+1555${Date.now()}${i}`, name: `Customer ${spend}`, lifetimeSpend: spend, visitCount: i + 1 },
      });
    }
    await prisma.customer.create({
      data: { businessId: otherBusinessId, phone: `+1666${Date.now()}`, name: 'Other Tenant Whale', lifetimeSpend: 99999 },
    });

    const service = await prisma.product.create({
      data: { businessId, kind: 'service', name: 'Haircut', durationMin: 30 },
    });
    await prisma.product.createMany({
      data: [
        { businessId, name: 'Bread', stockQty: 2, lowStockThreshold: 5 },
        { businessId, name: 'Milk', stockQty: 0, lowStockThreshold: 5 },
        { businessId, name: 'Rice', stockQty: 50, lowStockThreshold: 5 },
        { businessId, name: 'Retired', stockQty: 0, lowStockThreshold: 5, active: false },
      ],
    });
    const debtors = await prisma.customer.findMany({ where: { businessId }, take: 2, orderBy: { name: 'asc' } });
    await prisma.creditEntry.create({ data: { businessId, customerId: debtors[0].id, kind: 'credit', amount: 80 } });
    await prisma.creditEntry.create({ data: { businessId, customerId: debtors[1].id, kind: 'credit', amount: 200 } });
    await prisma.creditEntry.create({ data: { businessId, customerId: debtors[1].id, kind: 'payment', amount: 50 } });
    const customer = await prisma.customer.findFirstOrThrow({ where: { businessId } });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const mk = (startsAt: Date, status: 'booked' | 'confirmed' | 'cancelled') =>
      prisma.appointment.create({
        data: {
          businessId,
          serviceId: service.id,
          customerId: customer.id,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 30 * 60 * 1000),
          status,
        },
      });
    await mk(tomorrow, 'booked');
    await mk(new Date(tomorrow.getTime() + 60 * 60 * 1000), 'confirmed');
    await mk(new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000), 'cancelled');
    await mk(new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000), 'booked');
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      for (const id of [businessId, otherBusinessId]) {
        await tx.appointment.deleteMany({ where: { businessId: id } });
        await tx.creditEntry.deleteMany({ where: { businessId: id } });
        await tx.product.deleteMany({ where: { businessId: id } });
        await tx.customer.deleteMany({ where: { businessId: id } });
        await tx.business.delete({ where: { id } });
      }
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('get_top_customers returns this tenant\'s five biggest spenders, highest first, never another tenant\'s', async () => {
    const result = (await findAssistantTool('get_top_customers')!.execute(ctx, {})) as {
      name: string;
      lifetimeSpend: number;
      visitCount: number;
    }[];
    expect(result.map((c) => c.lifetimeSpend)).toEqual([900, 700, 500, 300, 100]);
    expect(result.some((c) => c.name === 'Other Tenant Whale')).toBe(false);
  });

  it('get_low_stock_products lists only active products at/below threshold, emptiest first', async () => {
    const result = (await findAssistantTool('get_low_stock_products')!.execute(ctx, {})) as { name: string; stockQty: number }[];
    expect(result.map((p) => p.name)).toEqual(expect.arrayContaining(['Milk', 'Bread']));
    expect(result.find((p) => p.name === 'Milk')).toBeDefined();
    expect(result.map((p) => p.name)).not.toContain('Rice');
    expect(result.map((p) => p.name)).not.toContain('Retired');
    const qtys = result.map((p) => p.stockQty);
    expect(qtys).toEqual([...qtys].sort((a, b) => a - b));
  });

  it('get_top_debtors returns real net balances (credit minus payments), largest first, this tenant only', async () => {
    const result = (await findAssistantTool('get_top_debtors')!.execute(ctx, {})) as { name: string; balance: number }[];
    expect(result.map((d) => d.balance)).toEqual([150, 80]);
  });

  it('get_bookings_on_date counts only booked/confirmed appointments on that exact day', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const d = String(tomorrow.getDate()).padStart(2, '0');

    const result = await findAssistantTool('get_bookings_on_date')!.execute(ctx, { date: `${y}-${m}-${d}` });
    expect(result).toEqual({ date: `${y}-${m}-${d}`, count: 2 });
  });

  it('get_bookings_on_date rejects a malformed date instead of guessing', async () => {
    const result = await findAssistantTool('get_bookings_on_date')!.execute(ctx, { date: 'tomorrow' });
    expect(result).toEqual({ error: 'date must be a valid YYYY-MM-DD day' });
  });
});
