import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ActivityService } from '../activity/activity.service';
import { CreditService } from './credit.service';
import { InstallmentsService } from './installments.service';
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

describe('InstallmentsService (UPD-BE-021)', () => {
  let prisma: PrismaService;
  let creditService: CreditService;
  let installmentsService: InstallmentsService;
  let businessId: string;
  let customerId: string;
  const activity = { record: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const auditService = new AuditService(
      tenantPrisma,
      cls as unknown as ClsService,
    );
    creditService = new CreditService(
      tenantPrisma,
      cls as unknown as ClsService,
      auditService,
      activity as unknown as ActivityService,
    );
    installmentsService = new InstallmentsService(
      tenantPrisma,
      auditService,
      activity as unknown as ActivityService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Installments Test Biz',
        slug: `installments-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}`,
        name: 'Instalment Customer',
      },
    });
    customerId = customer.id;
  });

  afterEach(() => {
    activity.record.mockClear();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.installment.deleteMany({ where: { businessId } });
    await prisma.installmentPlan.deleteMany({ where: { businessId } });
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('lists installments due today or earlier via due=today, excluding future ones', async () => {
    const plan = await creditService.createInstallmentPlan(customerId, {
      totalAmount: 200,
      installments: [
        { amount: 100, dueDate: '2020-01-01' }, // long past — always "due"
        { amount: 100, dueDate: '2099-01-01' }, // far future — never "due today"
      ],
    });

    const dueToday = await installmentsService.list('today');
    const ids = dueToday.map((i) => i.id);
    expect(ids).toContain(plan.installments[0].id);
    expect(ids).not.toContain(plan.installments[1].id);
  });

  it('paying an installment creates a real CreditEntry and marks it paid', async () => {
    const plan = await creditService.createInstallmentPlan(customerId, {
      totalAmount: 50,
      installments: [{ amount: 50, dueDate: '2020-01-01' }],
    });
    const before = await creditService.getBalance(customerId);
    await prisma.creditEntry.create({
      data: {
        businessId,
        customerId,
        kind: 'credit',
        amount: 50,
        note: 'Debt for plan',
      },
    });

    const result = await installmentsService.pay(
      businessId,
      plan.installments[0].id,
    );

    expect(result.installment.status).toBe('paid');
    expect(result.entry.kind).toBe('payment');

    const afterBalance = await creditService.getBalance(customerId);
    expect(afterBalance).toBe(before + 50 - 50); // credit added then paid off
  });

  it('marks the plan completed once every installment is paid', async () => {
    const plan = await creditService.createInstallmentPlan(customerId, {
      totalAmount: 20,
      installments: [{ amount: 20, dueDate: '2020-01-01' }],
    });

    await installmentsService.pay(businessId, plan.installments[0].id);

    const updatedPlan = await prisma.installmentPlan.findUniqueOrThrow({
      where: { id: plan.id },
    });
    expect(updatedPlan.status).toBe('completed');
  });

  it('rejects paying an installment that is already paid', async () => {
    const plan = await creditService.createInstallmentPlan(customerId, {
      totalAmount: 15,
      installments: [{ amount: 15, dueDate: '2020-01-01' }],
    });
    await installmentsService.pay(businessId, plan.installments[0].id);

    await expect(
      installmentsService.pay(businessId, plan.installments[0].id),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('rejects paying an installment belonging to another business', async () => {
    const plan = await creditService.createInstallmentPlan(customerId, {
      totalAmount: 10,
      installments: [{ amount: 10, dueDate: '2020-01-01' }],
    });

    await expect(
      installmentsService.pay(
        'not-a-real-business-id',
        plan.installments[0].id,
      ),
    ).rejects.toThrow();
  });
});
