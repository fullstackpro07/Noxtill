import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, VoiceCompliancePolicyVersionStatus } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CheckVoiceEligibilityDto,
  CreateVoiceCompliancePolicyDto,
  CreateVoiceCompliancePolicyVersionDto,
  CreateVoiceConsentEvidenceDto,
  CreateVoiceSuppressionDto,
  DisableVoiceCompliancePolicyDto,
  PublishVoiceCompliancePolicyDto,
  RevokeVoiceConsentDto,
  RevokeVoiceSuppressionDto,
} from './dto/voice-compliance.dto';
import { VOICE_ERROR_CODES } from './voice.constants';

const phoneMask = (phone: string) => `•••• ${phone.slice(-4)}`;
const validPhone = (phone: string) => /^\+[1-9]\d{7,14}$/.test(phone);
const validPurpose = (purpose: string) =>
  /^[a-z][a-z0-9_]{1,39}$/.test(purpose);
const validClockTime = (value: string) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

type PolicyFields = {
  aiDisclosureText: string;
  recordingAllowed: boolean;
  recordingNoticeText?: string | null;
  recordingRetentionDays?: number | null;
  meetingAiProcessingAllowed?: boolean;
  meetingAiProcessingNoticeText?: string | null;
  allowedWindowStart?: string | null;
  allowedWindowEnd?: string | null;
  timeZone?: string | null;
};

@Injectable()
export class VoiceComplianceService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async overview(businessId: string) {
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [packs, activeConsents, activeSuppressions, blockedDecisions] =
      await Promise.all([
        this.tenantPrisma.client.voiceCompliancePolicyPack.findMany({
          where: { businessId },
          include: {
            versions: {
              where: { status: VoiceCompliancePolicyVersionStatus.published },
              orderBy: { version: 'desc' },
              take: 1,
              select: { status: true, version: true, publishedAt: true },
            },
          },
        }),
        this.tenantPrisma.client.voiceConsentEvidence.count({
          where: {
            businessId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        }),
        this.tenantPrisma.client.voiceSuppressionEntry.count({
          where: {
            businessId,
            revokedAt: null,
            effectiveAt: { lte: now },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        }),
        this.tenantPrisma.client.voiceOutboundEligibilityDecision.count({
          where: { businessId, allowed: false, evaluatedAt: { gte: since } },
        }),
      ]);
    const policiesPublished = packs.filter(
      (pack) => !pack.disabledAt && pack.versions.length > 0,
    ).length;
    return {
      policyPacks: packs.length,
      policiesPublished,
      unapprovedPolicyPacks: packs.length - policiesPublished,
      verifiedActiveConsents: activeConsents,
      activeFirstPartySuppressions: activeSuppressions,
      blockedChecksLast30Days: blockedDecisions,
      externalSuppressionRegistry: 'not_configured' as const,
      numberOwnershipProof: 'not_tracked' as const,
      retentionJobStatus: 'see_phone_settings' as const,
    };
  }

  async listPolicies(businessId: string) {
    const packs =
      await this.tenantPrisma.client.voiceCompliancePolicyPack.findMany({
        where: { businessId },
        include: { versions: { orderBy: { version: 'desc' } } },
        orderBy: [
          { countryCode: 'asc' },
          { purpose: 'asc' },
          { callerType: 'asc' },
        ],
      });
    return packs.map((pack) => ({
      id: pack.id,
      countryCode: pack.countryCode,
      purpose: pack.purpose,
      callerType: pack.callerType,
      disabledAt: pack.disabledAt?.toISOString() ?? null,
      disabledReason: pack.disabledReason,
      latestVersion: pack.versions[0]?.version ?? null,
      effectiveVersion:
        pack.versions.find(
          (version) =>
            version.status === VoiceCompliancePolicyVersionStatus.published,
        )?.version ?? null,
      status: pack.disabledAt
        ? 'disabled'
        : pack.versions.some(
              (version) =>
                version.status === VoiceCompliancePolicyVersionStatus.published,
            )
          ? 'published'
          : (pack.versions[0]?.status ?? 'unapproved'),
      versions: pack.versions.map((version) => ({
        id: version.id,
        version: version.version,
        status: version.status,
        aiDisclosureText: version.aiDisclosureText,
        recordingAllowed: version.recordingAllowed,
        recordingNoticeText: version.recordingNoticeText,
        recordingRetentionDays: version.recordingRetentionDays,
        meetingAiProcessingAllowed: version.meetingAiProcessingAllowed,
        meetingAiProcessingNoticeText: version.meetingAiProcessingNoticeText,
        allowedWindowStart: version.allowedWindowStart,
        allowedWindowEnd: version.allowedWindowEnd,
        timeZone: version.timeZone,
        legalReviewReference: version.legalReviewReference,
        publishedAt: version.publishedAt?.toISOString() ?? null,
        createdAt: version.createdAt.toISOString(),
      })),
    }));
  }

  async createPolicy(
    businessId: string,
    actorUserId: string,
    dto: CreateVoiceCompliancePolicyDto,
  ) {
    this.validatePolicyFields(dto);
    const countryCode = dto.countryCode.toUpperCase();
    try {
      const pack =
        await this.tenantPrisma.client.voiceCompliancePolicyPack.create({
          data: {
            businessId,
            countryCode,
            purpose: dto.purpose,
            callerType: dto.callerType,
            versions: {
              create: {
                businessId,
                version: 1,
                ...this.policyFields(dto),
                createdByUserId: actorUserId,
              },
            },
          },
          include: { versions: true },
        });
      await this.audit.log({
        entity: 'VoiceCompliancePolicyPack',
        entityId: pack.id,
        action: 'voice.compliance.policy_draft_created',
        after: {
          countryCode,
          purpose: dto.purpose,
          callerType: dto.callerType,
          version: 1,
        },
      });
      return (await this.listPolicies(businessId)).find(
        (row) => row.id === pack.id,
      );
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new AppException(
          VOICE_ERROR_CODES.COMPLIANCE_POLICY_ALREADY_EXISTS,
          'A policy pack already exists for this country, purpose and caller type.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async createPolicyVersion(
    businessId: string,
    actorUserId: string,
    packId: string,
    dto: CreateVoiceCompliancePolicyVersionDto,
  ) {
    this.validatePolicyFields(dto);
    const pack =
      await this.tenantPrisma.client.voiceCompliancePolicyPack.findFirst({
        where: { id: packId, businessId },
        include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      });
    if (!pack) throw this.policyNotFound();
    const versionNumber = (pack.versions[0]?.version ?? 0) + 1;
    try {
      const version =
        await this.tenantPrisma.client.voiceCompliancePolicyVersion.create({
          data: {
            businessId,
            packId,
            version: versionNumber,
            ...this.policyFields(dto),
            createdByUserId: actorUserId,
          },
        });
      await this.audit.log({
        entity: 'VoiceCompliancePolicyVersion',
        entityId: version.id,
        action: 'voice.compliance.policy_version_draft_created',
        after: { packId, version: versionNumber },
      });
      return {
        id: version.id,
        version: version.version,
        status: version.status,
      };
    } catch (error) {
      if (this.isUniqueError(error)) {
        throw new AppException(
          VOICE_ERROR_CODES.COMPLIANCE_POLICY_INVALID,
          'A newer draft version was created at the same time. Reload and try again.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async publishPolicyVersion(
    businessId: string,
    actorUserId: string,
    versionId: string,
    dto: PublishVoiceCompliancePolicyDto,
  ) {
    const version =
      await this.tenantPrisma.client.voiceCompliancePolicyVersion.findFirst({
        where: { id: versionId, businessId },
        include: { pack: true },
      });
    if (!version) throw this.policyVersionNotFound();
    if (version.status !== VoiceCompliancePolicyVersionStatus.draft) {
      throw new AppException(
        VOICE_ERROR_CODES.COMPLIANCE_POLICY_INVALID,
        'Only a draft policy version can be published. Published versions are immutable.',
        HttpStatus.CONFLICT,
      );
    }
    this.validatePolicyFields(version);
    const now = new Date();
    const published = await this.tenantPrisma.client.$transaction(
      async (tx) => {
        await tx.voiceCompliancePolicyVersion.updateMany({
          where: {
            businessId,
            packId: version.packId,
            status: VoiceCompliancePolicyVersionStatus.published,
          },
          data: { status: VoiceCompliancePolicyVersionStatus.superseded },
        });
        const next = await tx.voiceCompliancePolicyVersion.update({
          where: { id: version.id },
          data: {
            status: VoiceCompliancePolicyVersionStatus.published,
            legalReviewReference: dto.legalReviewReference.trim(),
            publishedByUserId: actorUserId,
            publishedAt: now,
          },
        });
        await tx.voiceCompliancePolicyPack.update({
          where: { id: version.packId },
          data: { disabledAt: null, disabledReason: null },
        });
        return next;
      },
    );
    await this.audit.log({
      entity: 'VoiceCompliancePolicyVersion',
      entityId: published.id,
      action: 'voice.compliance.policy_published',
      after: {
        packId: version.packId,
        countryCode: version.pack.countryCode,
        purpose: version.pack.purpose,
        callerType: version.pack.callerType,
        version: version.version,
        legalReviewReference: dto.legalReviewReference.trim(),
        attestedByUserId: actorUserId,
      },
    });
    return {
      id: published.id,
      version: published.version,
      status: published.status,
    };
  }

  async disablePolicy(
    businessId: string,
    actorUserId: string,
    packId: string,
    dto: DisableVoiceCompliancePolicyDto,
  ) {
    const pack =
      await this.tenantPrisma.client.voiceCompliancePolicyPack.findFirst({
        where: { id: packId, businessId },
      });
    if (!pack) throw this.policyNotFound();
    const updated =
      await this.tenantPrisma.client.voiceCompliancePolicyPack.update({
        where: { id: pack.id },
        data: { disabledAt: new Date(), disabledReason: dto.reason.trim() },
      });
    await this.audit.log({
      entity: 'VoiceCompliancePolicyPack',
      entityId: updated.id,
      action: 'voice.compliance.policy_disabled',
      after: { reason: dto.reason.trim(), actorUserId },
    });
    return { id: updated.id, status: 'disabled' as const };
  }

  async listConsents(businessId: string) {
    const rows = await this.tenantPrisma.client.voiceConsentEvidence.findMany({
      where: { businessId },
      orderBy: [{ revokedAt: 'asc' }, { grantedAt: 'desc' }],
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      phone: phoneMask(row.phoneE164),
      purpose: row.purpose,
      callerType: row.callerType,
      source: row.source,
      legalBasis: row.legalBasis,
      evidenceReference: row.evidenceReference,
      noticeText: row.noticeText,
      verifiedAt: row.verifiedAt.toISOString(),
      grantedAt: row.grantedAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      revocationReason: row.revocationReason,
    }));
  }

  async recordConsent(
    businessId: string,
    actorUserId: string,
    dto: CreateVoiceConsentEvidenceDto,
  ) {
    this.validatePhone(dto.phoneE164);
    if (dto.evidenceReviewed !== true) {
      throw this.invalidInput(
        'A business user must attest that the consent evidence was reviewed.',
      );
    }
    if (!validPurpose(dto.purpose))
      throw this.invalidInput('Purpose is invalid.');
    const grantedAt = new Date(dto.grantedAt);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const now = new Date();
    if (grantedAt.getTime() > now.getTime()) {
      throw this.invalidInput('Consent cannot have a future grant date.');
    }
    if (expiresAt && expiresAt.getTime() <= grantedAt.getTime()) {
      throw this.invalidInput('Consent expiry must be after the grant date.');
    }
    if (dto.customerId) {
      const customer = await this.tenantPrisma.client.customer.findFirst({
        where: { businessId, id: dto.customerId },
        select: { id: true, phone: true },
      });
      if (!customer) throw this.customerNotFound();
      if (customer.phone !== dto.phoneE164) {
        throw this.invalidInput(
          'The selected customer phone does not match this E.164 number.',
        );
      }
    }
    const evidence = await this.tenantPrisma.client.voiceConsentEvidence.create(
      {
        data: {
          businessId,
          customerId: dto.customerId,
          phoneE164: dto.phoneE164,
          purpose: dto.purpose,
          callerType: dto.callerType,
          source: dto.source.trim(),
          noticeText: dto.noticeText.trim(),
          evidenceReference: dto.evidenceReference.trim(),
          legalBasis: dto.legalBasis.trim(),
          grantedAt,
          expiresAt,
          verifiedAt: now,
          verifiedByUserId: actorUserId,
        },
      },
    );
    await this.audit.log({
      entity: 'VoiceConsentEvidence',
      entityId: evidence.id,
      action: 'voice.compliance.consent_recorded',
      after: {
        phone: phoneMask(evidence.phoneE164),
        purpose: evidence.purpose,
        callerType: evidence.callerType,
        source: evidence.source,
        evidenceReviewedByUserId: actorUserId,
      },
    });
    return {
      id: evidence.id,
      phone: phoneMask(evidence.phoneE164),
      verified: true,
    };
  }

  async revokeConsent(
    businessId: string,
    actorUserId: string,
    consentId: string,
    dto: RevokeVoiceConsentDto,
  ) {
    const evidence =
      await this.tenantPrisma.client.voiceConsentEvidence.findFirst({
        where: { id: consentId, businessId, revokedAt: null },
      });
    if (!evidence) throw this.consentNotFound();
    const revokedAt = new Date();
    await this.tenantPrisma.client.voiceConsentEvidence.update({
      where: { id: evidence.id },
      data: { revokedAt, revocationReason: dto.reason.trim() },
    });
    await this.audit.log({
      entity: 'VoiceConsentEvidence',
      entityId: evidence.id,
      action: 'voice.compliance.consent_revoked',
      before: {
        phone: phoneMask(evidence.phoneE164),
        purpose: evidence.purpose,
      },
      after: { reason: dto.reason.trim(), actorUserId, revokedAt },
    });
    return { id: evidence.id, revokedAt: revokedAt.toISOString() };
  }

  async listSuppressions(businessId: string) {
    const rows = await this.tenantPrisma.client.voiceSuppressionEntry.findMany({
      where: { businessId },
      orderBy: [{ revokedAt: 'asc' }, { effectiveAt: 'desc' }],
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id,
      phone: phoneMask(row.phoneE164),
      purpose: row.purpose,
      source: row.source,
      reason: row.reason,
      effectiveAt: row.effectiveAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      revocationReason: row.revocationReason,
    }));
  }

  async addSuppression(
    businessId: string,
    actorUserId: string,
    dto: CreateVoiceSuppressionDto,
  ) {
    this.validatePhone(dto.phoneE164);
    if (dto.purpose && !validPurpose(dto.purpose)) {
      throw this.invalidInput('Purpose is invalid.');
    }
    const effectiveAt = new Date(dto.effectiveAt);
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= effectiveAt.getTime()) {
      throw this.invalidInput('Suppression expiry must be after its start.');
    }
    const row = await this.tenantPrisma.client.voiceSuppressionEntry.create({
      data: {
        businessId,
        phoneE164: dto.phoneE164,
        purpose: dto.purpose ?? null,
        source: dto.source.trim(),
        reason: dto.reason.trim(),
        effectiveAt,
        expiresAt,
      },
    });
    await this.audit.log({
      entity: 'VoiceSuppressionEntry',
      entityId: row.id,
      action: 'voice.compliance.suppression_added',
      after: {
        phone: phoneMask(row.phoneE164),
        purpose: row.purpose,
        source: row.source,
        reason: row.reason,
        actorUserId,
      },
    });
    return { id: row.id, phone: phoneMask(row.phoneE164), active: true };
  }

  async revokeSuppression(
    businessId: string,
    actorUserId: string,
    entryId: string,
    dto: RevokeVoiceSuppressionDto,
  ) {
    const entry =
      await this.tenantPrisma.client.voiceSuppressionEntry.findFirst({
        where: { id: entryId, businessId, revokedAt: null },
      });
    if (!entry) throw this.suppressionNotFound();
    const revokedAt = new Date();
    await this.tenantPrisma.client.voiceSuppressionEntry.update({
      where: { id: entry.id },
      data: {
        revokedAt,
        revokedByUserId: actorUserId,
        revocationReason: dto.reason.trim(),
      },
    });
    await this.audit.log({
      entity: 'VoiceSuppressionEntry',
      entityId: entry.id,
      action: 'voice.compliance.suppression_revoked',
      before: { phone: phoneMask(entry.phoneE164), purpose: entry.purpose },
      after: { reason: dto.reason.trim(), actorUserId, revokedAt },
    });
    return { id: entry.id, revokedAt: revokedAt.toISOString() };
  }

  async checkEligibility(
    businessId: string,
    actorUserId: string,
    dto: CheckVoiceEligibilityDto,
  ) {
    this.validatePhone(dto.phoneE164);
    if (!validPurpose(dto.purpose))
      throw this.invalidInput('Purpose is invalid.');
    const now = new Date();
    const pack =
      await this.tenantPrisma.client.voiceCompliancePolicyPack.findFirst({
        where: {
          businessId,
          countryCode: dto.countryCode.toUpperCase(),
          purpose: dto.purpose,
          callerType: dto.callerType,
          disabledAt: null,
        },
        include: {
          versions: {
            where: { status: VoiceCompliancePolicyVersionStatus.published },
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
      });
    const version = pack?.versions[0] ?? null;
    const suppression =
      await this.tenantPrisma.client.voiceSuppressionEntry.findFirst({
        where: {
          businessId,
          phoneE164: dto.phoneE164,
          revokedAt: null,
          effectiveAt: { lte: now },
          AND: [
            { OR: [{ purpose: null }, { purpose: dto.purpose }] },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ],
        },
        orderBy: { effectiveAt: 'desc' },
      });
    const optedOutCustomer = await this.tenantPrisma.client.customer.findFirst({
      where: { businessId, phone: dto.phoneE164, optedOut: true },
      select: { id: true },
    });
    const consent =
      await this.tenantPrisma.client.voiceConsentEvidence.findFirst({
        where: {
          businessId,
          phoneE164: dto.phoneE164,
          purpose: dto.purpose,
          grantedAt: { lte: now },
          revokedAt: null,
          AND: [
            { OR: [{ callerType: null }, { callerType: dto.callerType }] },
            { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          ],
        },
        orderBy: { grantedAt: 'desc' },
      });

    let reasonCode: EligibilityReason = 'eligible';
    if (suppression) reasonCode = 'suppressed';
    else if (optedOutCustomer) reasonCode = 'customer_opted_out';
    else if (!version) reasonCode = 'policy_not_approved';
    else if (!consent) reasonCode = 'consent_missing';
    else if (!this.withinCallingWindow(version, now)) {
      reasonCode = 'outside_calling_window';
    }
    const allowed = reasonCode === 'eligible';
    const decision =
      await this.tenantPrisma.client.voiceOutboundEligibilityDecision.create({
        data: {
          businessId,
          policyPackId: pack?.id,
          policyVersionId: version?.id,
          consentEvidenceId: consent?.id,
          suppressionEntryId: suppression?.id,
          phoneE164: dto.phoneE164,
          countryCode: dto.countryCode.toUpperCase(),
          purpose: dto.purpose,
          callerType: dto.callerType,
          allowed,
          reasonCode,
          evaluatedByUserId: actorUserId,
        },
      });
    await this.audit.log({
      entity: 'VoiceOutboundEligibilityDecision',
      entityId: decision.id,
      action: allowed
        ? 'voice.compliance.outbound_eligibility_allowed'
        : 'voice.compliance.outbound_eligibility_blocked',
      after: {
        phone: phoneMask(dto.phoneE164),
        countryCode: dto.countryCode.toUpperCase(),
        purpose: dto.purpose,
        callerType: dto.callerType,
        allowed,
        reasonCode,
        policyVersionId: version?.id ?? null,
        actorUserId,
      },
    });
    return {
      id: decision.id,
      phone: phoneMask(dto.phoneE164),
      allowed,
      reasonCode,
      message: this.eligibilityMessage(reasonCode),
      policyVersion: version?.version ?? null,
      evaluatedAt: decision.evaluatedAt.toISOString(),
      callPlaced: false,
    };
  }

  async listAudit(businessId: string) {
    const rows =
      await this.tenantPrisma.client.voiceOutboundEligibilityDecision.findMany({
        where: { businessId },
        include: {
          policyPack: { select: { countryCode: true } },
          policyVersion: { select: { version: true } },
        },
        orderBy: { evaluatedAt: 'desc' },
        take: 100,
      });
    return rows.map((row) => ({
      id: row.id,
      phone: phoneMask(row.phoneE164),
      countryCode: row.countryCode,
      purpose: row.purpose,
      callerType: row.callerType,
      allowed: row.allowed,
      reasonCode: row.reasonCode,
      policyVersion: row.policyVersion?.version ?? null,
      evaluatedAt: row.evaluatedAt.toISOString(),
    }));
  }

  private validatePolicyFields(dto: PolicyFields) {
    if (!dto.aiDisclosureText.trim())
      throw this.invalidInput('AI disclosure is required.');
    if (dto.recordingAllowed && !dto.recordingNoticeText?.trim()) {
      throw this.invalidInput(
        'A recording notice is required when recording is enabled.',
      );
    }
    if (
      dto.recordingRetentionDays != null &&
      (!Number.isInteger(dto.recordingRetentionDays) ||
        dto.recordingRetentionDays < 1 ||
        dto.recordingRetentionDays > 3650)
    ) {
      throw this.invalidInput(
        'Recording retention must be between 1 and 3650 days.',
      );
    }
    if (
      dto.meetingAiProcessingAllowed &&
      !dto.meetingAiProcessingNoticeText?.trim()
    ) {
      throw this.invalidInput(
        'A separate AI transcription and summary notice is required when meeting AI processing is enabled.',
      );
    }
    const hasStart = !!dto.allowedWindowStart;
    const hasEnd = !!dto.allowedWindowEnd;
    if (hasStart !== hasEnd) {
      throw this.invalidInput(
        'Both calling-window times must be supplied together.',
      );
    }
    if (hasStart) {
      if (!dto.timeZone)
        throw this.invalidInput('Choose a time zone for the calling window.');
      if (
        !validClockTime(dto.allowedWindowStart!) ||
        !validClockTime(dto.allowedWindowEnd!)
      ) {
        throw this.invalidInput('Calling-window time must use HH:mm format.');
      }
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: dto.timeZone }).format(
          new Date(),
        );
      } catch {
        throw this.invalidInput('Time zone is not recognized.');
      }
    }
  }

  private policyFields(dto: PolicyFields) {
    return {
      aiDisclosureText: dto.aiDisclosureText.trim(),
      recordingAllowed: dto.recordingAllowed,
      recordingNoticeText: dto.recordingAllowed
        ? (dto.recordingNoticeText?.trim() ?? null)
        : null,
      recordingRetentionDays: dto.recordingAllowed
        ? (dto.recordingRetentionDays ?? null)
        : null,
      meetingAiProcessingAllowed:
        dto.recordingAllowed && dto.meetingAiProcessingAllowed === true,
      meetingAiProcessingNoticeText:
        dto.recordingAllowed && dto.meetingAiProcessingAllowed === true
          ? (dto.meetingAiProcessingNoticeText?.trim() ?? null)
          : null,
      allowedWindowStart: dto.allowedWindowStart || null,
      allowedWindowEnd: dto.allowedWindowEnd || null,
      timeZone: dto.allowedWindowStart ? (dto.timeZone?.trim() ?? null) : null,
    };
  }

  private withinCallingWindow(
    version: {
      allowedWindowStart: string | null;
      allowedWindowEnd: string | null;
      timeZone: string | null;
    },
    now: Date,
  ) {
    if (!version.allowedWindowStart || !version.allowedWindowEnd) return true;
    if (!version.timeZone) return false;
    let current: string;
    try {
      current = new Intl.DateTimeFormat('en-GB', {
        timeZone: version.timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(now);
    } catch {
      return false;
    }
    const start = version.allowedWindowStart;
    const end = version.allowedWindowEnd;
    if (start === end) return false;
    return start < end
      ? current >= start && current < end
      : current >= start || current < end;
  }

  private validatePhone(phone: string) {
    if (!validPhone(phone)) {
      throw this.invalidInput(
        'Phone must be a valid E.164 number, for example +14155550123.',
      );
    }
  }

  private eligibilityMessage(reason: EligibilityReason) {
    const messages: Record<EligibilityReason, string> = {
      eligible:
        'This check passed the business-configured policy, consent and suppression checks. No call was placed.',
      suppressed: 'Blocked by an active first-party suppression entry.',
      customer_opted_out:
        'Blocked because the matched customer is marked opted out.',
      policy_not_approved:
        'Blocked because no active, published policy exists for this country, purpose and caller type.',
      consent_missing:
        'Blocked because no verified, active consent evidence matches this number and purpose.',
      outside_calling_window:
        'Blocked because the current time is outside the configured calling window.',
    };
    return messages[reason];
  }

  private invalidInput(message: string) {
    return new AppException(
      VOICE_ERROR_CODES.COMPLIANCE_POLICY_INVALID,
      message,
      HttpStatus.BAD_REQUEST,
    );
  }

  private policyNotFound() {
    return new AppException(
      VOICE_ERROR_CODES.COMPLIANCE_POLICY_NOT_FOUND,
      'Voice compliance policy pack was not found.',
      HttpStatus.NOT_FOUND,
    );
  }

  private policyVersionNotFound() {
    return new AppException(
      VOICE_ERROR_CODES.COMPLIANCE_POLICY_VERSION_NOT_FOUND,
      'Voice compliance policy version was not found.',
      HttpStatus.NOT_FOUND,
    );
  }

  private consentNotFound() {
    return new AppException(
      VOICE_ERROR_CODES.COMPLIANCE_CONSENT_NOT_FOUND,
      'Active consent evidence was not found.',
      HttpStatus.NOT_FOUND,
    );
  }

  private suppressionNotFound() {
    return new AppException(
      VOICE_ERROR_CODES.COMPLIANCE_SUPPRESSION_NOT_FOUND,
      'Active suppression entry was not found.',
      HttpStatus.NOT_FOUND,
    );
  }

  private customerNotFound() {
    return new AppException(
      VOICE_ERROR_CODES.COMPLIANCE_CUSTOMER_NOT_FOUND,
      'Customer was not found in this business.',
      HttpStatus.NOT_FOUND,
    );
  }

  private isUniqueError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}

type EligibilityReason =
  | 'eligible'
  | 'suppressed'
  | 'customer_opted_out'
  | 'policy_not_approved'
  | 'consent_missing'
  | 'outside_calling_window';
