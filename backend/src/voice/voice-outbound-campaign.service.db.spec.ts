import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { VoiceComplianceService } from './voice-compliance.service';
import { VoiceOutboundCampaignService } from './voice-outbound-campaign.service';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceOutboundCampaignService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceOutboundCampaignService;
  let cls: FakeClsService;
  let businessId: string;
  let userId: string;
  let hostId: string;
  let profileId: string;
  let usCustomerId: string;
  let ukCustomerId: string;
  let otherBusinessId: string;
  let otherUserId: string;
  let otherCustomerId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const audit = new AuditService(tenant, cls as unknown as ClsService);
    const compliance = new VoiceComplianceService(tenant, audit);
    service = new VoiceOutboundCampaignService(tenant, compliance, audit);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const business = await prisma.business.create({
      data: { name: 'Voice Outbound Test', slug: `voice-outbound-${suffix}` },
    });
    businessId = business.id;
    const user = await prisma.user.create({
      data: {
        email: `voice-outbound-${suffix}@example.com`,
        passwordHash: 'x',
        name: 'Outbound QA Agent',
      },
    });
    userId = user.id;
    const host = await prisma.businessUser.create({
      data: { businessId, userId, role: Role.staff },
    });
    hostId = host.id;
    const profile = await prisma.voiceHumanAgentProfile.create({
      data: { businessId, staffUserId: hostId, active: true },
    });
    profileId = profile.id;

    const usCustomer = await prisma.customer.create({
      data: { businessId, name: 'US Callback Test', phone: '+14155550126' },
    });
    usCustomerId = usCustomer.id;
    const ukCustomer = await prisma.customer.create({
      data: { businessId, name: 'UK Country Test', phone: '+442079460018' },
    });
    ukCustomerId = ukCustomer.id;

    const otherBusiness = await prisma.business.create({
      data: {
        name: 'Other Voice Outbound Test',
        slug: `voice-outbound-other-${suffix}`,
      },
    });
    otherBusinessId = otherBusiness.id;
    const otherUser = await prisma.user.create({
      data: {
        email: `voice-outbound-other-${suffix}@example.com`,
        passwordHash: 'x',
        name: 'Other QA Agent',
      },
    });
    otherUserId = otherUser.id;
    const otherCustomer = await prisma.customer.create({
      data: {
        businessId: otherBusinessId,
        name: 'Other Tenant Customer',
        phone: '+14155550127',
      },
    });
    otherCustomerId = otherCustomer.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
        if (businessId) await tx.business.delete({ where: { id: businessId } });
        if (otherBusinessId)
          await tx.business.delete({ where: { id: otherBusinessId } });
        if (userId) await tx.user.delete({ where: { id: userId } });
        if (otherUserId) await tx.user.delete({ where: { id: otherUserId } });
        await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
      });
      await prisma.$disconnect();
    }
  });

  function campaignInput(customerIds = [usCustomerId, ukCustomerId]) {
    return {
      name: 'QA callback eligibility preview',
      purpose: 'callback' as const,
      callerType: 'live_agent' as const,
      countryCode: 'US',
      timeZone: 'America/Los_Angeles',
      openingScript: 'This is a requested service callback.',
      humanAgentProfileId: profileId,
      maxAttemptsPerContact: 1,
      retryCooldownHours: 24,
      customerIds,
    };
  }

  it('persists a tenant-owned draft and only previews eligibility without placing calls', async () => {
    const campaign = await service.create(businessId, userId, campaignInput());
    expect(campaign).toMatchObject({
      businessId,
      status: 'draft',
      selectedContactCount: 2,
      eligibleCount: 0,
      blockedCount: 0,
      callsPlaced: false,
      callExecution: 'not_configured',
      humanAgent: { id: profileId },
    });
    expect(campaign.members.map((member) => member.phone)).toEqual(
      expect.arrayContaining(['•••• 0126', '•••• 0018']),
    );

    const preview = await service.eligibilityPreview(
      businessId,
      userId,
      campaign.id,
    );
    expect(preview).toMatchObject({
      selectedCount: 2,
      eligibleCount: 0,
      blockedCount: 2,
      callsPlaced: false,
      blockedReasonCounts: {
        policy_not_approved: 1,
        country_mismatch: 1,
      },
    });
    expect(preview.limitations).toEqual({
      externalDoNotCallRegistry: 'not_configured',
      callProviderExecution: 'not_configured',
      providerCostEstimate: 'not_available',
    });
    expect(await service.list(businessId)).toHaveLength(1);
    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    expect(await service.list(otherBusinessId)).toEqual([]);
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const storedMembers = await prisma.voiceOutboundCampaignMember.findMany({
      where: { businessId, campaignId: campaign.id },
      orderBy: { customerId: 'asc' },
    });
    expect(storedMembers).toHaveLength(2);
    expect(storedMembers.map((member) => member.status)).toEqual([
      'blocked',
      'blocked',
    ]);
    expect(
      await prisma.voiceOutboundEligibilityDecision.count({
        where: { businessId, allowed: false },
      }),
    ).toBe(1);
    expect(await prisma.phoneCall.count({ where: { businessId } })).toBe(0);
  });

  it('rejects a customer id belonging to a different business', async () => {
    let caught: unknown;
    try {
      await service.create(
        businessId,
        userId,
        campaignInput([otherCustomerId]),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppException);
    if (caught instanceof AppException) {
      expect(caught.getResponse()).toMatchObject({
        code: 'VOICE_OUTBOUND_CAMPAIGN_CONTACT_NOT_FOUND',
      });
    }
    expect(
      await prisma.voiceOutboundCampaign.count({ where: { businessId } }),
    ).toBe(1);
  });

  it('fails closed for marketing when the CRM marketing-consent flag is off', async () => {
    await prisma.customer.update({
      where: { id: usCustomerId },
      data: { consentMarketing: false },
    });
    const campaign = await service.create(businessId, userId, {
      ...campaignInput([usCustomerId]),
      name: 'QA marketing consent block',
      purpose: 'marketing',
    });
    const preview = await service.eligibilityPreview(
      businessId,
      userId,
      campaign.id,
    );
    expect(preview).toMatchObject({
      selectedCount: 1,
      eligibleCount: 0,
      blockedCount: 1,
      blockedReasonCounts: { marketing_consent_missing: 1 },
      callsPlaced: false,
    });
    expect(preview.members[0].decisionId).toBeNull();
    await prisma.customer.update({
      where: { id: usCustomerId },
      data: { consentMarketing: true },
    });
  });
});
