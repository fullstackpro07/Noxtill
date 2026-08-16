import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { LoyaltyService } from './loyalty.service';
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

describe('LoyaltyService (UPD-BE-024)', () => {
  let prisma: PrismaService;
  let loyaltyService: LoyaltyService;
  let businessId: string;
  let customerId: string;
  const cleanupBusinessIds: string[] = [];
  let orderCounter = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    loyaltyService = new LoyaltyService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Loyalty Test Biz', slug: `loyalty-test-${Date.now()}` },
    });
    businessId = business.id;
    cleanupBusinessIds.push(businessId);
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Loyalty Customer' },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    for (const id of cleanupBusinessIds) {
      await prisma.stamp.deleteMany({ where: { member: { businessId: id } } });
      await prisma.loyaltyMember.deleteMany({ where: { businessId: id } });
      await prisma.loyaltyProgram.deleteMany({ where: { businessId: id } });
      await prisma.order.deleteMany({ where: { businessId: id } });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } });
    }
    await prisma.$disconnect();
  });

  async function makeOrder(bizId: string) {
    orderCounter += 1;
    return prisma.order.create({
      data: { businessId: bizId, orderNo: 900000 + orderCounter },
    });
  }

  /** Fresh business + customer — used whenever a test needs the ONLY active punch-card program to
   * be unambiguous (issueStampIfEligible picks any active program for the business, so tests
   * sharing a business with several programs can't assert which one gets stamped). */
  async function makeIsolatedBusinessAndCustomer() {
    const n = cleanupBusinessIds.length;
    const biz = await prisma.business.create({
      data: {
        name: `Isolated Loyalty Biz ${n}`,
        slug: `isolated-loyalty-${Date.now()}-${n}`,
      },
    });
    cleanupBusinessIds.push(biz.id);
    const cust = await prisma.customer.create({
      data: {
        businessId: biz.id,
        phone: `+1${Date.now()}${n}`,
        name: 'Isolated Customer',
      },
    });
    return { businessId: biz.id, customerId: cust.id };
  }

  it('creates a punch-card program with the given stamps-required threshold', async () => {
    const program = await loyaltyService.createProgram({
      name: 'Coffee Card',
      stampsRequired: 5,
      rewardDescription: 'Free coffee',
    });
    expect(program.type).toBe('punch_card');
    expect(program.stampsRequired).toBe(5);
  });

  it('enrolling a customer creates a member with zero stamps, idempotently', async () => {
    const program = await loyaltyService.createProgram({
      name: 'Enroll Card',
      stampsRequired: 10,
    });

    const first = await loyaltyService.enroll(program.id, { customerId });
    const second = await loyaltyService.enroll(program.id, { customerId });
    expect(first.id).toBe(second.id);
    expect(first.stampCount).toBe(0);
  });

  it('issueStampIfEligible is a no-op when no active punch-card program exists', async () => {
    const iso = await makeIsolatedBusinessAndCustomer();
    const order = await makeOrder(iso.businessId);

    await prisma.$transaction((tx) =>
      loyaltyService.issueStampIfEligible(
        iso.businessId,
        iso.customerId,
        order.id,
        tx,
      ),
    );

    const members = await prisma.loyaltyMember.findMany({
      where: { businessId: iso.businessId },
    });
    expect(members).toHaveLength(0);
  });

  it('issuing a stamp on a real sale auto-enrolls the customer and increments their count', async () => {
    const iso = await makeIsolatedBusinessAndCustomer();
    const cls = new FakeClsService();
    cls.set(CLS_KEY_BUSINESS_ID, iso.businessId);
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const isolatedLoyalty = new LoyaltyService(tenantPrisma);

    const program = await isolatedLoyalty.createProgram({
      name: 'Sale-issued Card',
      stampsRequired: 3,
    });

    const order = await makeOrder(iso.businessId);
    await prisma.$transaction((tx) =>
      isolatedLoyalty.issueStampIfEligible(
        iso.businessId,
        iso.customerId,
        order.id,
        tx,
      ),
    );

    const member = await prisma.loyaltyMember.findUniqueOrThrow({
      where: {
        programId_customerId: {
          programId: program.id,
          customerId: iso.customerId,
        },
      },
    });
    expect(member.stampCount).toBe(1);

    const stamps = await prisma.stamp.findMany({
      where: { memberId: member.id },
    });
    expect(stamps).toHaveLength(1);
    expect(stamps[0].orderId).toBe(order.id);
  });

  it('redeeming a full punch card resets the count and marks the oldest stamps redeemed', async () => {
    const iso = await makeIsolatedBusinessAndCustomer();
    const cls = new FakeClsService();
    cls.set(CLS_KEY_BUSINESS_ID, iso.businessId);
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const isolatedLoyalty = new LoyaltyService(tenantPrisma);

    const program = await isolatedLoyalty.createProgram({
      name: 'Redeem Card',
      stampsRequired: 2,
    });
    for (let i = 0; i < 2; i++) {
      const order = await makeOrder(iso.businessId);
      await prisma.$transaction((tx) =>
        isolatedLoyalty.issueStampIfEligible(
          iso.businessId,
          iso.customerId,
          order.id,
          tx,
        ),
      );
    }
    const member = await prisma.loyaltyMember.findUniqueOrThrow({
      where: {
        programId_customerId: {
          programId: program.id,
          customerId: iso.customerId,
        },
      },
    });
    expect(member.stampCount).toBe(2);

    const redeemed = await isolatedLoyalty.redeem(member.id);
    expect(redeemed.stampCount).toBe(0);
    expect(redeemed.redeemedCount).toBe(1);
  });

  it('rejects redeeming before enough stamps are collected', async () => {
    const program = await loyaltyService.createProgram({
      name: 'Not Enough Card',
      stampsRequired: 10,
    });
    const member = await loyaltyService.enroll(program.id, { customerId });

    await expect(loyaltyService.redeem(member.id)).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('a tier program computes the current tier from real Customer.lifetimeSpend, never a stored/fabricated value', async () => {
    const spender = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}2`,
        name: 'Big Spender',
        lifetimeSpend: 250,
      },
    });
    const program = await loyaltyService.createProgram({
      name: 'Spend Tiers',
      type: 'tier',
      tiers: [
        { name: 'Silver', minSpend: 100 },
        { name: 'Gold', minSpend: 500 },
      ],
    });
    await loyaltyService.enroll(program.id, { customerId: spender.id });

    const members = (await loyaltyService.listMembers(
      program.id,
    )) as unknown as {
      customerId: string;
      currentTier: string | null;
    }[];
    const row = members.find((m) => m.customerId === spender.id);
    expect(row?.currentTier).toBe('Silver');
  });
});
