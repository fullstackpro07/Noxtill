import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VoiceUsageBillingService } from './voice-usage-billing.service';
import { VoiceRateCardSource } from './voice-usage-billing.constants';

class FakeCls {
  businessId = '';
  get<T>(key: string): T {
    return (key === CLS_KEY_BUSINESS_ID ? this.businessId : undefined) as T;
  }
}

describe('Voice platform usage billing (real MySQL)', () => {
  const prisma = new PrismaService();
  const cls = new FakeCls();
  let service: VoiceUsageBillingService;
  let businessId: string;
  let otherBusinessId: string;
  let ownerId: string;
  let staffId: string;
  let configured: string | undefined;
  const month = new Date().toISOString().slice(0, 7);
  const monthStart = new Date(`${month}-01T00:00:00.000Z`);
  const source = (revision = 'qa-v1'): VoiceRateCardSource => ({
    sourceVersion: revision,
    sourceReference: 'QA-only test tariff fixture, not a commercial offer',
    currency: 'USD',
    currencyMinorUnits: 2,
    effectiveFrom: monthStart.toISOString(),
    rates: [
      {
        provider: 'twilio',
        unit: 'inbound_provider_seconds',
        price: '0.03',
        perQuantity: '60',
      },
    ],
  });

  beforeAll(async () => {
    await prisma.$connect();
    service = new VoiceUsageBillingService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      { get: () => configured } as unknown as ConfigService,
    );
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    const stamp = randomUUID();
    businessId = (
      await prisma.business.create({
        data: { name: 'QA usage billing fixture', slug: `voice-bill-${stamp}` },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: {
          name: 'Other QA billing fixture',
          slug: `voice-bill-other-${stamp}`,
        },
      })
    ).id;
    ownerId = (
      await prisma.user.create({
        data: {
          name: 'QA billing owner',
          email: `voice-bill-${stamp}@example.com`,
          passwordHash: 'test-only',
        },
      })
    ).id;
    staffId = (
      await prisma.user.create({
        data: {
          name: 'QA billing staff',
          email: `voice-bill-staff-${stamp}@example.com`,
          passwordHash: 'test-only',
        },
      })
    ).id;
    await prisma.businessUser.createMany({
      data: [
        { businessId, userId: ownerId, role: 'owner' },
        { businessId: otherBusinessId, userId: ownerId, role: 'owner' },
        { businessId, userId: staffId, role: 'staff' },
      ],
    });
    cls.businessId = businessId;
    configured = JSON.stringify(source());
  });
  afterEach(async () => {
    const ids = [businessId, otherBusinessId];
    await prisma.voiceBillingUsageClaim.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.voiceBillingDraft.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.voiceBillingRateVersion.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.auditLog.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.voiceUsageRecord.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.phoneCall.deleteMany({ where: { businessId: { in: ids } } });
    await prisma.businessUser.deleteMany({
      where: { businessId: { in: ids } },
    });
    await prisma.business.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, staffId] } } });
  });

  async function approvedRate() {
    const captured = await service.captureRates(businessId, ownerId);
    await service.approveRates(
      businessId,
      ownerId,
      captured.id,
      'Reviewed QA fixture rates',
    );
    // Explicit fixture times avoid a sleep or clock race between approval and measured usage.
    return prisma.voiceBillingRateVersion.update({
      where: { id: captured.id },
      data: { approvedAt: new Date(Date.now() - 5000) },
    });
  }
  function usage(quantity = 60, extra: Record<string, unknown> = {}) {
    return prisma.voiceUsageRecord.create({
      data: {
        businessId,
        eventKey: `qa-bill:${randomUUID()}`,
        provider: 'twilio',
        unit: 'inbound_provider_seconds',
        quantity,
        cost: '0.01',
        currency: 'USD',
        state: 'confirmed',
        evidence: { source: 'explicit_qa_provider_fixture' },
        measuredAt: new Date(Date.now() - 500),
        ...extra,
      },
    });
  }

  it('discloses missing/invalid operator configuration without breaking the billing page', async () => {
    configured = undefined;
    expect(
      (await service.overview(businessId, month)).configuredSource,
    ).toBeNull();
    await expect(
      service.captureRates(businessId, ownerId),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_BILLING_RATES_NOT_CONFIGURED' },
    });
    configured = JSON.stringify({
      ...source(),
      rates: [
        {
          provider: 'noxtill',
          unit: 'budget_warning',
          price: '1',
          perQuantity: '1',
        },
      ],
    });
    const overview = await service.overview(businessId, month);
    expect(overview.configurationError).toBeTruthy();
    expect(overview.configuredSource).toBeNull();
    await expect(
      service.captureRates(businessId, ownerId),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_BILLING_RATE_CONFIG_INVALID' },
    });
  });

  it('captures immutable operator revisions and requires a live active-owner membership', async () => {
    await expect(
      service.captureRates(businessId, staffId),
    ).rejects.toMatchObject({ status: 403 });
    const first = await service.captureRates(businessId, ownerId);
    expect((await service.captureRates(businessId, ownerId)).id).toBe(first.id);
    configured = JSON.stringify({ ...source(), currency: 'EUR' });
    await expect(
      service.captureRates(businessId, ownerId),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_BILLING_RATE_REVISION_CHANGED' },
    });
    configured = JSON.stringify({ ...source('qa-v2'), currency: 'EUR' });
    const next = await service.captureRates(businessId, ownerId);
    expect(next.version).toBe(2);
    await service.approveRates(
      businessId,
      ownerId,
      next.id,
      'Reviewed updated QA rates',
    );
    await expect(
      service.approveRates(
        businessId,
        ownerId,
        first.id,
        'Try older QA rate version',
      ),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_BILLING_RATE_SUPERSEDED' },
    });
    expect(
      (
        await prisma.voiceBillingRateVersion.findUniqueOrThrow({
          where: { id: first.id },
        })
      ).currency,
    ).toBe('USD');
    expect(
      await prisma.auditLog.count({
        where: { businessId, action: 'voice.billing.rates_captured' },
      }),
    ).toBe(2);
    await prisma.businessUser.updateMany({
      where: { businessId, userId: ownerId },
      data: { active: false },
    });
    await expect(
      service.captureRates(businessId, ownerId),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('excludes pre-approval, test and pending usage and rounds the total only once', async () => {
    const rate = await approvedRate();
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA${randomUUID().replaceAll('-', '')}`,
        fromNumber: '+15555550100',
        isTestCall: true,
        status: 'completed',
      },
    });
    await usage(60, { callId: call.id });
    await usage(60, { measuredAt: new Date(rate.approvedAt!.getTime() - 1) });
    await usage(0, { state: 'pending' });
    await usage(60, { unit: 'outbound_provider_seconds' });
    await usage(30);
    await usage(30);
    const draft = await service.createDraft(
      businessId,
      ownerId,
      rate.id,
      month,
    );
    expect(draft.itemCount).toBe(2);
    expect(draft.total.toString()).toBe('0.03');
    const detail = await service.detail(businessId, draft.id);
    expect(detail.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          quantity: '30',
          amount: '0.015',
          providerCost: '0.01',
          providerCurrency: 'USD',
        }),
      ]),
    );
    await service.decideDraft(
      businessId,
      ownerId,
      draft.id,
      'approved',
      'Reviewed both QA usage rows',
    );
    expect(
      await prisma.voiceBillingUsageClaim.count({ where: { businessId } }),
    ).toBe(2);
    expect((await service.overview(businessId, month)).drafts[0].status).toBe(
      'approved',
    );
  });

  it('prevents two concurrent approvals from billing the same usage', async () => {
    const rate = await approvedRate();
    await usage();
    const first = await service.createDraft(
      businessId,
      ownerId,
      rate.id,
      month,
    );
    const second = await service.createDraft(
      businessId,
      ownerId,
      rate.id,
      month,
    );
    const results = await Promise.allSettled(
      [first.id, second.id].map((id) =>
        service.decideDraft(
          businessId,
          ownerId,
          id,
          'approved',
          'Reviewed concurrent QA usage',
        ),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.voiceBillingUsageClaim.count({ where: { businessId } }),
    ).toBe(1);
    const approved = await prisma.voiceBillingDraft.findFirstOrThrow({
      where: { businessId, status: 'approved' },
    });
    await service.decideDraft(
      businessId,
      ownerId,
      approved.id,
      'approved',
      'Repeated review of same draft',
    );
    expect(
      await prisma.voiceBillingUsageClaim.count({ where: { businessId } }),
    ).toBe(1);
    await expect(
      service.decideDraft(
        businessId,
        ownerId,
        approved.id,
        'cancelled',
        'Cannot withdraw approved usage',
      ),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_BILLING_DRAFT_LOCKED' },
    });
    await expect(
      service.createDraft(businessId, ownerId, rate.id, month),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_BILLING_NO_ELIGIBLE_USAGE' },
    });
  });

  it('refuses changed provider evidence and keeps cancellation/approval reasons in the audit', async () => {
    const rate = await approvedRate();
    const row = await usage();
    const draft = await service.createDraft(
      businessId,
      ownerId,
      rate.id,
      month,
    );
    await prisma.voiceUsageRecord.update({
      where: { id: row.id },
      data: { quantity: 120 },
    });
    await expect(
      service.decideDraft(
        businessId,
        ownerId,
        draft.id,
        'approved',
        'Reviewed stale provider evidence',
      ),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_BILLING_USAGE_CHANGED' },
    });
    expect(
      await prisma.voiceBillingUsageClaim.count({ where: { businessId } }),
    ).toBe(0);
    await service.decideDraft(
      businessId,
      ownerId,
      draft.id,
      'cancelled',
      'Provider quantity changed before review',
    );
    const replacement = await service.createDraft(
      businessId,
      ownerId,
      rate.id,
      month,
    );
    expect(replacement.total.toString()).toBe('0.06');
    expect(
      (
        await prisma.auditLog.findFirstOrThrow({
          where: {
            businessId,
            entityId: draft.id,
            action: 'voice.billing.draft_cancelled',
          },
        })
      ).after,
    ).toMatchObject({ reason: 'Provider quantity changed before review' });
  });

  it('uses the approved revision window and preserves cross-currency costs without conversion', async () => {
    const first = await approvedRate();
    await usage(60, { measuredAt: new Date(Date.now() - 3500) });
    configured = JSON.stringify({
      ...source('qa-eur-v2'),
      currency: 'EUR',
      rates: [
        {
          provider: 'twilio',
          unit: 'inbound_provider_seconds',
          price: '0.09',
          perQuantity: '60',
        },
      ],
    });
    const next = await service.captureRates(businessId, ownerId);
    await service.approveRates(
      businessId,
      ownerId,
      next.id,
      'Reviewed QA EUR revision',
    );
    await prisma.voiceBillingRateVersion.update({
      where: { id: next.id },
      data: { approvedAt: new Date(Date.now() - 2000) },
    });
    await usage();
    const firstDraft = await service.createDraft(
      businessId,
      ownerId,
      first.id,
      month,
    );
    const nextDraft = await service.createDraft(
      businessId,
      ownerId,
      next.id,
      month,
    );
    expect(firstDraft.itemCount).toBe(1);
    expect(firstDraft.currency).toBe('USD');
    expect(nextDraft.itemCount).toBe(1);
    expect(nextDraft.currency).toBe('EUR');
    expect(nextDraft.total.toString()).toBe('0.09');
    expect(nextDraft.items).toEqual([
      expect.objectContaining({
        providerCurrency: 'USD',
        providerCost: '0.01',
      }),
    ]);
    expect((await service.overview(businessId, month)).margin).toContain(
      'Not available',
    );
  });

  it('enforces tenant scope and rejects unapproved rates, future months and empty review reasons', async () => {
    const rate = await service.captureRates(businessId, ownerId);
    await usage();
    await expect(
      service.createDraft(businessId, ownerId, rate.id, month),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_BILLING_RATE_APPROVAL_REQUIRED' },
    });
    await expect(
      service.approveRates(businessId, ownerId, rate.id, ' '),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_BILLING_REASON_REQUIRED' },
    });
    await service.approveRates(
      businessId,
      ownerId,
      rate.id,
      'Reviewed QA fixture scope',
    );
    await prisma.voiceBillingRateVersion.update({
      where: { id: rate.id },
      data: { approvedAt: new Date(Date.now() - 5000) },
    });
    const draft = await service.createDraft(
      businessId,
      ownerId,
      rate.id,
      month,
    );
    cls.businessId = otherBusinessId;
    expect(
      (await service.overview(otherBusinessId, month)).drafts,
    ).toHaveLength(0);
    await expect(
      service.detail(otherBusinessId, draft.id),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.decideDraft(
        otherBusinessId,
        ownerId,
        draft.id,
        'approved',
        'Attempt other business draft',
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.overview(otherBusinessId, '9998-01'),
    ).rejects.toMatchObject({
      response: { code: 'VOICE_BILLING_MONTH_INVALID' },
    });
    await expect(
      service.overview(otherBusinessId, [month] as unknown as string),
    ).rejects.toMatchObject({ response: { code: 'VOICE_BILLING_MONTH_INVALID' } });
    cls.businessId = businessId;
  });
});
