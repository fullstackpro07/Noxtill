import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import type { SendGateService } from '../messaging/send-gate.service';
import { ReminderRulesService } from './reminder-rules.service';
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

describe('ReminderRulesService (UPD-BE-092)', () => {
  let prisma: PrismaService;
  let service: ReminderRulesService;
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
    service = new ReminderRulesService(
      tenantPrisma,
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Reminder Rules Test Biz',
        slug: `reminder-rules-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.reminderRule.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a rule defaulting to the booking_reminder template and active=true', async () => {
    const rule = await service.create(businessId, { offsetHours: 48 });
    expect(rule.templateKey).toBe('booking_reminder');
    expect(rule.active).toBe(true);
  });

  it('lists rules ordered by offsetHours descending', async () => {
    await service.create(businessId, {
      offsetHours: 1,
      templateKey: 'booking_reminder_urgent',
    });
    const rules = await service.list();
    const offsets = rules.map((r) => r.offsetHours);
    expect(offsets).toEqual([...offsets].sort((a, b) => b - a));
  });

  it('updates a rule and can deactivate it', async () => {
    const rule = await service.create(businessId, { offsetHours: 12 });
    const updated = await service.update(rule.id, { active: false });
    expect(updated.active).toBe(false);
  });

  it('deletes a rule', async () => {
    const rule = await service.create(businessId, { offsetHours: 6 });
    await service.remove(rule.id);
    await expect(service.update(rule.id, { active: false })).rejects.toThrow();
  });

  it('testSend() requires a phone or email target', async () => {
    const rule = await service.create(businessId, { offsetHours: 24 });
    await expect(
      service.testSend(businessId, rule.id, {}),
    ).rejects.toBeInstanceOf(AppException);
    expect(sendGate.send).not.toHaveBeenCalled();
  });

  it("testSend() sends the rule's real template to the given contact", async () => {
    const rule = await service.create(businessId, {
      offsetHours: 24,
      channel: 'whatsapp',
    });
    await service.testSend(businessId, rule.id, { phone: '+15551234567' });

    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        templateKey: 'booking_reminder',
        channel: 'whatsapp',
        to: { phone: '+15551234567', email: undefined },
      }),
    );
  });

  it('persists a real custom message and passes it through as customBody, not just the template key', async () => {
    const rule = await service.create(businessId, {
      offsetHours: 3,
      customMessage: 'Hey {{customerName}}, see you soon for {{serviceName}}!',
    });
    expect(rule.customMessage).toBe(
      'Hey {{customerName}}, see you soon for {{serviceName}}!',
    );

    await service.testSend(businessId, rule.id, { email: 'test@example.com' });

    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        customBody: 'Hey {{customerName}}, see you soon for {{serviceName}}!',
      }),
    );
  });

  it('update() can clear a custom message back to null', async () => {
    const rule = await service.create(businessId, {
      offsetHours: 5,
      customMessage: 'Original text',
    });
    const cleared = await service.update(rule.id, { customMessage: null });
    expect(cleared.customMessage).toBeNull();
  });
});
