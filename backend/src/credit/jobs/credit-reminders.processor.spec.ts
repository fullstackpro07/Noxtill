import { PrismaService } from '../../prisma/prisma.service';
import { SendGateService } from '../../messaging/send-gate.service';
import { LocaleService } from '../../common/localization/locale.service';
import { CreditRemindersProcessor } from './credit-reminders.processor';

describe('CreditRemindersProcessor (UPD-BE-095)', () => {
  let prisma: PrismaService;
  let processor: CreditRemindersProcessor;
  let businessId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  // `days_outstanding` is computed by the real `v_credit_balances` SQL view via `DATEDIFF(NOW(), ...)`
  // — it always uses the DB's real wall clock, never the `now` this test passes to `runReminders`.
  // So every `createdAt` fixture below is offset from the REAL current time, and `now` here is kept
  // at (near enough) the real current time too — matching how the job is always actually invoked in
  // production (no historical `now` override there either; that parameter exists only so a single
  // tick's `todayStart()` dedup window is deterministic within a test, not to fake days_outstanding).
  const now = new Date();

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new CreditRemindersProcessor(
      prisma,
      sendGate as unknown as SendGateService,
      new LocaleService(),
    );

    const business = await prisma.business.create({
      data: {
        name: 'Credit Reminders Test Biz',
        slug: `credit-reminders-test-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.creditReminderLog.deleteMany({ where: { businessId } });
    await prisma.creditReminderRule.deleteMany({ where: { businessId } });
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('skips a business with zero active rules entirely', async () => {
    const customer = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}z`,
        name: 'No Rules Customer',
      },
    });
    try {
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: customer.id,
          kind: 'credit',
          amount: 500,
          createdAt: new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000),
        },
      });

      await processor.runReminders(now);
      expect(sendGate.send).not.toHaveBeenCalled();
    } finally {
      await prisma.creditEntry.deleteMany({
        where: { customerId: customer.id },
      });
      await prisma.customer.delete({ where: { id: customer.id } });
    }
  });

  it('picks the single highest-matching rule, not every matching rule', async () => {
    const [rule30, rule60, rule90] = await Promise.all([
      prisma.creditReminderRule.create({
        data: { businessId, daysOverdueTrigger: 30, tone: 'gentle' },
      }),
      prisma.creditReminderRule.create({
        data: { businessId, daysOverdueTrigger: 60, tone: 'firm' },
      }),
      prisma.creditReminderRule.create({
        data: { businessId, daysOverdueTrigger: 90, tone: 'final' },
      }),
    ]);
    const customer = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}m`,
        name: 'Ninety Plus Customer',
      },
    });

    try {
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: customer.id,
          kind: 'credit',
          amount: 500,
          createdAt: new Date(now.getTime() - 95 * 24 * 60 * 60 * 1000),
        },
      });

      await processor.runReminders(now);

      expect(sendGate.send).toHaveBeenCalledTimes(1);
      expect(sendGate.send).toHaveBeenCalledWith(
        expect.objectContaining({ templateKey: 'credit_reminder_final' }),
      );

      const logs = await prisma.creditReminderLog.findMany({
        where: { customerId: customer.id },
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].ruleId).toBe(rule90.id);
    } finally {
      await prisma.creditReminderLog.deleteMany({
        where: { customerId: customer.id },
      });
      await prisma.creditEntry.deleteMany({
        where: { customerId: customer.id },
      });
      await prisma.customer.delete({ where: { id: customer.id } });
      await prisma.creditReminderRule.deleteMany({
        where: { id: { in: [rule30.id, rule60.id, rule90.id] } },
      });
    }
  });

  it('never reminds the same (customer, rule) pair twice on the same day', async () => {
    const rule = await prisma.creditReminderRule.create({
      data: { businessId, daysOverdueTrigger: 10, tone: 'gentle' },
    });
    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}d`, name: 'Dedup Customer' },
    });

    try {
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: customer.id,
          kind: 'credit',
          amount: 500,
          createdAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000),
        },
      });

      await processor.runReminders(now);
      expect(sendGate.send).toHaveBeenCalledTimes(1);

      await processor.runReminders(new Date(now.getTime() + 60 * 60 * 1000));
      expect(sendGate.send).toHaveBeenCalledTimes(1);
    } finally {
      await prisma.creditReminderLog.deleteMany({
        where: { customerId: customer.id },
      });
      await prisma.creditEntry.deleteMany({
        where: { customerId: customer.id },
      });
      await prisma.customer.delete({ where: { id: customer.id } });
      await prisma.creditReminderRule.delete({ where: { id: rule.id } });
    }
  });

  it('never reminds an opted-out customer', async () => {
    const rule = await prisma.creditReminderRule.create({
      data: { businessId, daysOverdueTrigger: 5, tone: 'gentle' },
    });
    const customer = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}o`,
        name: 'Opted Out Customer',
        optedOut: true,
      },
    });

    try {
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: customer.id,
          kind: 'credit',
          amount: 200,
          createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        },
      });

      await processor.runReminders(now);
      expect(sendGate.send).not.toHaveBeenCalled();
    } finally {
      await prisma.creditEntry.deleteMany({
        where: { customerId: customer.id },
      });
      await prisma.customer.delete({ where: { id: customer.id } });
      await prisma.creditReminderRule.delete({ where: { id: rule.id } });
    }
  });
});
