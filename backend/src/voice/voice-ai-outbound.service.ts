import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PhoneCallStatus,
  VoiceOutboundCampaignMemberStatus,
  VoiceOutboundCampaignStatus,
  VoicePolicyCallerType,
} from '@prisma/client';
import axios from 'axios';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceOutboundCampaignService } from './voice-outbound-campaign.service';
import { VOICE_ERROR_CODES } from './voice.constants';
import { voiceSpendState } from './voice-usage-metering.service';
import {
  voiceAgentAdmissionReason,
  type VoiceAgentControls,
} from './voice-agent-controls.util';

const STARTABLE: VoiceOutboundCampaignStatus[] = [
  VoiceOutboundCampaignStatus.approved,
  VoiceOutboundCampaignStatus.paused,
];
const IN_FLIGHT = ['initiating', 'ringing', 'in_progress'];
const CALLABLE = [
  VoiceOutboundCampaignMemberStatus.eligible,
  VoiceOutboundCampaignMemberStatus.retry,
];
const MASKED_PHONE = (value: string) => `•••• ${value.slice(-4)}`;

/** Sequential AI progressive dialer. It never uses the human power-dialer path. */
@Injectable()
export class VoiceAiOutboundService {
  private readonly logger = new Logger(VoiceAiOutboundService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly campaigns: VoiceOutboundCampaignService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Return null for human campaigns so the controller can retain the human dialer path. */
  async start(businessId: string, actorUserId: string, campaignId: string) {
    const campaign = await this.findCampaign(businessId, campaignId);
    if (campaign.callerType !== VoicePolicyCallerType.ai_voice) return null;
    if (!STARTABLE.includes(campaign.status)) {
      throw this.stateError(
        campaign.status === VoiceOutboundCampaignStatus.draft ||
          campaign.status === VoiceOutboundCampaignStatus.pending_approval
          ? 'This AI campaign must be approved before it can start.'
          : `A ${campaign.status} campaign cannot be started.`,
      );
    }
    if (!campaign.eligibilityCheckedAt) {
      throw new AppException(
        VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_PREVIEW_REQUIRED,
        'Run the eligibility preview before starting this campaign.',
        HttpStatus.CONFLICT,
      );
    }
    const businessNumber =
      await this.tenantPrisma.client.phoneNumber.findUnique({
        where: { businessId },
        select: { phoneNumber: true },
      });
    if (!businessNumber) {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'Provision a business phone number before starting this AI campaign.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    this.assertProviderReady();
    if (!campaign.aiAgent || campaign.aiAgent.status !== 'active') {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_NOT_FOUND,
        'Select an active, published AI agent before starting this campaign.',
        HttpStatus.CONFLICT,
      );
    }
    const publishedVersion = campaign.aiAgent.publishedVersionId
      ? await this.prisma.voiceAiAgentVersion.findFirst({
          where: {
            id: campaign.aiAgent.publishedVersionId,
            businessId,
            agentId: campaign.aiAgent.id,
            publishedAt: { not: null },
          },
          select: { id: true },
        })
      : null;
    if (!publishedVersion) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_VERSION_NOT_PUBLISHED,
        'Publish and approve an AI agent version before starting this campaign.',
        HttpStatus.CONFLICT,
      );
    }
    const earlierPin =
      await this.tenantPrisma.client.voiceAiOutboundAttempt.findFirst({
        where: { businessId, campaignId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { versionId: true },
      });
    const pinnedVersion = earlierPin
      ? await this.prisma.voiceAiAgentVersion.findFirst({
          where: {
            id: earlierPin.versionId,
            businessId,
            agentId: campaign.aiAgent.id,
            publishedAt: { not: null },
          },
          select: { id: true },
        })
      : publishedVersion;
    if (!pinnedVersion) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_VERSION_NOT_PUBLISHED,
        'The campaign’s pinned AI agent version is unavailable. Create a new campaign to use the current published version.',
        HttpStatus.CONFLICT,
      );
    }
    if (campaign.voicemailDetection) {
      throw new AppException(
        VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_STATE,
        'AI campaign voicemail detection is not configured. Turn it off before starting.',
        HttpStatus.CONFLICT,
      );
    }

    const updated =
      await this.tenantPrisma.client.voiceOutboundCampaign.updateMany({
        where: { id: campaignId, businessId, status: { in: STARTABLE } },
        data: {
          status: VoiceOutboundCampaignStatus.running,
          startedAt: campaign.startedAt ?? new Date(),
          startedByUserId: campaign.startedByUserId ?? actorUserId,
          pausedAt: null,
        },
      });
    if (updated.count !== 1) {
      throw this.stateError('The campaign changed; reload and retry.');
    }
    await this.audit.log({
      entity: 'VoiceOutboundCampaign',
      entityId: campaignId,
      action:
        campaign.status === VoiceOutboundCampaignStatus.paused
          ? 'voice.ai_campaign.resumed'
          : 'voice.ai_campaign.started',
      after: {
        callerType: 'ai_voice',
        agentVersionId: pinnedVersion.id,
        actorUserId,
      },
    });

    try {
      await this.dialNext(
        businessId,
        campaignId,
        actorUserId,
        pinnedVersion.id,
      );
    } catch (error) {
      await this.tenantPrisma.client.voiceOutboundCampaign.updateMany({
        where: {
          id: campaignId,
          businessId,
          status: VoiceOutboundCampaignStatus.running,
        },
        data: {
          status: VoiceOutboundCampaignStatus.paused,
          pausedAt: new Date(),
        },
      });
      throw error;
    }
    return this.status(businessId, campaignId);
  }

  async pause(businessId: string, actorUserId: string, campaignId: string) {
    const campaign = await this.findCampaign(businessId, campaignId);
    if (campaign.callerType !== VoicePolicyCallerType.ai_voice) return null;
    const updated =
      await this.tenantPrisma.client.voiceOutboundCampaign.updateMany({
        where: {
          id: campaignId,
          businessId,
          status: VoiceOutboundCampaignStatus.running,
        },
        data: {
          status: VoiceOutboundCampaignStatus.paused,
          pausedAt: new Date(),
        },
      });
    if (updated.count !== 1)
      throw this.stateError('This AI campaign is not running.');
    await this.audit.log({
      entity: 'VoiceOutboundCampaign',
      entityId: campaignId,
      action: 'voice.ai_campaign.paused',
      after: { actorUserId },
    });
    return this.status(businessId, campaignId);
  }

  async stop(businessId: string, actorUserId: string, campaignId: string) {
    const campaign = await this.findCampaign(businessId, campaignId);
    if (campaign.callerType !== VoicePolicyCallerType.ai_voice) return null;
    const updated =
      await this.tenantPrisma.client.voiceOutboundCampaign.updateMany({
        where: {
          id: campaignId,
          businessId,
          status: { in: [...STARTABLE, VoiceOutboundCampaignStatus.running] },
        },
        data: {
          status: VoiceOutboundCampaignStatus.stopped,
          stoppedAt: new Date(),
        },
      });
    if (updated.count !== 1)
      throw this.stateError('This AI campaign can no longer be stopped.');
    await this.audit.log({
      entity: 'VoiceOutboundCampaign',
      entityId: campaignId,
      action: 'voice.ai_campaign.stopped',
      after: { actorUserId },
    });
    const active =
      await this.tenantPrisma.client.voiceAiOutboundAttempt.findFirst({
        where: {
          businessId,
          campaignId,
          status: { in: IN_FLIGHT },
          callSid: { not: null },
        },
        select: { callSid: true },
        orderBy: { createdAt: 'desc' },
      });
    if (active?.callSid) await this.endProviderCall(active.callSid);
    return this.status(businessId, campaignId);
  }

  async status(businessId: string, campaignId: string) {
    const campaign = await this.findCampaign(businessId, campaignId);
    if (campaign.callerType !== VoicePolicyCallerType.ai_voice) return null;
    const attempts =
      await this.tenantPrisma.client.voiceAiOutboundAttempt.findMany({
        where: { businessId, campaignId },
        include: {
          member: {
            include: { customer: { select: { name: true, phone: true } } },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 100,
      });
    const attemptCounts = attempts.reduce<Record<string, number>>(
      (counts, row) => {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        return counts;
      },
      {},
    );
    return {
      campaignId,
      status: campaign.status,
      startedAt: campaign.startedAt?.toISOString() ?? null,
      pausedAt: campaign.pausedAt?.toISOString() ?? null,
      stoppedAt: campaign.stoppedAt?.toISOString() ?? null,
      attemptCounts,
      attempts: attempts.map((row) => ({
        id: row.id,
        memberId: row.memberId,
        contactName: row.member.customer.name,
        phone: MASKED_PHONE(row.member.customer.phone),
        status: row.status,
        blockReasonCode: row.blockReasonCode,
        customerDialed: row.callSid !== null,
        durationSec: row.durationSeconds,
        disposition: null,
        createdAt: row.createdAt.toISOString(),
        answeredAt: null,
        endedAt: row.endedAt?.toISOString() ?? null,
      })),
      executionNote:
        'AI calls are placed one at a time. Each call re-checks compliance before dialing. Recording is off.',
    };
  }

  async report(businessId: string, campaignId: string) {
    const campaign = await this.findCampaign(businessId, campaignId);
    if (campaign.callerType !== VoicePolicyCallerType.ai_voice) return null;
    const [members, attempts] = await Promise.all([
      this.tenantPrisma.client.voiceOutboundCampaignMember.findMany({
        where: { businessId, campaignId },
        select: { status: true, attemptCount: true },
      }),
      this.tenantPrisma.client.voiceAiOutboundAttempt.findMany({
        where: { businessId, campaignId },
        select: {
          status: true,
          blockReasonCode: true,
          durationSeconds: true,
          memberId: true,
          callSid: true,
        },
      }),
    ]);
    const tally = (values: Array<string | null>) =>
      values.reduce<Record<string, number>>((result, value) => {
        if (value) result[value] = (result[value] ?? 0) + 1;
        return result;
      }, {});
    const dialled = attempts.filter((attempt) => attempt.callSid !== null);
    const connected = dialled.filter(
      (attempt) => attempt.status === 'completed',
    ).length;
    const blocked = attempts.filter((attempt) => attempt.status === 'blocked');
    const attemptedMembers = new Set(
      dialled.map((attempt) => attempt.memberId),
    );
    return {
      campaignId,
      status: campaign.status,
      contacts: members.length,
      memberStatus: tally(members.map((member) => member.status)),
      attempts: attempts.length,
      attemptStatus: tally(attempts.map((attempt) => attempt.status)),
      customerDialed: dialled.length,
      connected,
      connectRate: dialled.length ? connected / dialled.length : null,
      voicemails: 'not_available' as const,
      blockedAttempts: blocked.length,
      blockedRate: attempts.length ? blocked.length / attempts.length : null,
      blockedReasons: tally(blocked.map((attempt) => attempt.blockReasonCode)),
      dispositions: {},
      optOuts: members.filter(
        (member) =>
          member.status === VoiceOutboundCampaignMemberStatus.opted_out,
      ).length,
      averageDialsPerContactedContact: attemptedMembers.size
        ? dialled.length / attemptedMembers.size
        : null,
      talkSeconds: attempts.reduce(
        (total, attempt) => total + (attempt.durationSeconds ?? 0),
        0,
      ),
      providerCost: 'not_available' as const,
    };
  }

  /** Signed Twilio callback: update attempt evidence and advance only after a terminal status. */
  async providerStatus(
    attemptId: string,
    callSid: string,
    providerStatus: string,
    durationSeconds?: number,
  ) {
    const attempt = await this.prisma.voiceAiOutboundAttempt.findFirst({
      where: { id: attemptId },
      select: {
        id: true,
        businessId: true,
        campaignId: true,
        memberId: true,
        status: true,
        callSid: true,
      },
    });
    if (!attempt || (attempt.callSid && attempt.callSid !== callSid)) return;
    const liveStatuses = new Set([
      'queued',
      'initiated',
      'ringing',
      'answered',
      'in-progress',
    ]);
    const terminalStatuses = new Set([
      'completed',
      'busy',
      'no-answer',
      'failed',
      'canceled',
    ]);
    const mapped =
      providerStatus === 'answered' || providerStatus === 'in-progress'
        ? 'in_progress'
        : providerStatus === 'queued' || providerStatus === 'initiated'
          ? 'initiating'
          : providerStatus === 'ringing'
            ? 'ringing'
            : providerStatus === 'no-answer'
              ? 'no_answer'
              : providerStatus === 'canceled'
                ? 'canceled'
                : providerStatus === 'busy' || providerStatus === 'failed'
                  ? providerStatus
                  : providerStatus === 'completed'
                    ? 'completed'
                    : null;
    if (!mapped) return;
    const terminal = terminalStatuses.has(providerStatus);
    let applied = false;
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.voiceAiOutboundAttempt.findFirst({
        where: { id: attemptId, businessId: attempt.businessId },
        select: { status: true, callSid: true },
      });
      if (
        !current ||
        (current.callSid && current.callSid !== callSid) ||
        !IN_FLIGHT.includes(current.status)
      ) {
        return;
      }
      const rank: Record<string, number> = {
        initiating: 0,
        ringing: 1,
        in_progress: 2,
      };
      if (!terminal && rank[mapped] <= rank[current.status]) return;
      const updated = await tx.voiceAiOutboundAttempt.updateMany({
        where: {
          id: attemptId,
          businessId: attempt.businessId,
          status: { in: IN_FLIGHT },
          OR: [{ callSid: null }, { callSid }],
        },
        data: {
          callSid,
          status: mapped,
          providerStatus: providerStatus.slice(0, 40),
          ...(durationSeconds !== undefined && Number.isFinite(durationSeconds)
            ? { durationSeconds: Math.max(0, Math.floor(durationSeconds)) }
            : {}),
          ...(terminal ? { endedAt: new Date() } : {}),
          ...(!terminal && attempt.status === 'initiating'
            ? { startedAt: new Date() }
            : {}),
        },
      });
      if (updated.count !== 1) return;
      applied = true;
      if (terminal) {
        await tx.phoneCall.updateMany({
          where: { callSid, businessId: attempt.businessId },
          data: { status: PhoneCallStatus.completed, endedAt: new Date() },
        });
        const member = await tx.voiceOutboundCampaignMember.findUnique({
          where: { id: attempt.memberId },
          select: {
            attemptCount: true,
            campaign: { select: { maxAttemptsPerContact: true } },
          },
        });
        const retryable =
          ['busy', 'no-answer', 'failed'].includes(providerStatus) &&
          Boolean(
            member &&
            member.attemptCount < member.campaign.maxAttemptsPerContact,
          );
        const memberStatus = retryable
          ? VoiceOutboundCampaignMemberStatus.retry
          : providerStatus === 'busy'
            ? VoiceOutboundCampaignMemberStatus.busy
            : providerStatus === 'no-answer'
              ? VoiceOutboundCampaignMemberStatus.no_answer
              : VoiceOutboundCampaignMemberStatus.completed;
        await tx.voiceOutboundCampaignMember.updateMany({
          where: {
            id: attempt.memberId,
            businessId: attempt.businessId,
            status: VoiceOutboundCampaignMemberStatus.calling,
          },
          data: { status: memberStatus },
        });
      }
    });
    if (!applied) return;
    if (terminal) {
      const campaign = await this.prisma.voiceOutboundCampaign.findFirst({
        where: { id: attempt.campaignId, businessId: attempt.businessId },
        select: { status: true, startedByUserId: true },
      });
      if (campaign?.status === VoiceOutboundCampaignStatus.running) {
        const pinned = await this.prisma.voiceAiOutboundAttempt.findFirst({
          where: {
            campaignId: attempt.campaignId,
            businessId: attempt.businessId,
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { versionId: true },
        });
        if (pinned)
          await this.dialNext(
            attempt.businessId,
            attempt.campaignId,
            campaign.startedByUserId ?? '',
            pinned.versionId,
          );
      }
    } else if (liveStatuses.has(providerStatus)) {
      return;
    }
  }

  private async dialNext(
    businessId: string,
    campaignId: string,
    actorUserId: string,
    pinnedVersionId: string,
  ) {
    const reservation = await this.prisma.$transaction(async (tx) => {
      if ((await voiceSpendState(tx, businessId)).reached) {
        throw new AppException(
          'VOICE_SPEND_CAP_REACHED',
          'This business has reached its monthly phone spending cap.',
          HttpStatus.FORBIDDEN,
        );
      }
      await tx.$queryRaw`SELECT id FROM voice_outbound_campaigns WHERE id = ${campaignId} AND business_id = ${businessId} FOR UPDATE`;
      const campaign = await tx.voiceOutboundCampaign.findFirst({
        where: { id: campaignId, businessId },
        include: {
          aiAgent: {
            select: { id: true, status: true, publishedVersionId: true },
          },
          members: {
            where: { status: { in: CALLABLE } },
            include: {
              customer: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  consentMarketing: true,
                },
              },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          },
        },
      });
      if (!campaign || campaign.status !== VoiceOutboundCampaignStatus.running)
        return null;
      const inFlight = await tx.voiceAiOutboundAttempt.findFirst({
        where: { businessId, campaignId, status: { in: IN_FLIGHT } },
        select: { id: true },
      });
      if (inFlight) return null;
      const candidates = campaign.members.filter(
        (member) =>
          member.attemptCount < campaign.maxAttemptsPerContact &&
          (member.status !== VoiceOutboundCampaignMemberStatus.retry ||
            !member.lastAttemptAt ||
            Date.now() - member.lastAttemptAt.getTime() >=
              campaign.retryCooldownHours * 60 * 60 * 1000),
      );
      const version = await tx.voiceAiAgentVersion.findFirst({
        where: {
          id: pinnedVersionId,
          businessId,
          agentId: campaign.aiAgentId ?? undefined,
          publishedAt: { not: null },
        },
        select: { id: true, config: true },
      });
      if (!version || campaign.aiAgent?.status !== 'active') {
        throw new AppException(
          VOICE_ERROR_CODES.AI_AGENT_VERSION_NOT_PUBLISHED,
          'The campaign’s pinned AI agent version is no longer available.',
          HttpStatus.CONFLICT,
        );
      }
      const controls = version.config as VoiceAgentControls;
      // Eligibility persists its own business-scoped decision on another connection; locking
      // the parent business here would block that insert's FK check. Use the pinned version.
      await tx.$queryRaw`SELECT id FROM voice_ai_agent_versions WHERE id = ${version.id} AND business_id = ${businessId} FOR UPDATE`;
      if (voiceAgentAdmissionReason(controls, campaignId, 'outbound'))
        return null;
      if (controls.maxConcurrentCalls) {
        const active = await tx.phoneCall.count({
          where: {
            businessId,
            voiceAgentVersionId: version.id,
            status: PhoneCallStatus.in_progress,
          },
        });
        const pending = await tx.voiceAiOutboundAttempt.count({
          where: {
            businessId,
            versionId: version.id,
            status: { in: ['initiating', 'ringing'] },
          },
        });
        if (active + pending >= controls.maxConcurrentCalls) return null;
      }
      for (const member of candidates) {
        const decision = await this.campaigns.evaluateMember(
          businessId,
          actorUserId || campaign.startedByUserId || campaign.createdByUserId,
          campaign,
          member.customer,
        );
        if (!decision.eligible) {
          await tx.voiceOutboundCampaignMember.update({
            where: { id: member.id },
            data: {
              status: VoiceOutboundCampaignMemberStatus.blocked,
              blockReasonCode: decision.reasonCode,
              eligibilityDecisionId: decision.decisionId,
              eligibilityCheckedAt: new Date(),
            },
          });
          await tx.voiceAiOutboundAttempt.create({
            data: {
              businessId,
              campaignId,
              memberId: member.id,
              versionId: version.id,
              eligibilityDecisionId: decision.decisionId,
              status: 'blocked',
              blockReasonCode: decision.reasonCode,
              createdByUserId:
                actorUserId ||
                campaign.startedByUserId ||
                campaign.createdByUserId,
            },
          });
          continue;
        }
        const now = new Date();
        const updated = await tx.voiceOutboundCampaignMember.updateMany({
          where: { id: member.id, businessId, status: { in: CALLABLE } },
          data: {
            status: VoiceOutboundCampaignMemberStatus.calling,
            blockReasonCode: null,
            eligibilityDecisionId: decision.decisionId,
            eligibilityCheckedAt: now,
            attemptCount: { increment: 1 },
            lastAttemptAt: now,
          },
        });
        if (updated.count !== 1) continue;
        const attempt = await tx.voiceAiOutboundAttempt.create({
          data: {
            businessId,
            campaignId,
            memberId: member.id,
            versionId: version.id,
            eligibilityDecisionId: decision.decisionId,
            status: 'initiating',
            createdByUserId:
              actorUserId ||
              campaign.startedByUserId ||
              campaign.createdByUserId,
            startedAt: now,
          },
        });
        return {
          attemptId: attempt.id,
          memberId: member.id,
          phone: member.customer.phone,
        };
      }
      const retryPending = campaign.members.some(
        (member) =>
          member.status === VoiceOutboundCampaignMemberStatus.retry &&
          member.attemptCount < campaign.maxAttemptsPerContact,
      );
      await tx.voiceOutboundCampaign.updateMany({
        where: {
          id: campaignId,
          businessId,
          status: VoiceOutboundCampaignStatus.running,
        },
        data: {
          status: retryPending
            ? VoiceOutboundCampaignStatus.paused
            : VoiceOutboundCampaignStatus.completed,
          ...(retryPending ? { pausedAt: new Date() } : {}),
        },
      });
      return null;
    });
    if (!reservation) return;
    const [line, attemptCampaign] = await Promise.all([
      this.tenantPrisma.client.phoneNumber.findUnique({
        where: { businessId },
        select: { phoneNumber: true },
      }),
      this.tenantPrisma.client.voiceOutboundCampaign.findFirst({
        where: { id: campaignId, businessId },
        select: { callerType: true },
      }),
    ]);
    if (
      !line ||
      !attemptCampaign ||
      attemptCampaign.callerType !== VoicePolicyCallerType.ai_voice
    ) {
      await this.failAttempt(
        reservation.attemptId,
        reservation.memberId,
        'provider_not_configured',
      );
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'Provision a business phone number before starting this AI campaign.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const backendUrl = this.publicBackendUrl();
    if (!accountSid || !authToken || !backendUrl) {
      await this.failAttempt(
        reservation.attemptId,
        reservation.memberId,
        'provider_not_configured',
      );
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'Twilio account credentials and a public HTTPS BACKEND_URL are required for AI campaigns.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    try {
      const query = `attemptId=${encodeURIComponent(reservation.attemptId)}`;
      const response = await axios.post<{ sid: string; status?: string }>(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
        new URLSearchParams({
          To: reservation.phone,
          From: line.phoneNumber,
          Url: `${backendUrl}/voice/webhook/outbound/ai-answer?${query}`,
          Method: 'POST',
          StatusCallback: `${backendUrl}/voice/webhook/outbound/ai-status?${query}`,
          StatusCallbackMethod: 'POST',
          StatusCallbackEvent: 'initiated ringing answered completed',
          Timeout: '30',
        }),
        { auth: { username: accountSid, password: authToken } },
      );
      await this.prisma.voiceAiOutboundAttempt.updateMany({
        where: { id: reservation.attemptId, businessId },
        data: {
          callSid: response.data.sid,
          providerStatus: response.data.status ?? 'queued',
        },
      });
    } catch {
      await this.failAttempt(
        reservation.attemptId,
        reservation.memberId,
        'provider_rejected',
      );
      this.logger.warn(
        `AI campaign call request failed for attempt ${reservation.attemptId}`,
      );
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'Twilio rejected this AI campaign call. The attempt was recorded and no further contact was dialed.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private async failAttempt(
    attemptId: string,
    memberId: string,
    reason: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.voiceAiOutboundAttempt.updateMany({
        where: { id: attemptId },
        data: {
          status: 'failed',
          blockReasonCode: reason,
          endedAt: new Date(),
        },
      });
      await tx.voiceOutboundCampaignMember.updateMany({
        where: {
          id: memberId,
          status: VoiceOutboundCampaignMemberStatus.calling,
        },
        data: {
          status: VoiceOutboundCampaignMemberStatus.retry,
          blockReasonCode: reason,
        },
      });
    });
  }

  private async findCampaign(businessId: string, campaignId: string) {
    const campaign =
      await this.tenantPrisma.client.voiceOutboundCampaign.findFirst({
        where: { id: campaignId, businessId },
        include: {
          aiAgent: {
            select: {
              id: true,
              name: true,
              status: true,
              publishedVersionId: true,
            },
          },
        },
      });
    if (!campaign) {
      throw new AppException(
        VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_NOT_FOUND,
        'Outbound campaign was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return campaign;
  }

  private assertProviderReady() {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!sid || !token || !this.publicBackendUrl()) {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'Twilio account credentials and a public HTTPS BACKEND_URL are required for AI campaigns.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private publicBackendUrl() {
    const value = this.config.get<string>('BACKEND_URL')?.replace(/\/+$/, '');
    if (!value) return null;
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:' ? value : null;
    } catch {
      return null;
    }
  }

  private async endProviderCall(callSid: string) {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) return;
    try {
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
        new URLSearchParams({ Status: 'completed' }),
        { auth: { username: accountSid, password: authToken } },
      );
    } catch {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'Twilio could not end the active AI call. Retry the stop action.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private stateError(message: string) {
    return new AppException(
      VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_STATE,
      message,
      HttpStatus.CONFLICT,
    );
  }
}
