import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CashForecastService } from './cash-forecast.service';
import { RecurringObligationsService } from './recurring-obligations.service';
import {
  OrderStatus,
  OrderType,
  RecurringObligationFrequency,
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

describe('CashForecastService (UPD-BE-078)', () => {
  let prisma: PrismaService;
  let forecast: CashForecastService;
  let obligations: RecurringObligationsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    forecast = new CashForecastService(tenantPrisma);
    obligations = new RecurringObligationsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Cash Forecast Test Biz',
        slug: `cash-forecast-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.recurringObligation.deleteMany({ where: { businessId } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.expense.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('projects real average daily revenue/expense and places a real recurring obligation on its exact due date', async () => {
    // Real trailing revenue: 3000 total over the last 30 days -> 100/day average.
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 1,
        orderType: OrderType.counter,
        status: OrderStatus.completed,
        total: 3000,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    });
    // Real trailing expense: 600 total -> 20/day average.
    await prisma.expense.create({
      data: {
        businessId,
        description: 'Rent-adjacent test expense',
        category: 'utilities',
        amount: 600,
        incurredOn: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
    });

    const inThreeDays = new Date();
    inThreeDays.setUTCDate(inThreeDays.getUTCDate() + 3);
    await obligations.create(businessId, {
      name: 'Software subscription',
      amount: 500,
      frequency: RecurringObligationFrequency.monthly,
      nextDueDate: inThreeDays.toISOString().slice(0, 10),
    });

    const result = await forecast.forecast(businessId, 10);
    expect(result.dailyAvgRevenue).toBe(100);
    expect(result.dailyAvgExpense).toBe(20);

    const dueDay = result.projection[3];
    expect(dueDay.obligationsDue).toBe(500);
    expect(dueDay.netFlow).toBe(100 - (20 + 500));

    const notDueDay = result.projection[1];
    expect(notDueDay.obligationsDue).toBe(0);
  });

  it('flags a real shortfall date once cumulative net flow goes negative', async () => {
    const result = await forecast.forecast(businessId, 10);
    expect(result.shortfallDates.length).toBeGreaterThan(0);
    expect(result.shortfallDates).toContain(result.projection[3].date);
  });

  it('an inactive obligation is excluded from the projection', async () => {
    const inTwoDays = new Date();
    inTwoDays.setUTCDate(inTwoDays.getUTCDate() + 2);
    const inactive = await obligations.create(businessId, {
      name: 'Cancelled obligation',
      amount: 9999,
      frequency: RecurringObligationFrequency.weekly,
      nextDueDate: inTwoDays.toISOString().slice(0, 10),
    });
    await obligations.update(inactive.id, { active: false });

    const result = await forecast.forecast(businessId, 10);
    const day = result.projection[2];
    expect(day.obligationsDue).toBeLessThan(9999);
  });
});
