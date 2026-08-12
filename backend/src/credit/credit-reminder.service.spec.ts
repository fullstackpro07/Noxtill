import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { AuditService } from '../common/audit/audit.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CreditService } from './credit.service';
import { CreditReminderService } from './credit-reminder.service';
import { SendGateService } from '../messaging/send-gate.service';
import { ActivityService } from '../activity/activity.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CreditReminderService (BE-031)', () => {
  let prisma: PrismaService;
  let reminderService: CreditReminderService;
  let businessId: string;
  let optedInId: string;
  let optedOutId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

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
    const activity = { record: jest.fn().mockResolvedValue(undefined) };
    const creditService = new CreditService(
      tenantPrisma,
      cls as unknown as ClsService,
      auditService,
      activity as unknown as ActivityService,
    );
    reminderService = new CreditReminderService(
      tenantPrisma,
      new LocaleService(),
      sendGate as unknown as SendGateService,
      creditService,
    );

    const business = await prisma.business.create({
      data: { name: 'Reminder Test Biz', slug: `reminder-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const optedIn = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}1`,
        name: 'Opted In',
        optedOut: false,
      },
    });
    optedInId = optedIn.id;
    const optedOut = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}2`,
        name: 'Opted Out',
        optedOut: true,
      },
    });
    optedOutId = optedOut.id;

    await prisma.creditEntry.createMany({
      data: [
        { businessId, customerId: optedInId, kind: 'credit', amount: 100 },
        { businessId, customerId: optedOutId, kind: 'credit', amount: 100 },
      ],
    });
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('reminds all debtors but skips opted-out customers even for a Utility template', async () => {
    const result = await reminderService.remind(businessId, { all: true });

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    expect(sendGate.send).toHaveBeenCalledTimes(1);
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: optedInId }),
    );
  });

  it('skips a single-customer reminder if that customer is opted out', async () => {
    const result = await reminderService.remind(businessId, {
      customerId: optedOutId,
    });
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
