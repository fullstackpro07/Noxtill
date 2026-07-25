import { PrismaService } from '../prisma/prisma.service';
import { PlanAssignmentService } from './plan-assignment.service';
import { BASIC_PLAN_KEY } from './billing.constants';

describe('PlanAssignmentService (BE-065)', () => {
  let prisma: PrismaService;
  let service: PlanAssignmentService;
  let businessId: string;
  let proPlanId: string;
  let proPriceId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new PlanAssignmentService(prisma);

    await prisma.plan.upsert({
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

    proPriceId = `price_pro_${Date.now()}`;
    const pro = await prisma.plan.upsert({
      where: { key: 'pro' },
      create: {
        key: 'pro',
        name: 'Pro',
        price: 49,
        msgQuota: 5000,
        userLimit: 15,
        stripePriceId: proPriceId,
      },
      update: { stripePriceId: proPriceId, msgQuota: 5000 },
    });
    proPlanId = pro.id;

    const business = await prisma.business.create({
      data: {
        name: 'Plan Assignment Test Biz',
        slug: `plan-assignment-test-${Date.now()}`,
        msgQuota: 999,
      },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('assigns a business to the plan matching a Stripe price id, syncing msgQuota', async () => {
    await service.assignByStripePriceId(businessId, proPriceId);

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    expect(business.planId).toBe(proPlanId);
    expect(business.msgQuota).toBe(5000);
  });

  it('leaves the business untouched when the price id matches no plan', async () => {
    await service.assignByStripePriceId(businessId, 'price_unknown_xyz');

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    expect(business.planId).toBe(proPlanId); // unchanged from the previous test
  });

  it('downgrades a business to Basic, syncing msgQuota down', async () => {
    await service.downgradeToBasic(businessId);

    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const basic = await prisma.plan.findUniqueOrThrow({
      where: { key: BASIC_PLAN_KEY },
    });
    expect(business.planId).toBe(basic.id);
    expect(business.msgQuota).toBe(200);
  });
});
