import { PrismaService } from '../../prisma/prisma.service';
import { PlanAssignmentService } from '../plan-assignment.service';
import { TrialExpiryProcessor } from './trial-expiry.processor';
import { BASIC_PLAN_KEY } from '../billing.constants';

describe('TrialExpiryProcessor (BE-065)', () => {
  let prisma: PrismaService;
  let processor: TrialExpiryProcessor;
  let basicPlanId: string;
  let otherPlanId: string;
  const now = new Date('2026-09-01T00:00:00Z');
  const pastTrial = new Date('2026-08-01T00:00:00Z');
  const futureTrial = new Date('2026-10-01T00:00:00Z');

  const businessIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    processor = new TrialExpiryProcessor(
      prisma,
      new PlanAssignmentService(prisma),
    );

    const basic = await prisma.plan.upsert({
      where: { key: BASIC_PLAN_KEY },
      create: {
        key: BASIC_PLAN_KEY,
        name: 'Basic',
        price: 0,
        msgQuota: 200,
        userLimit: 2,
      },
      update: { msgQuota: 200 },
    });
    basicPlanId = basic.id;

    const other = await prisma.plan.upsert({
      where: { key: `trial-expiry-other-${Date.now()}` },
      create: {
        key: `trial-expiry-other-${Date.now()}`,
        name: 'Other',
        price: 49,
        msgQuota: 5000,
        userLimit: 15,
      },
      update: {},
    });
    otherPlanId = other.id;
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    await prisma.plan.delete({ where: { id: otherPlanId } });
    await prisma.$disconnect();
  });

  async function makeBusiness(data: {
    trialEndsAt: Date | null;
    stripeSubscriptionId?: string;
    planId?: string;
  }) {
    const business = await prisma.business.create({
      data: {
        name: 'Trial Expiry Test Biz',
        slug: `trial-expiry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        planId: data.planId ?? otherPlanId,
        trialEndsAt: data.trialEndsAt,
        stripeSubscriptionId: data.stripeSubscriptionId,
      },
    });
    businessIds.push(business.id);
    return business;
  }

  it('downgrades a business whose trial expired with no paid subscription', async () => {
    const business = await makeBusiness({ trialEndsAt: pastTrial });

    await processor.runExpiry(now);

    const refreshed = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(refreshed.planId).toBe(basicPlanId);
    expect(refreshed.msgQuota).toBe(200);
  });

  it('never downgrades a business with an active paid subscription, even if trialEndsAt has passed', async () => {
    const business = await makeBusiness({
      trialEndsAt: pastTrial,
      stripeSubscriptionId: `sub_${Date.now()}`,
    });

    await processor.runExpiry(now);

    const refreshed = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(refreshed.planId).toBe(otherPlanId);
  });

  it('never downgrades a business whose trial has not yet expired', async () => {
    const business = await makeBusiness({ trialEndsAt: futureTrial });

    await processor.runExpiry(now);

    const refreshed = await prisma.business.findUniqueOrThrow({
      where: { id: business.id },
    });
    expect(refreshed.planId).toBe(otherPlanId);
  });
});
