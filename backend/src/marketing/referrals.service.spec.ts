import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ReferralsService } from './referrals.service';
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

describe('ReferralsService (BE-062)', () => {
  let prisma: PrismaService;
  let service: ReferralsService;
  let businessId: string;
  let referrerId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new ReferralsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Referrals Test Biz',
        slug: `referrals-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const referrer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Referrer Rita' },
    });
    referrerId = referrer.id;
  });

  afterAll(async () => {
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('persists reward config and returns it back', async () => {
    await service.updateSettings(businessId, {
      enabled: true,
      rewardType: 'credit',
      rewardValue: 20,
    });

    const settings = await service.getSettings(businessId);
    expect(settings).toEqual({
      enabled: true,
      rewardType: 'credit',
      rewardValue: 20,
    });
  });

  it('rejects redeeming an unknown code', async () => {
    await expect(
      service.redeem(businessId, {
        code: 'does-not-exist',
        refereePhone: `+1${Date.now()}`,
        refereeName: 'Nobody',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('links a new customer to their referrer and reflects it in stats', async () => {
    const refereePhone = `+1${Date.now()}9`;
    const referee = await service.redeem(businessId, {
      code: referrerId,
      refereePhone,
      refereeName: 'New Nancy',
    });
    expect(referee.referredByCustomerId).toBe(referrerId);

    const stats = await service.stats();
    expect(stats.totalReferred).toBeGreaterThanOrEqual(1);
    const row = stats.leaderboard.find((r) => r.customerId === referrerId);
    expect(row).toMatchObject({ name: 'Referrer Rita', count: 1 });
  });

  it("credits the referrer when their referral's first order completes (settings already enabled/credit/20 from the first test)", async () => {
    const referee = await service.redeem(businessId, {
      code: referrerId,
      refereePhone: `+1${Date.now()}8`,
      refereeName: 'Rewarded Rex',
    });
    await prisma.customer.update({
      where: { id: referee.id },
      data: { visitCount: 1 },
    });

    await prisma.$transaction((tx) =>
      service.issueRewardIfEligible(businessId, referee.id, tx),
    );

    const rewardedReferee = await prisma.customer.findUniqueOrThrow({
      where: { id: referee.id },
    });
    expect(rewardedReferee.referralRewardedAt).not.toBeNull();

    const creditEntry = await prisma.creditEntry.findFirst({
      where: { customerId: referrerId, note: 'Referral reward' },
    });
    expect(creditEntry).not.toBeNull();
    expect(Number(creditEntry!.amount)).toBe(20);

    const stats = await service.stats();
    expect(stats.rewardsIssued).toBeGreaterThanOrEqual(1);
    expect(stats.converted).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent — calling it again for the same referee issues no second reward', async () => {
    const referee = await service.redeem(businessId, {
      code: referrerId,
      refereePhone: `+1${Date.now()}7`,
      refereeName: 'Idempotent Ivy',
    });
    await prisma.customer.update({
      where: { id: referee.id },
      data: { visitCount: 1 },
    });

    const before = await prisma.creditEntry.count({
      where: { customerId: referrerId, note: 'Referral reward' },
    });

    await prisma.$transaction((tx) =>
      service.issueRewardIfEligible(businessId, referee.id, tx),
    );
    await prisma.$transaction((tx) =>
      service.issueRewardIfEligible(businessId, referee.id, tx),
    );

    const after = await prisma.creditEntry.count({
      where: { customerId: referrerId, note: 'Referral reward' },
    });
    expect(after - before).toBe(1);
  });

  it('does nothing for a customer who was not referred', async () => {
    const organic = await prisma.customer.create({
      data: {
        businessId,
        phone: `+1${Date.now()}6`,
        name: 'Organic Oscar',
        visitCount: 1,
      },
    });

    await prisma.$transaction((tx) =>
      service.issueRewardIfEligible(businessId, organic.id, tx),
    );

    const refreshed = await prisma.customer.findUniqueOrThrow({
      where: { id: organic.id },
    });
    expect(refreshed.referralRewardedAt).toBeNull();
  });
});
