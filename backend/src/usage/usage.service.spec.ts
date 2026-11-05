import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EntitlementCacheService } from './entitlement-cache.service';
import { EntitlementsService } from './entitlements.service';
import { RemediesService } from './remedies.service';
import { CreditsService } from './credits.service';
import { MetersService } from './meters.service';
import { UsageSeedService } from './usage-seed.service';
import { SubscriptionService } from './subscription.service';
import { UsageStripeHelper } from './usage-stripe.helper';
import { StripeGatewayAdapter } from '../billing/adapters/stripe-gateway.adapter';
import { UsageLimitException } from './usage.exception';
import { addMonthsUtc } from './usage-period.util';

/**
 * Usage & Limits QA matrix (docs/Noxtill_Usage_Limits_System.md §19) against the real local MySQL
 * database — no mocked Prisma, so the atomic conditional UPDATEs are exercised for real.
 */
jest.setTimeout(60_000);

describe('Usage & Limits (spec §19)', () => {
  let prisma: PrismaService;
  let entitlements: EntitlementsService;
  let credits: CreditsService;
  let meters: MetersService;
  let subscriptions: SubscriptionService;
  const config = { get: () => undefined } as unknown as ConfigService;
  const businessIds: string[] = [];
  const userIds: string[] = [];
  const stamp = Date.now();

  async function makeBusiness(
    planKey: 'growth' | 'trial' | 'starter' | 'professional',
    opts: { credits?: number } = {},
  ) {
    const b = await prisma.business.create({
      data: {
        name: `Usage spec ${planKey}`,
        slug: `usage-spec-${planKey}-${stamp}-${businessIds.length}`,
      },
    });
    businessIds.push(b.id);
    const plan = await prisma.plan.findUniqueOrThrow({
      where: { key: planKey },
    });
    const now = new Date();
    await prisma.subscription.create({
      data: {
        businessId: b.id,
        planId: plan.id,
        status: planKey === 'trial' ? 'trialing' : 'active',
        periodStart: now,
        periodEnd:
          planKey === 'trial'
            ? new Date(now.getTime() + 14 * 86_400_000)
            : addMonthsUtc(now, 1),
        trialEndsAt:
          planKey === 'trial'
            ? new Date(now.getTime() + 14 * 86_400_000)
            : null,
        trialRemindersSent: [],
      },
    });
    for (const g of ['voice', 'messaging']) {
      await prisma.usageSpendCap.create({
        data: {
          businessId: b.id,
          capGroup: g,
          capUsd: 10,
          maxCallMinutes: g === 'voice' ? 10 : null,
        },
      });
    }
    const bal = await credits.ensureBalance(b.id);
    if (opts.credits != null) {
      await prisma.creditBalance.update({
        where: { businessId: b.id },
        data: { includedQuantity: opts.credits },
      });
    }
    return { id: b.id, balance: bal };
  }

  async function addMember(businessId: string, signedIn = true) {
    const u = await prisma.user.create({
      data: {
        name: 'Seat',
        email: `usage-spec-${stamp}-${userIds.length}@example.com`,
        passwordHash: 'x',
      },
    });
    userIds.push(u.id);
    await prisma.businessUser.create({
      data: { businessId, userId: u.id, role: 'staff' },
    });
    if (signedIn) {
      await prisma.session.create({
        data: { userId: u.id, businessId, refreshTokenHash: 'x' },
      });
    }
  }

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    entitlements = new EntitlementsService(
      prisma,
      new EntitlementCacheService(config),
    );
    const remedies = new RemediesService(prisma);
    credits = new CreditsService(prisma, entitlements, remedies);
    meters = new MetersService(prisma, entitlements, remedies);
    subscriptions = new SubscriptionService(
      prisma,
      entitlements,
      credits,
      new UsageStripeHelper(prisma, new StripeGatewayAdapter(config), config),
    );
    // The catalog is data: seed exactly what boot seeds (inserts only what's missing).
    for (const p of [
      { key: 'starter', price: 39 },
      { key: 'growth', price: 79 },
      { key: 'professional', price: 159 },
    ]) {
      await prisma.plan.upsert({
        where: { key: p.key },
        create: {
          key: p.key,
          name: p.key,
          price: p.price,
          msgQuota: 0,
          userLimit: 0,
        },
        update: {},
      });
    }
    await new UsageSeedService(prisma, entitlements).seed();
  });

  afterAll(async () => {
    const where = { businessId: { in: businessIds } };
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.creditLedger.deleteMany({ where });
      await tx.usageEvent.deleteMany({ where });
      await tx.creditBalance.deleteMany({ where });
      await tx.allowance.deleteMany({ where });
      await tx.spendHold.deleteMany({ where });
      await tx.usageSpendCap.deleteMany({ where });
      await tx.usageOutbox.deleteMany({ where });
      await tx.entitlementAudit.deleteMany({ where });
      await tx.capacityPurchase.deleteMany({ where });
      await tx.subscription.deleteMany({ where });
      await tx.session.deleteMany({ where: { userId: { in: userIds } } });
      await tx.businessUser.deleteMany({ where });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
      await tx.business.deleteMany({ where: { id: { in: businessIds } } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  const reserve = (businessId: string, key: string, quantity = 1) =>
    credits.reserve({
      businessId,
      operationCode: 'test.op',
      band: 'micro',
      quantity,
      idempotencyKey: key,
    });

  describe('credits', () => {
    it('CR-01 reserve with sufficient balance raises reserved', async () => {
      const b = await makeBusiness('growth');
      const r = await reserve(b.id, 'cr01', 3);
      expect(r.state).toBe('reserved');
      const bal = await prisma.creditBalance.findUniqueOrThrow({
        where: { businessId: b.id },
      });
      expect(bal.reserved).toBe(3);
    });

    it('CR-02 reserve with insufficient balance is a 402 with remedies, nothing reserved', async () => {
      const b = await makeBusiness('growth', { credits: 2 });
      const err = await reserve(b.id, 'cr02', 5).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UsageLimitException);
      expect((err as UsageLimitException).getStatus()).toBe(402);
      expect(
        (err as UsageLimitException).details.remedies.some(
          (r) => r.type === 'purchase',
        ),
      ).toBe(true);
      // Only plans that include MORE credits are offered.
      expect(
        (err as UsageLimitException).details.remedies
          .filter((r) => r.type === 'upgrade')
          .every((r) => (r.grants ?? 0) > 1500),
      ).toBe(true);
      const bal = await prisma.creditBalance.findUniqueOrThrow({
        where: { businessId: b.id },
      });
      expect(bal.reserved).toBe(0);
    });

    it('CR-03 twenty concurrent reserves of 1 against a balance of 10: exactly 10 succeed', async () => {
      const b = await makeBusiness('growth', { credits: 10 });
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) => reserve(b.id, `cr03-${i}`, 1)),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
      const bal = await prisma.creditBalance.findUniqueOrThrow({
        where: { businessId: b.id },
      });
      expect(bal.reserved).toBe(10);
    });

    it('CR-04/05 commit charges and clears the hold; release charges nothing', async () => {
      const b = await makeBusiness('growth');
      const a = await reserve(b.id, 'cr04', 8);
      await credits.commit(a.reservationId, 3);
      const c = await reserve(b.id, 'cr05', 4);
      await credits.release(c.reservationId, 'provider_error');
      const bal = await prisma.creditBalance.findUniqueOrThrow({
        where: { businessId: b.id },
      });
      expect(bal.reserved).toBe(0);
      expect(bal.includedUsed).toBe(3);
    });

    it('CR-06 the same idempotency key twice is one reservation and one charge', async () => {
      const b = await makeBusiness('growth');
      const first = await reserve(b.id, 'cr06', 3);
      const second = await reserve(b.id, 'cr06', 3);
      expect(second.reservationId).toBe(first.reservationId);
      expect(second.replayed).toBe(true);
      await credits.commit(first.reservationId);
      await credits.commit(first.reservationId);
      const bal = await prisma.creditBalance.findUniqueOrThrow({
        where: { businessId: b.id },
      });
      expect(bal.includedUsed).toBe(3);
    });

    it('CR-07 a reservation abandoned past 15 minutes is auto-released', async () => {
      const b = await makeBusiness('growth');
      const r = await reserve(b.id, 'cr07', 5);
      await prisma.creditLedger.update({
        where: { id: r.reservationId },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      await credits.sweepExpired();
      const row = await prisma.creditLedger.findUniqueOrThrow({
        where: { id: r.reservationId },
      });
      expect(row.state).toBe('expired');
      const bal = await prisma.creditBalance.findUniqueOrThrow({
        where: { businessId: b.id },
      });
      expect(bal.reserved).toBe(0);
    });

    it('CR-08 actual above reserved is committed and emits estimate_exceeded', async () => {
      const b = await makeBusiness('growth');
      const r = await reserve(b.id, 'cr08', 2);
      await credits.commit(r.reservationId, 8);
      const bal = await prisma.creditBalance.findUniqueOrThrow({
        where: { businessId: b.id },
      });
      expect(bal.includedUsed).toBe(8);
      expect(
        await prisma.usageOutbox.count({
          where: { businessId: b.id, type: 'usage.estimate_exceeded' },
        }),
      ).toBe(1);
    });

    it('CR-09/10 included runs out → purchased is used; a period roll resets included and keeps purchased', async () => {
      const b = await makeBusiness('growth', { credits: 2 });
      await credits.grantPurchased(b.id, 1000, `cr09-${stamp}`);
      const r = await reserve(b.id, 'cr09', 5);
      await credits.commit(r.reservationId, 5);
      let bal = await prisma.creditBalance.findUniqueOrThrow({
        where: { businessId: b.id },
      });
      expect(bal.includedUsed).toBe(2);
      expect(bal.purchasedBalance).toBe(997);
      // Simulate a new usage window.
      const past = new Date(Date.now() - 40 * 86_400_000);
      await prisma.subscription.update({
        where: { businessId: b.id },
        data: { periodStart: past, periodEnd: addMonthsUtc(past, 1) },
      });
      await prisma.creditBalance.update({
        where: { businessId: b.id },
        data: { periodStart: past },
      });
      bal = await credits.ensureBalance(b.id);
      expect(bal.includedUsed).toBe(0);
      expect(bal.includedQuantity).toBe(1500);
      expect(bal.purchasedBalance).toBe(997);
    });

    it('CR-11 the balance never goes negative across random concurrent reserve/commit/release', async () => {
      const b = await makeBusiness('growth', { credits: 30 });
      await Promise.allSettled(
        Array.from({ length: 40 }, async (_, i) => {
          const r = await reserve(b.id, `cr11-${i}`, 1 + (i % 4));
          if (i % 3 === 0) await credits.release(r.reservationId, 'test');
          else await credits.commit(r.reservationId, 1 + (i % 7));
        }),
      );
      const bal = await prisma.creditBalance.findUniqueOrThrow({
        where: { businessId: b.id },
      });
      expect(bal.includedUsed).toBeLessThanOrEqual(bal.includedQuantity);
      expect(bal.reserved).toBe(0);
      expect(
        bal.includedQuantity - bal.includedUsed + bal.purchasedBalance,
      ).toBeGreaterThanOrEqual(0);
    });
  });

  describe('capacity', () => {
    it('CP-01/02/04 the owner and pending invites hold seats; inviting at the limit is a 403 with remedies', async () => {
      const b = await makeBusiness('starter'); // 2 users
      await addMember(b.id, true);
      await addMember(b.id, false); // invited, never signed in — still holds a seat
      const seats = await entitlements.seatCounts(b.id);
      expect(seats.total).toBe(2);
      expect(seats.pending).toBe(1);
      const err = await meters
        .assertCapacity(b.id, 'users')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UsageLimitException);
      expect((err as UsageLimitException).getStatus()).toBe(403);
      expect(
        (err as UsageLimitException).details.remedies.length,
      ).toBeGreaterThan(0);
    });

    it('CP-05 a purchased seat is usable immediately', async () => {
      const b = await makeBusiness('starter');
      await addMember(b.id);
      await addMember(b.id);
      await prisma.capacityPurchase.create({
        data: {
          businessId: b.id,
          metricCode: 'users',
          quantity: 1,
          unitPriceUsd: 10,
          recurring: true,
          status: 'active',
          activeFrom: new Date(),
        },
      });
      await expect(
        meters.assertCapacity(b.id, 'users'),
      ).resolves.toBeUndefined();
    });

    it('CP-06 a location at the limit is refused with the add-location price', async () => {
      const b = await makeBusiness('growth'); // 1 location — the business itself
      const err = (await meters
        .assertCapacity(b.id, 'locations')
        .catch((e: unknown) => e)) as UsageLimitException;
      expect(err).toBeInstanceOf(UsageLimitException);
      expect(err.message).toMatch(/\$39\.00\/month/);
    });
  });

  describe('spend caps', () => {
    it('SC-01 an operation that would exceed the cap is refused before anything is charged', async () => {
      const b = await makeBusiness('growth');
      await meters.holdSpend({
        businessId: b.id,
        group: 'messaging',
        metricCode: 'sms_segments',
        amountUsd: 9,
        idempotencyKey: 'sc01-a',
        ttlMs: 60_000,
        what: 'This SMS',
      });
      const err = await meters
        .holdSpend({
          businessId: b.id,
          group: 'messaging',
          metricCode: 'sms_segments',
          amountUsd: 2,
          idempotencyKey: 'sc01-b',
          ttlMs: 60_000,
          what: 'This SMS',
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UsageLimitException);
      expect((err as UsageLimitException).getStatus()).toBe(402);
    });

    it('SC-02 an in-flight hold settles at its real cost; a released hold charges nothing', async () => {
      const b = await makeBusiness('growth');
      const h = await meters.holdSpend({
        businessId: b.id,
        group: 'voice',
        metricCode: 'ai_voice_minutes',
        amountUsd: 3.5,
        idempotencyKey: 'sc02',
        ttlMs: 60_000,
        what: 'A call',
      });
      await meters.settleHold(h.holdId, 1.47, {
        metricCode: 'ai_voice_minutes',
        quantity: 4.2,
        unit: 'minute',
        idempotencyKey: 'sc02-ev',
      });
      const caps = await entitlements.spendCaps(b.id, {
        start: (
          await prisma.allowance.findFirstOrThrow({
            where: { businessId: b.id },
          })
        ).periodStart,
        end: new Date(),
      });
      expect(caps.voice.spentUsd).toBeCloseTo(1.47, 2);
      expect(caps.voice.reservedUsd).toBe(0);
    });

    it('SC-03 an AI call with less than the longest call of headroom is not admitted', async () => {
      const b = await makeBusiness('growth');
      await prisma.usageSpendCap.update({
        where: { businessId_capGroup: { businessId: b.id, capGroup: 'voice' } },
        data: { capUsd: 2 },
      });
      const admission = await meters.admitAiCall(b.id, `CA-sc03-${stamp}`);
      expect(admission.admitted).toBe(false);
    });

    it('SC-04 no spend-cap override flag exists anywhere in usage code', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs') as typeof import('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path') as typeof import('path');
      const dir = path.join(__dirname);
      const src = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
        .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
        .join('\n');
      expect(src).not.toMatch(
        /override(Cap|Limit)|bypassCap|skipSpendCap|ignoreCap/i,
      );
    });
  });

  describe('plans and trial', () => {
    it('PL-01/04 an applied upgrade keeps used credits (no free credits from upgrade/downgrade loops)', async () => {
      const b = await makeBusiness('growth');
      const r = await reserve(b.id, 'pl01', 3);
      await credits.commit(r.reservationId, 3);
      await prisma.creditBalance.update({
        where: { businessId: b.id },
        data: { includedUsed: 1400 },
      });
      const pro = await prisma.plan.findUniqueOrThrow({
        where: { key: 'professional' },
      });
      await subscriptions.applyPlan(b.id, pro.id, 'month', {
        actorType: 'system',
        reason: 'test',
        resetPeriod: true,
      });
      const bal = await credits.ensureBalance(b.id);
      expect(bal.includedQuantity).toBe(4000);
      expect(bal.includedUsed).toBe(1400);
    });

    it('PL-02 a downgrade with capacity over the target is blocked and names the blocker', async () => {
      const b = await makeBusiness('professional');
      for (let i = 0; i < 3; i++) await addMember(b.id);
      const err = await subscriptions
        .changePlan(b.id, 'actor', { planKey: 'starter', interval: 'month' })
        .catch((e: unknown) => e);
      expect((err as Error).message).toMatch(
        /Starter includes 2|starter includes 2/i,
      );
    });

    it('PL-03 a downgrade within limits is scheduled for the period end', async () => {
      const b = await makeBusiness('professional');
      const res = await subscriptions.changePlan(b.id, 'actor', {
        planKey: 'growth',
        interval: 'month',
      });
      expect(res.effective).toBe('period_end');
      const sub = await prisma.subscription.findUniqueOrThrow({
        where: { businessId: b.id },
        include: { scheduledPlan: true },
      });
      expect(sub.scheduledPlan?.key).toBe('growth');
    });

    it('TR-01 a trial grants 200 credits total; TR-02 SMS on trial is refused', async () => {
      const b = await makeBusiness('trial');
      expect(b.balance.includedQuantity).toBe(200);
      const err = await meters
        .assertMeteredAllowed(b.id, 'sms_segments', 'Sending SMS')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UsageLimitException);
    });

    it('TR-03 a phone number on trial is refused', async () => {
      const b = await makeBusiness('trial');
      const err = await meters
        .assertCapacity(b.id, 'phone_numbers_local')
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(UsageLimitException);
    });

    it('TR-05 a trial that ends with no card is paused, not deleted', async () => {
      const b = await makeBusiness('trial');
      await prisma.subscription.update({
        where: { businessId: b.id },
        data: { trialEndsAt: new Date(Date.now() - 1000) },
      });
      await subscriptions.endDueTrials();
      const sub = await prisma.subscription.findUniqueOrThrow({
        where: { businessId: b.id },
      });
      expect(sub.status).toBe('paused');
      expect(await prisma.business.count({ where: { id: b.id } })).toBe(1);
      expect(entitlements.statusFlags(sub).suspended).toBe(true);
    });
  });

  describe('isolation', () => {
    it('IS-02 a reservation is always taken against the caller’s own root business', async () => {
      const a = await makeBusiness('growth');
      const r = await reserve(a.id, 'is02', 1);
      const row = await prisma.creditLedger.findUniqueOrThrow({
        where: { id: r.reservationId },
      });
      expect(row.businessId).toBe(a.id);
    });
  });
});
