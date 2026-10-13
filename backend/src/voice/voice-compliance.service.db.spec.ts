import { ClsService } from 'nestjs-cls';
import { Role, VoicePolicyCallerType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { VoiceComplianceService } from './voice-compliance.service';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceComplianceService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceComplianceService;
  let businessId: string;
  let userId: string;
  let otherBusinessId: string;
  let otherUserId: string;
  let cls: FakeClsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const audit = new AuditService(tenantPrisma, cls as unknown as ClsService);
    service = new VoiceComplianceService(tenantPrisma, audit);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const business = await prisma.business.create({
      data: {
        name: 'Voice Compliance Test',
        slug: `voice-compliance-${suffix}`,
      },
    });
    businessId = business.id;
    const user = await prisma.user.create({
      data: {
        email: `voice-compliance-${suffix}@example.com`,
        passwordHash: 'x',
        name: 'QA Reviewer',
      },
    });
    userId = user.id;
    await prisma.businessUser.create({
      data: { businessId, userId, role: Role.staff },
    });

    const otherBusiness = await prisma.business.create({
      data: {
        name: 'Other Voice Compliance Test',
        slug: `voice-compliance-other-${suffix}`,
      },
    });
    otherBusinessId = otherBusiness.id;
    const otherUser = await prisma.user.create({
      data: {
        email: `voice-compliance-other-${suffix}@example.com`,
        passwordHash: 'x',
        name: 'Other QA Reviewer',
      },
    });
    otherUserId = otherUser.id;
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

  function policyInput(purpose = 'product_updates', countryCode = 'US') {
    return {
      countryCode,
      purpose,
      callerType: VoicePolicyCallerType.ai_voice,
      aiDisclosureText: 'This call uses an AI voice assistant.',
      recordingAllowed: false,
    };
  }

  async function createAndPublishPolicy(purpose = 'product_updates') {
    const pack = await service.createPolicy(
      businessId,
      userId,
      policyInput(purpose),
    );
    if (!pack) throw new Error('Policy response did not include the new pack.');
    const versionId = pack.versions[0].id;
    await service.publishPolicyVersion(businessId, userId, versionId, {
      legalReviewReference: `QA review ${Date.now()}`,
      confirmLegalReview: true,
    });
    return { packId: pack.id, versionId };
  }

  async function recordConsent(
    phoneE164 = '+14155550123',
    purpose = 'product_updates',
    customerId?: string,
  ) {
    return service.recordConsent(businessId, userId, {
      phoneE164,
      ...(customerId ? { customerId } : {}),
      purpose,
      callerType: VoicePolicyCallerType.ai_voice,
      source: 'qa_manual_review',
      noticeText:
        'QA-only consent disclosure snapshot for integration testing.',
      evidenceReference: `QA evidence ${Date.now()}`,
      legalBasis: 'QA-only integration-test attestation',
      grantedAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      evidenceReviewed: true,
    });
  }

  async function check(
    phoneE164 = '+14155550123',
    purpose = 'product_updates',
  ) {
    return service.checkEligibility(businessId, userId, {
      phoneE164,
      countryCode: 'US',
      purpose,
      callerType: VoicePolicyCallerType.ai_voice,
    });
  }

  async function expectAppError(action: Promise<unknown>, code: string) {
    let caught: unknown;
    try {
      await action;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppException);
    if (caught instanceof AppException) {
      expect(caught.getResponse()).toMatchObject({ code });
    }
  }

  it('fails closed, then allows only after a published policy and matching consent', async () => {
    const blockedWithoutPolicy = await check();
    expect(blockedWithoutPolicy).toMatchObject({
      allowed: false,
      reasonCode: 'policy_not_approved',
      callPlaced: false,
    });

    const { versionId } = await createAndPublishPolicy();
    const blockedWithoutConsent = await check();
    expect(blockedWithoutConsent).toMatchObject({
      allowed: false,
      reasonCode: 'consent_missing',
      policyVersion: 1,
      callPlaced: false,
    });
    await recordConsent();
    const eligible = await check();
    expect(eligible).toMatchObject({
      allowed: true,
      reasonCode: 'eligible',
      policyVersion: 1,
      callPlaced: false,
    });
    expect(eligible.id).toBeTruthy();
    expect(
      await prisma.voiceOutboundEligibilityDecision.findUniqueOrThrow({
        where: { id: eligible.id },
      }),
    ).toMatchObject({
      businessId,
      policyVersionId: versionId,
      allowed: true,
      reasonCode: 'eligible',
    });
  });

  it('blocks suppression and customer opt-out, and audits each eligibility result', async () => {
    const purpose = 'customer_retention';
    await createAndPublishPolicy(purpose);
    await recordConsent('+14155550123', purpose);
    const suppression = await service.addSuppression(businessId, userId, {
      phoneE164: '+14155550123',
      purpose,
      source: 'qa_manual_review',
      reason: 'QA test suppression for compliance integration coverage',
      effectiveAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const blockedBySuppression = await check('+14155550123', purpose);
    expect(blockedBySuppression).toMatchObject({
      allowed: false,
      reasonCode: 'suppressed',
    });
    await service.revokeSuppression(businessId, userId, suppression.id, {
      reason: 'Remove QA test suppression after verification',
    });
    expect(await check('+14155550123', purpose)).toMatchObject({
      allowed: true,
      reasonCode: 'eligible',
    });

    const customer = await prisma.customer.create({
      data: {
        businessId,
        phone: '+14155550124',
        name: 'QA Opted Out Customer',
        optedOut: true,
      },
    });
    await recordConsent('+14155550124', purpose, customer.id);
    const optedOut = await check('+14155550124', purpose);
    expect(optedOut).toMatchObject({
      allowed: false,
      reasonCode: 'customer_opted_out',
    });

    const actions = await prisma.auditLog.findMany({
      where: {
        businessId,
        entity: 'VoiceOutboundEligibilityDecision',
      },
      orderBy: { createdAt: 'asc' },
      select: { action: true },
    });
    expect(actions.map((row) => row.action)).toContain(
      'voice.compliance.outbound_eligibility_blocked',
    );
    expect(actions.map((row) => row.action)).toContain(
      'voice.compliance.outbound_eligibility_allowed',
    );
  });

  it('versions policies immutably and only the owning business can disable its pack', async () => {
    const pack = await service.createPolicy(
      businessId,
      userId,
      policyInput('booking_reminders'),
    );
    if (!pack) throw new Error('Policy response did not include the new pack.');
    await service.publishPolicyVersion(
      businessId,
      userId,
      pack.versions[0].id,
      {
        legalReviewReference: 'QA integration review initial version',
        confirmLegalReview: true,
      },
    );
    const version2 = await service.createPolicyVersion(
      businessId,
      userId,
      pack.id,
      {
        aiDisclosureText:
          'This call uses an AI voice assistant with updated notice.',
        recordingAllowed: true,
        recordingNoticeText:
          'This call may be recorded for the disclosed purpose.',
        recordingRetentionDays: 30,
      },
    );
    expect(version2.version).toBe(2);
    await service.publishPolicyVersion(businessId, userId, version2.id, {
      legalReviewReference: 'QA integration review version two',
      confirmLegalReview: true,
    });

    const listed = await service.listPolicies(businessId);
    expect(listed[0]).toMatchObject({ latestVersion: 2, effectiveVersion: 2 });
    expect(listed[0].versions.map((version) => version.status)).toEqual([
      'published',
      'superseded',
    ]);
    cls.set(CLS_KEY_BUSINESS_ID, otherBusinessId);
    cls.set(CLS_KEY_USER_ID, otherUserId);
    expect(await service.listPolicies(otherBusinessId)).toEqual([]);
    await expectAppError(
      service.disablePolicy(otherBusinessId, otherUserId, pack.id, {
        reason: 'Cross-tenant attempt must not disable this policy',
      }),
      'VOICE_COMPLIANCE_POLICY_NOT_FOUND',
    );
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, userId);
    await service.disablePolicy(businessId, userId, pack.id, {
      reason: 'QA test policy cleanup after version behavior check',
    });
    expect(await check('+14155550125', 'booking_reminders')).toMatchObject({
      allowed: false,
      reasonCode: 'policy_not_approved',
    });
  });

  it('rejects unreviewed evidence and invalid policy configuration', async () => {
    await expectAppError(
      service.createPolicy(businessId, userId, {
        ...policyInput('invalid_purpose'),
        aiDisclosureText: '',
      }),
      'VOICE_COMPLIANCE_POLICY_INVALID',
    );
    await expectAppError(
      service.recordConsent(businessId, userId, {
        phoneE164: '+14155550123',
        purpose: 'product_updates',
        source: 'manual',
        noticeText: 'QA test evidence record.',
        evidenceReference: 'QA evidence ref',
        legalBasis: 'QA testing only',
        grantedAt: new Date().toISOString(),
        evidenceReviewed: false as true,
      }),
      'VOICE_COMPLIANCE_POLICY_INVALID',
    );
  });
});
