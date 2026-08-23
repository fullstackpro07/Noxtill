import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import type { SendGateService } from '../messaging/send-gate.service';
import { CreditReminderRulesService } from './credit-reminder-rules.service';
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

describe('CreditReminderRulesService (UPD-BE-095)', () => {
  let prisma: PrismaService;
  let service: CreditReminderRulesService;
  let businessId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new CreditReminderRulesService(
      tenantPrisma,
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Credit Reminder Rules Test Biz',
        slug: `credit-reminder-rules-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.creditReminderLog.deleteMany({ where: { businessId } });
    await prisma.creditReminderRule.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a rule defaulting to gentle tone and active=true', async () => {
    const rule = await service.create(businessId, { daysOverdueTrigger: 30 });
    expect(rule.tone).toBe('gentle');
    expect(rule.active).toBe(true);
  });

  it('lists rules ordered by daysOverdueTrigger ascending', async () => {
    await service.create(businessId, { daysOverdueTrigger: 90, tone: 'final' });
    await service.create(businessId, { daysOverdueTrigger: 60, tone: 'firm' });
    const rules = await service.list();
    const triggers = rules.map((r) => r.daysOverdueTrigger);
    expect(triggers).toEqual([...triggers].sort((a, b) => a - b));
  });

  it('persists a real custom message and passes it through testSend as customBody', async () => {
    const rule = await service.create(businessId, {
      daysOverdueTrigger: 45,
      tone: 'firm',
      customMessage:
        'Hey {{customerName}}, your balance of {{balance}} needs attention.',
    });
    expect(rule.customMessage).toBe(
      'Hey {{customerName}}, your balance of {{balance}} needs attention.',
    );

    await service.testSend(businessId, rule.id, { email: 'test@example.com' });
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        templateKey: 'credit_reminder_firm',
        customBody:
          'Hey {{customerName}}, your balance of {{balance}} needs attention.',
      }),
    );
  });

  it('testSend() requires a phone or email target', async () => {
    const rule = await service.create(businessId, { daysOverdueTrigger: 15 });
    await expect(
      service.testSend(businessId, rule.id, {}),
    ).rejects.toBeInstanceOf(AppException);
    expect(sendGate.send).not.toHaveBeenCalled();
  });

  it('deletes a rule', async () => {
    const rule = await service.create(businessId, { daysOverdueTrigger: 20 });
    await service.remove(rule.id);
    await expect(service.update(rule.id, { active: false })).rejects.toThrow();
  });

  describe('recoveryRateByStage (UPD-FE-079)', () => {
    it('reports 0% for a rule nobody has ever been reminded under', async () => {
      const rule = await service.create(businessId, { daysOverdueTrigger: 77 });
      const stages = await service.recoveryRateByStage();
      const stage = stages.find((s) => s.ruleId === rule.id);
      expect(stage).toMatchObject({
        remindedCount: 0,
        recoveredCount: 0,
        recoveryRate: 0,
      });
    });

    it('counts a reminded customer as recovered once their balance reaches zero', async () => {
      const rule = await service.create(businessId, { daysOverdueTrigger: 33 });
      const customer = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}rc`,
          name: 'Recovered Customer',
        },
      });
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: customer.id,
          kind: 'credit',
          amount: 100,
        },
      });
      await prisma.creditReminderLog.create({
        data: { businessId, customerId: customer.id, ruleId: rule.id },
      });

      const beforePayoff = await service.recoveryRateByStage();
      expect(beforePayoff.find((s) => s.ruleId === rule.id)).toMatchObject({
        remindedCount: 1,
        recoveredCount: 0,
      });

      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: customer.id,
          kind: 'payment',
          amount: 100,
        },
      });

      const afterPayoff = await service.recoveryRateByStage();
      expect(afterPayoff.find((s) => s.ruleId === rule.id)).toMatchObject({
        remindedCount: 1,
        recoveredCount: 1,
        recoveryRate: 100,
      });

      await prisma.creditReminderLog.deleteMany({
        where: { customerId: customer.id },
      });
      await prisma.creditEntry.deleteMany({
        where: { customerId: customer.id },
      });
      await prisma.customer.delete({ where: { id: customer.id } });
    });
  });
});
