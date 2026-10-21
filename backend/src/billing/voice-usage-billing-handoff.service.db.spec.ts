import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AppException } from '../common/filters/app.exception';
import { StripeGatewayAdapter } from './adapters/stripe-gateway.adapter';
import { VoiceUsageBillingHandoffService } from './voice-usage-billing-handoff.service';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceUsageBillingHandoffService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceUsageBillingHandoffService;
  let businessId: string;
  let ownerId: string;
  let staffId: string;
  let rateVersionId: string;
  const create = jest.fn();
  const stripe = {
    stripe: { invoiceItems: { create } },
  } as unknown as StripeGatewayAdapter;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new VoiceUsageBillingHandoffService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      stripe,
    );
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Usage Handoff',
          slug: `voice-handoff-${suffix}`,
          stripeCustomerId: `cus_${suffix}`,
        },
      })
    ).id;
    ownerId = (
      await prisma.user.create({
        data: {
          email: `owner-${suffix}@example.com`,
          passwordHash: 'x',
          name: 'Owner',
        },
      })
    ).id;
    staffId = (
      await prisma.user.create({
        data: {
          email: `staff-${suffix}@example.com`,
          passwordHash: 'x',
          name: 'Staff',
        },
      })
    ).id;
    await prisma.businessUser.createMany({
      data: [
        { businessId, userId: ownerId, role: 'owner' },
        { businessId, userId: staffId, role: 'manager' },
      ],
    });
    rateVersionId = (
      await prisma.voiceBillingRateVersion.create({
        data: {
          businessId,
          version: 1,
          sourceVersion: `v-${suffix}`.slice(0, 80),
          sourceReference: 'Test rate card reference',
          sourceHash: 'a'.repeat(64),
          currency: 'USD',
          currencyMinorUnits: 2,
          rates: [],
          effectiveFrom: new Date('2026-01-01T00:00:00Z'),
          approvedAt: new Date(),
          approvedByUserId: ownerId,
        },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.voiceBillingAdjustment.deleteMany({ where: { businessId } });
      await tx.voiceBillingDraft.deleteMany({ where: { businessId } });
      await tx.voiceBillingRateVersion.deleteMany({ where: { businessId } });
      await tx.businessUser.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.user.deleteMany({ where: { id: { in: [ownerId, staffId] } } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  beforeEach(() => create.mockReset());

  const draft = (status: string, total = '12.345') =>
    prisma.voiceBillingDraft.create({
      data: {
        businessId,
        rateVersionId,
        periodStart: new Date('2026-09-01T00:00:00Z'),
        periodEnd: new Date('2026-10-01T00:00:00Z'),
        currency: 'USD',
        currencyMinorUnits: 2,
        total: new Prisma.Decimal(total),
        evidenceHash: 'b'.repeat(64),
        itemCount: 3,
        items: [],
        status,
        createdByUserId: ownerId,
      },
    });

  it('posts an approved draft once with an idempotency key and records the invoice item', async () => {
    create.mockResolvedValue({ id: 'ii_123' });
    const approved = await draft('approved');
    const result = await service.post(businessId, ownerId, approved.id);
    expect(result).toMatchObject({
      status: 'posted',
      providerInvoiceItemId: 'ii_123',
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: `cus_${suffix}`,
        amount: 1235,
        currency: 'usd',
      }),
      { idempotencyKey: `voice-usage-draft-${approved.id}` },
    );
    // A second click returns the posted draft without calling Stripe again.
    await service.post(businessId, ownerId, approved.id);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('refuses non-owners and unapproved drafts, and keeps a rejected post retryable', async () => {
    const pending = await draft('draft');
    await expect(
      service.post(businessId, staffId, pending.id),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      service.post(businessId, ownerId, pending.id),
    ).rejects.toBeInstanceOf(AppException);
    expect(create).not.toHaveBeenCalled();

    const approved = await draft('approved');
    create.mockRejectedValueOnce(new Error('card_declined'));
    await expect(
      service.post(businessId, ownerId, approved.id),
    ).rejects.toBeInstanceOf(AppException);
    const row = await prisma.voiceBillingDraft.findUniqueOrThrow({
      where: { id: approved.id },
    });
    expect(row).toMatchObject({
      status: 'approved',
      postError: 'card_declined',
      providerInvoiceItemId: null,
    });
  });

  it('credits posted usage as negative invoice items, never beyond the billed total', async () => {
    create.mockImplementation((params: { amount: number }) =>
      Promise.resolve({ id: `ii_credit_${params.amount}` }),
    );
    const posted = await draft('posted', '12.35');
    await expect(
      service.credit(
        businessId,
        ownerId,
        posted.id,
        '5.00',
        'Duplicate test calls billed',
      ),
    ).resolves.toMatchObject({
      status: 'posted',
      amount: '5',
    });
    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        amount: -500,
        currency: 'usd',
        customer: `cus_${suffix}`,
      }),
      expect.objectContaining({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        idempotencyKey: expect.stringMatching(/^voice-usage-credit-/),
      }),
    );
    await expect(
      service.credit(
        businessId,
        ownerId,
        posted.id,
        '8.00',
        'Second credit too large',
      ),
    ).rejects.toBeInstanceOf(AppException);

    // A rejected credit keeps its amount reserved; retrying posts it once.
    create.mockRejectedValueOnce(new Error('stripe_down'));
    await expect(
      service.credit(
        businessId,
        ownerId,
        posted.id,
        '7.35',
        'Rest of the period refunded',
      ),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      service.credit(
        businessId,
        ownerId,
        posted.id,
        '0.01',
        'Over the remaining amount',
      ),
    ).rejects.toBeInstanceOf(AppException);
    const failed = (await service.adjustments(businessId, posted.id)).find(
      (a) => a.status === 'failed',
    )!;
    await expect(
      service.postCredit(businessId, ownerId, failed.id),
    ).resolves.toMatchObject({ status: 'posted' });
    expect(
      (await service.adjustments(businessId, posted.id)).every(
        (a) => a.status === 'posted',
      ),
    ).toBe(true);
  });

  it('refuses credits on unsent drafts and from non-owners', async () => {
    const approved = await draft('approved');
    await expect(
      service.credit(
        businessId,
        ownerId,
        approved.id,
        '1.00',
        'Not yet billed usage',
      ),
    ).rejects.toBeInstanceOf(AppException);
    const posted = await draft('posted');
    await expect(
      service.credit(
        businessId,
        staffId,
        posted.id,
        '1.00',
        'Manager tries to credit',
      ),
    ).rejects.toBeInstanceOf(AppException);
  });
});
