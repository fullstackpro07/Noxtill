import { PrismaService } from '../../prisma/prisma.service';
import { LocaleService } from '../../common/localization/locale.service';
import { SendGateService } from '../../messaging/send-gate.service';
import { WorkflowTriggerService } from '../../marketing/automations/workflow-trigger.service';
import { OutboundWebhookDispatchService } from '../../integrations/automation/outbound-webhook-dispatch.service';
import { CrmJobsProcessor } from './crm-jobs.processor';
import { VIP_LIFETIME_SPEND_THRESHOLD } from './crm-jobs.constants';

describe('CrmJobsProcessor (BE-041)', () => {
  let prisma: PrismaService;
  let processor: CrmJobsProcessor;
  let businessId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };
  const workflowTrigger = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const outboundWebhookDispatch = {
    dispatch: jest.fn().mockResolvedValue(undefined),
  };

  // UTC business, so "local hour" == UTC hour — makes the fixed `now` below deterministic.
  const midnightUtc = new Date('2026-03-01T00:00:00Z');
  const nineAmUtc = new Date('2026-03-01T09:00:00Z');

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new CrmJobsProcessor(
      prisma,
      new LocaleService(),
      sendGate as unknown as SendGateService,
      workflowTrigger as unknown as WorkflowTriggerService,
      outboundWebhookDispatch as unknown as OutboundWebhookDispatchService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'CRM Jobs Test Biz',
        slug: `crm-jobs-test-${Date.now()}`,
        timezone: 'UTC',
      },
    });
    businessId = business.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
    workflowTrigger.dispatch.mockClear();
  });

  afterAll(async () => {
    await prisma.activityEvent.deleteMany({ where: { businessId } });
    await prisma.membership.deleteMany({ where: { businessId } });
    await prisma.membershipPlan.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('tags a high-spend customer VIP and an inactive one Lapsed, only at the business local midnight', async () => {
    const vip = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}1`,
        name: 'Big Spender',
        lifetimeSpend: VIP_LIFETIME_SPEND_THRESHOLD + 1,
      },
    });
    const lapsed = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}2`,
        name: 'Ghost',
        lastVisitAt: new Date('2025-01-01'),
      },
    });

    await processor.runTagRules(nineAmUtc); // wrong hour — should be a no-op
    let refreshedVip = await prisma.customer.findUniqueOrThrow({
      where: { id: vip.id },
    });
    expect(refreshedVip.tags).not.toContain('VIP');

    await processor.runTagRules(midnightUtc); // matches TAG_RULES_LOCAL_HOUR
    refreshedVip = await prisma.customer.findUniqueOrThrow({
      where: { id: vip.id },
    });
    const refreshedLapsed = await prisma.customer.findUniqueOrThrow({
      where: { id: lapsed.id },
    });

    expect(refreshedVip.tags).toContain('VIP');
    expect(refreshedLapsed.tags).toContain('Lapsed');
  });

  it('sends a birthday greeting only to customers whose birthday is today, only at the configured local hour', async () => {
    const birthdayToday = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}3`,
        name: 'Birthday Person',
        birthday: new Date('1990-03-01'),
      },
    });
    await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}4`,
        name: 'Not Today',
        birthday: new Date('1990-06-15'),
      },
    });
    await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}5`,
        name: 'Opted Out Birthday',
        birthday: new Date('1990-03-01'),
        optedOut: true,
      },
    });

    await processor.runBirthdayGreetings(midnightUtc); // wrong hour for birthdays
    expect(sendGate.send).not.toHaveBeenCalled();

    await processor.runBirthdayGreetings(nineAmUtc); // matches BIRTHDAY_LOCAL_HOUR
    expect(sendGate.send).toHaveBeenCalledTimes(1);
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: birthdayToday.id }),
    );
  });

  describe('runMembershipExpiry() (Membership depth fix, UPD-INT-007)', () => {
    it('lapses a real cash membership whose due date has passed, leaves a future one and an online one alone', async () => {
      const plan = await prisma.membershipPlan.create({
        data: { businessId, name: 'Expiry Test Plan', price: 20 },
      });
      const customer = await prisma.customer.create({
        data: {
          businessId,
          phone: `+1${Date.now()}exp`,
          name: 'Expiry Customer',
        },
      });

      const lapsed = await prisma.membership.create({
        data: {
          businessId,
          planId: plan.id,
          customerId: customer.id,
          status: 'active',
          method: 'cash',
          currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });
      const notYetDue = await prisma.membership.create({
        data: {
          businessId,
          planId: plan.id,
          customerId: customer.id,
          status: 'active',
          method: 'cash',
          currentPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        },
      });
      const onlinePastDue = await prisma.membership.create({
        data: {
          businessId,
          planId: plan.id,
          customerId: customer.id,
          status: 'active',
          method: 'online',
          currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });

      const count = await processor.runMembershipExpiry();
      expect(count).toBeGreaterThanOrEqual(1);

      const [lapsedRow, notYetDueRow, onlineRow] = await Promise.all([
        prisma.membership.findUniqueOrThrow({ where: { id: lapsed.id } }),
        prisma.membership.findUniqueOrThrow({ where: { id: notYetDue.id } }),
        prisma.membership.findUniqueOrThrow({
          where: { id: onlinePastDue.id },
        }),
      ]);
      expect(lapsedRow.status).toBe('expired');
      expect(notYetDueRow.status).toBe('active');
      // An online membership's expiry is Stripe's own webhook's job, not this cash-only tick.
      expect(onlineRow.status).toBe('active');
    });
  });
});
