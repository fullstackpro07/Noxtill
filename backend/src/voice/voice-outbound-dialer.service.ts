import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  VoiceAgentPresenceStatus,
  VoiceOutboundCampaignMemberStatus,
  VoiceOutboundCampaignStatus,
  VoiceOutboundDialAttemptStatus,
  VoicePolicyCallerType,
} from '@prisma/client';
import axios from 'axios';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceDialerDispositionDto } from './dto/voice-outbound.dto';
import { VoiceComplianceService } from './voice-compliance.service';
import { VoiceOutboundCampaignService } from './voice-outbound-campaign.service';
import { escapeXml, say, twiml } from './twiml.util';
import {
  VOICE_ERROR_CODES,
  VOICE_PRESENCE_TTL_SECONDS,
} from './voice.constants';

const maskPhone = (phone: string) => `•••• ${phone.slice(-4)}`;

/** Agent leg + customer leg ring timeouts (seconds) passed to Twilio. */
const AGENT_RING_SECONDS = 25;
const CUSTOMER_RING_SECONDS = 25;
/** An agent leg with no provider callback after this long is released so the contact is not stuck. */
const STALE_AGENT_RING_MS = 3 * 60_000;
/** A connected attempt with no Dial result after this long is closed as failed. */
const STALE_CUSTOMER_LEG_MS = 4 * 60 * 60_000;

const IN_FLIGHT: VoiceOutboundDialAttemptStatus[] = [
  VoiceOutboundDialAttemptStatus.agent_ringing,
  VoiceOutboundDialAttemptStatus.customer_ringing,
];
const CALLABLE_MEMBER: VoiceOutboundCampaignMemberStatus[] = [
  VoiceOutboundCampaignMemberStatus.eligible,
  VoiceOutboundCampaignMemberStatus.retry,
];
export const DIALER_DISPOSITIONS = [
  'interested',
  'not_interested',
  'callback_requested',
  'wrong_number',
  'do_not_call',
  'completed',
] as const;

/** Twilio `DialCallStatus` → attempt outcome. Anything unknown is a failure, never a success. */
const isMachine = (answeredBy: string | null) =>
  !!answeredBy && (answeredBy.startsWith('machine') || answeredBy === 'fax');

const DIAL_RESULT: Record<string, VoiceOutboundDialAttemptStatus> = {
  completed: VoiceOutboundDialAttemptStatus.answered,
  answered: VoiceOutboundDialAttemptStatus.answered,
  busy: VoiceOutboundDialAttemptStatus.busy,
  'no-answer': VoiceOutboundDialAttemptStatus.no_answer,
  canceled: VoiceOutboundDialAttemptStatus.canceled,
  failed: VoiceOutboundDialAttemptStatus.failed,
};

/**
 * Outbound Dialers — human power dialer. Twilio first rings the assigned agent's own phone
 * (agents have no browser softphone); only when the agent answers does TwiML dial the customer
 * from the business number. Each attempt re-runs the fail-closed eligibility check, holds a row
 * lock on the contact and the agent, and advances only on signed provider callbacks.
 * AI auto-dialing is not executed here and is refused at campaign start. Webhooks run without a
 * request tenant, so their evidence is the attempt row itself (AuditService needs a CLS tenant).
 */
@Injectable()
export class VoiceOutboundDialerService {
  private readonly logger = new Logger(VoiceOutboundDialerService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly campaigns: VoiceOutboundCampaignService,
    private readonly compliance: VoiceComplianceService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  // ── Campaign control (managers) ──────────────────────────────────────────

  async start(businessId: string, actorUserId: string, campaignId: string) {
    const campaign = await this.findCampaign(businessId, campaignId);
    if (campaign.callerType === VoicePolicyCallerType.ai_voice) {
      throw new AppException(
        VOICE_ERROR_CODES.OUTBOUND_AI_NOT_AVAILABLE,
        'AI outbound calling is not available yet. Use a human agent campaign for the power dialer.',
        HttpStatus.CONFLICT,
      );
    }
    const startable: VoiceOutboundCampaignStatus[] = [
      VoiceOutboundCampaignStatus.approved,
      VoiceOutboundCampaignStatus.paused,
    ];
    if (!startable.includes(campaign.status)) {
      throw this.stateError(
        campaign.status === VoiceOutboundCampaignStatus.draft ||
          campaign.status === VoiceOutboundCampaignStatus.pending_approval
          ? 'This campaign must be approved before it can start.'
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
    if (!campaign.humanAgentProfileId) {
      throw new AppException(
        VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_AGENT_REQUIRED,
        'Assign a human agent before starting this campaign.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const callable =
      await this.tenantPrisma.client.voiceOutboundCampaignMember.count({
        where: { businessId, campaignId, status: { in: CALLABLE_MEMBER } },
      });
    if (callable === 0) {
      throw new AppException(
        VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_EMPTY,
        'No contact in this campaign passed the eligibility preview.',
        HttpStatus.CONFLICT,
      );
    }
    const now = new Date();
    const updated =
      await this.tenantPrisma.client.voiceOutboundCampaign.updateMany({
        where: { id: campaignId, businessId, status: { in: startable } },
        data: {
          status: VoiceOutboundCampaignStatus.running,
          startedAt: campaign.startedAt ?? now,
          startedByUserId: campaign.startedByUserId ?? actorUserId,
          pausedAt: null,
        },
      });
    if (updated.count !== 1)
      throw this.stateError('The campaign changed; reload and retry.');
    await this.audit.log({
      entity: 'VoiceOutboundCampaign',
      entityId: campaignId,
      action:
        campaign.status === VoiceOutboundCampaignStatus.paused
          ? 'voice.campaign.resumed'
          : 'voice.campaign.started',
      after: { callableContacts: callable, actorUserId },
    });
    return this.status(businessId, campaignId);
  }

  /** Draft → pending approval (human or AI campaigns). The eligibility preview must have run on the current draft. */
  async requestApproval(
    businessId: string,
    actorUserId: string,
    campaignId: string,
  ) {
    const campaign = await this.findCampaign(businessId, campaignId);
    if (!campaign.eligibilityCheckedAt) {
      throw new AppException(
        VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_PREVIEW_REQUIRED,
        'Run the eligibility preview before requesting approval.',
        HttpStatus.CONFLICT,
      );
    }
    return this.transition(
      businessId,
      actorUserId,
      campaignId,
      [VoiceOutboundCampaignStatus.draft],
      {
        status: VoiceOutboundCampaignStatus.pending_approval,
        approvalRequestedAt: new Date(),
        approvalRequestedBy: actorUserId,
      },
      'voice.campaign.approval_requested',
    );
  }

  /**
   * Pending → approved. A second person must approve; only the business owner may approve a
   * campaign they requested themselves.
   */
  async approve(
    businessId: string,
    actorUserId: string,
    actorIsOwner: boolean,
    campaignId: string,
  ) {
    const campaign = await this.findCampaign(businessId, campaignId);
    if (campaign.approvalRequestedBy === actorUserId && !actorIsOwner) {
      throw new AppException(
        VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_STATE,
        'Another manager must approve a campaign you submitted.',
        HttpStatus.FORBIDDEN,
      );
    }
    return this.transition(
      businessId,
      actorUserId,
      campaignId,
      [VoiceOutboundCampaignStatus.pending_approval],
      {
        status: VoiceOutboundCampaignStatus.approved,
        approvedAt: new Date(),
        approvedByUserId: actorUserId,
      },
      'voice.campaign.approved',
    );
  }

  /** Pending or approved (not yet started) → back to draft for changes. */
  async sendBack(businessId: string, actorUserId: string, campaignId: string) {
    return this.transition(
      businessId,
      actorUserId,
      campaignId,
      [
        VoiceOutboundCampaignStatus.pending_approval,
        VoiceOutboundCampaignStatus.approved,
      ],
      {
        status: VoiceOutboundCampaignStatus.draft,
        approvalRequestedAt: null,
        approvalRequestedBy: null,
        approvedAt: null,
        approvedByUserId: null,
      },
      'voice.campaign.sent_back',
    );
  }

  /** Background: approved campaigns whose schedule has arrived start running (no request tenant). */
  async startDueScheduled(now = new Date()): Promise<number> {
    const due = await this.prisma.voiceOutboundCampaign.findMany({
      where: {
        status: VoiceOutboundCampaignStatus.approved,
        scheduledAt: { lte: now },
        callerType: VoicePolicyCallerType.live_agent,
      },
      select: { id: true, approvedByUserId: true },
      take: 100,
    });
    let started = 0;
    for (const campaign of due) {
      const result = await this.prisma.voiceOutboundCampaign.updateMany({
        where: {
          id: campaign.id,
          status: VoiceOutboundCampaignStatus.approved,
        },
        data: {
          status: VoiceOutboundCampaignStatus.running,
          startedAt: now,
          startedByUserId: campaign.approvedByUserId,
        },
      });
      started += result.count;
    }
    return started;
  }

  async pause(businessId: string, actorUserId: string, campaignId: string) {
    return this.transition(
      businessId,
      actorUserId,
      campaignId,
      [VoiceOutboundCampaignStatus.running],
      { status: VoiceOutboundCampaignStatus.paused, pausedAt: new Date() },
      'voice.campaign.paused',
    );
  }

  /** Terminal kill-switch: no new attempts; an agent leg not yet bridged is not connected to the customer. */
  async stop(businessId: string, actorUserId: string, campaignId: string) {
    return this.transition(
      businessId,
      actorUserId,
      campaignId,
      [
        VoiceOutboundCampaignStatus.approved,
        VoiceOutboundCampaignStatus.running,
        VoiceOutboundCampaignStatus.paused,
      ],
      { status: VoiceOutboundCampaignStatus.stopped, stoppedAt: new Date() },
      'voice.campaign.stopped',
    );
  }

  /** Campaign run state + attempt log for the Outbound Dialers screen. */
  async status(businessId: string, campaignId: string) {
    const campaign = await this.findCampaign(businessId, campaignId);
    await this.releaseStale(businessId);
    const attempts =
      await this.tenantPrisma.client.voiceOutboundDialAttempt.findMany({
        where: { businessId, campaignId },
        include: {
          member: {
            include: { customer: { select: { name: true, phone: true } } },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 100,
      });
    const counts = attempts.reduce<Record<string, number>>((acc, attempt) => {
      acc[attempt.status] = (acc[attempt.status] ?? 0) + 1;
      return acc;
    }, {});
    return {
      campaignId,
      status: campaign.status,
      startedAt: campaign.startedAt?.toISOString() ?? null,
      pausedAt: campaign.pausedAt?.toISOString() ?? null,
      stoppedAt: campaign.stoppedAt?.toISOString() ?? null,
      attemptCounts: counts,
      attempts: attempts.map((attempt) => this.presentAttempt(attempt)),
    };
  }

  /** Campaign report from saved members and attempts only (no estimates, no ROI guesses). */
  async report(businessId: string, campaignId: string) {
    const campaign = await this.findCampaign(businessId, campaignId);
    const [members, attempts] = await Promise.all([
      this.tenantPrisma.client.voiceOutboundCampaignMember.findMany({
        where: { businessId, campaignId },
        select: {
          status: true,
          attemptCount: true,
          disposition: true,
          blockReasonCode: true,
        },
      }),
      this.tenantPrisma.client.voiceOutboundDialAttempt.findMany({
        where: { businessId, campaignId },
        select: {
          status: true,
          customerDialed: true,
          durationSec: true,
          blockReasonCode: true,
        },
      }),
    ]);
    const tally = <T extends string>(values: (T | null)[]) =>
      values.reduce<Record<string, number>>((acc, value) => {
        if (value) acc[value] = (acc[value] ?? 0) + 1;
        return acc;
      }, {});
    const dialed = attempts.filter((a) => a.customerDialed).length;
    const connected = attempts.filter(
      (a) => a.status === VoiceOutboundDialAttemptStatus.answered,
    ).length;
    const blocked = attempts.filter(
      (a) => a.status === VoiceOutboundDialAttemptStatus.blocked,
    );
    const contacted = members.filter((m) => m.attemptCount > 0);
    return {
      campaignId,
      status: campaign.status,
      contacts: members.length,
      memberStatus: tally(members.map((m) => m.status)),
      attempts: attempts.length,
      attemptStatus: tally(attempts.map((a) => a.status)),
      customerDialed: dialed,
      connected,
      connectRate: dialed ? connected / dialed : null,
      voicemails: attempts.filter(
        (a) => a.status === VoiceOutboundDialAttemptStatus.voicemail,
      ).length,
      blockedAttempts: blocked.length,
      blockedRate: attempts.length ? blocked.length / attempts.length : null,
      blockedReasons: tally(blocked.map((a) => a.blockReasonCode)),
      dispositions: tally(members.map((m) => m.disposition)),
      optOuts: members.filter(
        (m) => m.status === VoiceOutboundCampaignMemberStatus.opted_out,
      ).length,
      averageDialsPerContactedContact: contacted.length
        ? contacted.reduce((sum, m) => sum + m.attemptCount, 0) /
          contacted.length
        : null,
      talkSeconds: attempts.reduce((sum, a) => sum + (a.durationSec ?? 0), 0),
      providerCost: 'not_available' as const,
    };
  }

  // ── Power dialer (the assigned agent) ────────────────────────────────────

  /** Next callable contact for the signed-in agent, with its prior attempts. Never dials. */
  async next(businessId: string, actorUserId: string, campaignId: string) {
    const { campaign, profile } = await this.assignedAgent(
      businessId,
      actorUserId,
      campaignId,
    );
    await this.releaseStale(businessId);
    const inFlight =
      await this.tenantPrisma.client.voiceOutboundDialAttempt.findFirst({
        where: {
          businessId,
          agentProfileId: profile.id,
          status: { in: IN_FLIGHT },
        },
        include: {
          member: {
            include: { customer: { select: { name: true, phone: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    const awaiting =
      await this.tenantPrisma.client.voiceOutboundDialAttempt.findFirst({
        where: {
          businessId,
          campaignId,
          agentProfileId: profile.id,
          status: VoiceOutboundDialAttemptStatus.answered,
          disposition: null,
        },
        include: {
          member: {
            include: { customer: { select: { name: true, phone: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    const member = await this.nextCallableMember(businessId, campaign);
    if (!member && !inFlight)
      await this.completeIfExhausted(businessId, campaign.id);
    const prior = member
      ? await this.tenantPrisma.client.voiceOutboundDialAttempt.findMany({
          where: { businessId, memberId: member.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
        })
      : [];
    return {
      campaignId,
      campaignStatus: campaign.status,
      openingScript: campaign.openingScript,
      agentAvailable: this.isAvailable(profile),
      inFlight: inFlight ? this.presentAttempt(inFlight) : null,
      awaitingDisposition: awaiting ? this.presentAttempt(awaiting) : null,
      contact: member
        ? {
            memberId: member.id,
            customerId: member.customerId,
            name: member.customer.name,
            phone: maskPhone(member.customer.phone),
            status: member.status,
            attemptCount: member.attemptCount,
            maxAttempts: campaign.maxAttemptsPerContact,
            lastAttemptAt: member.lastAttemptAt?.toISOString() ?? null,
            priorAttempts: prior.map((row) => ({
              id: row.id,
              status: row.status,
              disposition: row.disposition,
              createdAt: row.createdAt.toISOString(),
            })),
          }
        : null,
    };
  }

  /**
   * Places one attempt. Order: lock contact + agent → re-check eligibility (decision row) →
   * originate the agent leg. A blocked/DNC/no-consent contact never reaches the provider.
   */
  async attempt(
    businessId: string,
    actorUserId: string,
    campaignId: string,
    memberId: string,
  ) {
    const { campaign, profile } = await this.assignedAgent(
      businessId,
      actorUserId,
      campaignId,
    );
    await this.releaseStale(businessId);
    const businessNumber =
      await this.tenantPrisma.client.phoneNumber.findUnique({
        where: { businessId },
      });
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!businessNumber || !accountSid || !authToken) {
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        businessNumber
          ? 'Voice calling is not configured on this server.'
          : 'Provision a business phone number before using the power dialer.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const agentPhone = profile.staffUser.user.phone;
    if (!agentPhone) {
      throw new AppException(
        VOICE_ERROR_CODES.NO_STAFF_PHONE,
        'Add a phone number to your account; the dialer rings it before calling the customer.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 1. Reserve the contact and the agent atomically (two concurrent clicks → one call).
    const reserved = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM voice_human_agent_profiles WHERE id = ${profile.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM voice_outbound_campaign_members WHERE id = ${memberId} FOR UPDATE`;
      const fresh = await tx.voiceOutboundCampaign.findFirst({
        where: { id: campaignId, businessId },
        select: { status: true },
      });
      if (fresh?.status !== VoiceOutboundCampaignStatus.running) {
        throw this.stateError('This campaign is not running.');
      }
      const agent = await tx.voiceHumanAgentProfile.findUniqueOrThrow({
        where: { id: profile.id },
      });
      if (!this.isAvailable(agent)) {
        throw new AppException(
          VOICE_ERROR_CODES.DIALER_AGENT_UNAVAILABLE,
          'Set your status to Available (and keep this screen open) before dialing.',
          HttpStatus.CONFLICT,
        );
      }
      const busy = await tx.voiceOutboundDialAttempt.count({
        where: {
          businessId,
          agentProfileId: profile.id,
          status: { in: IN_FLIGHT },
        },
      });
      const liveInbound = await tx.voiceHumanAgentAssignment.count({
        where: {
          businessId,
          profileId: profile.id,
          OR: [
            { status: 'connected' },
            { status: 'offered', expiresAt: { gt: new Date() } },
          ],
        },
      });
      const callbackBusy = await tx.voiceCallbackAttempt.count({
        where: {
          businessId,
          agentProfileId: profile.id,
          status: { in: IN_FLIGHT },
        },
      });
      if (busy > 0 || liveInbound > 0 || callbackBusy > 0) {
        throw new AppException(
          VOICE_ERROR_CODES.DIALER_AGENT_UNAVAILABLE,
          'You already have a call in progress.',
          HttpStatus.CONFLICT,
        );
      }
      const member = await tx.voiceOutboundCampaignMember.findFirst({
        where: { id: memberId, businessId, campaignId },
        include: {
          customer: {
            select: { phone: true, consentMarketing: true, name: true },
          },
        },
      });
      if (!member || !this.callable(member, campaign)) {
        throw new AppException(
          VOICE_ERROR_CODES.DIALER_CONTACT_UNAVAILABLE,
          'This contact is not callable right now (already called, blocked, at its attempt limit or cooling down).',
          HttpStatus.CONFLICT,
        );
      }
      await tx.voiceOutboundCampaignMember.update({
        where: { id: member.id },
        data: { status: VoiceOutboundCampaignMemberStatus.calling },
      });
      return member;
    });

    // 2. Per-attempt compliance check (writes its own decision + audit row).
    let check: Awaited<
      ReturnType<VoiceOutboundCampaignService['evaluateMember']>
    >;
    try {
      check = await this.campaigns.evaluateMember(
        businessId,
        actorUserId,
        campaign,
        reserved.customer,
      );
    } catch (error) {
      await this.restoreMember(reserved.id, reserved.status);
      throw error;
    }
    if (!check.eligible) {
      const blocked =
        await this.tenantPrisma.client.voiceOutboundDialAttempt.create({
          data: {
            businessId,
            campaignId,
            memberId: reserved.id,
            agentProfileId: profile.id,
            eligibilityDecisionId: check.decisionId,
            status: VoiceOutboundDialAttemptStatus.blocked,
            blockReasonCode: check.reasonCode,
            createdByUserId: actorUserId,
            endedAt: new Date(),
          },
        });
      await this.tenantPrisma.client.voiceOutboundCampaignMember.update({
        where: { id: reserved.id },
        data: {
          status:
            check.reasonCode === 'suppressed' ||
            check.reasonCode === 'customer_opted_out'
              ? VoiceOutboundCampaignMemberStatus.opted_out
              : check.reasonCode === 'outside_calling_window'
                ? reserved.status
                : VoiceOutboundCampaignMemberStatus.blocked,
          blockReasonCode: check.reasonCode,
          eligibilityDecisionId: check.decisionId,
          eligibilityCheckedAt: new Date(),
        },
      });
      await this.audit.log({
        entity: 'VoiceOutboundDialAttempt',
        entityId: blocked.id,
        action: 'voice.dialer.eligibility_blocked',
        after: { campaignId, reasonCode: check.reasonCode, callPlaced: false },
      });
      return {
        attemptId: blocked.id,
        placed: false,
        status: blocked.status,
        reasonCode: check.reasonCode,
      };
    }

    // 3. Originate the agent leg. Customer is dialed only from the signed answer webhook.
    const attempt =
      await this.tenantPrisma.client.voiceOutboundDialAttempt.create({
        data: {
          businessId,
          campaignId,
          memberId: reserved.id,
          agentProfileId: profile.id,
          eligibilityDecisionId: check.decisionId,
          status: VoiceOutboundDialAttemptStatus.agent_ringing,
          createdByUserId: actorUserId,
        },
      });
    const backendUrl = this.config.get<string>('BACKEND_URL') ?? '';
    const q = `attemptId=${encodeURIComponent(attempt.id)}`;
    let agentCallSid: string;
    try {
      const response = await axios.post<{ sid: string }>(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
        new URLSearchParams({
          To: agentPhone,
          From: businessNumber.phoneNumber,
          Url: `${backendUrl}/voice/webhook/outbound/agent-answered?${q}`,
          Method: 'POST',
          StatusCallback: `${backendUrl}/voice/webhook/outbound/agent-status?${q}`,
          StatusCallbackMethod: 'POST',
          Timeout: String(AGENT_RING_SECONDS),
        }),
        { auth: { username: accountSid, password: authToken } },
      );
      agentCallSid = response.data.sid;
    } catch {
      await this.tenantPrisma.client.voiceOutboundDialAttempt.update({
        where: { id: attempt.id },
        data: {
          status: VoiceOutboundDialAttemptStatus.failed,
          blockReasonCode: 'provider_rejected',
          endedAt: new Date(),
        },
      });
      await this.restoreMember(reserved.id, reserved.status);
      this.logger.warn(
        `Power dialer originate failed for attempt ${attempt.id}`,
      );
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'The call provider rejected the call. Nothing was dialed.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    // The provider accepted the call; from here the attempt is live even if bookkeeping fails.
    await this.tenantPrisma.client.voiceOutboundDialAttempt.update({
      where: { id: attempt.id },
      data: { agentCallSid },
    });
    await this.audit.log({
      entity: 'VoiceOutboundDialAttempt',
      entityId: attempt.id,
      action: 'voice.dialer.attempt_queued',
      after: {
        campaignId,
        decisionId: check.decisionId,
        agentLegRequested: true,
      },
    });
    return {
      attemptId: attempt.id,
      placed: true,
      status: attempt.status,
      reasonCode: null,
    };
  }

  async skip(
    businessId: string,
    actorUserId: string,
    campaignId: string,
    memberId: string,
  ) {
    await this.assignedAgent(businessId, actorUserId, campaignId);
    const result =
      await this.tenantPrisma.client.voiceOutboundCampaignMember.updateMany({
        where: {
          id: memberId,
          businessId,
          campaignId,
          status: { in: CALLABLE_MEMBER },
        },
        data: { status: VoiceOutboundCampaignMemberStatus.skipped },
      });
    if (result.count !== 1) {
      throw new AppException(
        VOICE_ERROR_CODES.DIALER_CONTACT_UNAVAILABLE,
        'This contact can no longer be skipped.',
        HttpStatus.CONFLICT,
      );
    }
    await this.audit.log({
      entity: 'VoiceOutboundCampaignMember',
      entityId: memberId,
      action: 'voice.dialer.contact_skipped',
      after: { campaignId, actorUserId },
    });
    return { memberId, status: VoiceOutboundCampaignMemberStatus.skipped };
  }

  /** Agent outcome after a connected call. `do_not_call` writes a real suppression entry. */
  async disposition(
    businessId: string,
    actorUserId: string,
    attemptId: string,
    dto: VoiceDialerDispositionDto,
  ) {
    const attempt =
      await this.tenantPrisma.client.voiceOutboundDialAttempt.findFirst({
        where: { id: attemptId, businessId },
        include: {
          campaign: true,
          member: { include: { customer: { select: { phone: true } } } },
          agentProfile: {
            include: { staffUser: { select: { userId: true } } },
          },
        },
      });
    if (!attempt || attempt.agentProfile.staffUser.userId !== actorUserId) {
      throw new AppException(
        VOICE_ERROR_CODES.DIALER_ATTEMPT_NOT_FOUND,
        'Dial attempt was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      attempt.status !== VoiceOutboundDialAttemptStatus.answered ||
      attempt.disposition
    ) {
      throw this.stateError(
        'Only an answered call without an outcome can be dispositioned.',
      );
    }
    if (dto.disposition === 'do_not_call') {
      await this.compliance.addSuppression(businessId, actorUserId, {
        phoneE164: attempt.member.customer.phone,
        purpose: null,
        source: 'outbound_disposition',
        reason: `Contact asked not to be called again (campaign "${attempt.campaign.name}").`,
        effectiveAt: new Date().toISOString(),
      });
    }
    await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.voiceOutboundDialAttempt.update({
        where: { id: attempt.id },
        data: {
          disposition: dto.disposition,
          dispositionNotes: dto.notes?.trim() || null,
        },
      }),
      this.tenantPrisma.client.voiceOutboundCampaignMember.update({
        where: { id: attempt.memberId },
        data: {
          disposition: dto.disposition,
          status:
            dto.disposition === 'do_not_call'
              ? VoiceOutboundCampaignMemberStatus.opted_out
              : VoiceOutboundCampaignMemberStatus.completed,
        },
      }),
    ]);
    await this.audit.log({
      entity: 'VoiceOutboundDialAttempt',
      entityId: attempt.id,
      action:
        dto.disposition === 'do_not_call'
          ? 'voice.dialer.opt_out_received'
          : 'voice.dialer.dispositioned',
      after: { campaignId: attempt.campaignId, disposition: dto.disposition },
    });
    return { attemptId: attempt.id, disposition: dto.disposition };
  }

  // ── Signed Twilio webhooks (no request tenant; resolve by attempt id) ────

  /** Agent picked up: bridge to the customer only if the attempt and campaign are still live. */
  async agentAnsweredTwiml(attemptId: string): Promise<string> {
    const attempt = await this.prisma.voiceOutboundDialAttempt.findUnique({
      where: { id: attemptId },
      include: {
        campaign: { select: { status: true, voicemailDetection: true } },
        member: {
          include: { customer: { select: { name: true, phone: true } } },
        },
      },
    });
    if (
      !attempt ||
      attempt.status !== VoiceOutboundDialAttemptStatus.agent_ringing ||
      attempt.campaign.status !== VoiceOutboundCampaignStatus.running
    ) {
      if (attempt?.status === VoiceOutboundDialAttemptStatus.agent_ringing) {
        await this.prisma.$transaction([
          this.prisma.voiceOutboundDialAttempt.update({
            where: { id: attempt.id },
            data: {
              status: VoiceOutboundDialAttemptStatus.canceled,
              endedAt: new Date(),
            },
          }),
          this.prisma.voiceOutboundCampaignMember.update({
            where: { id: attempt.memberId },
            data: { status: this.memberResting(attempt.member.attemptCount) },
          }),
        ]);
      }
      return twiml(
        `${say('This campaign call was cancelled. The customer was not dialed.')}<Hangup/>`,
      );
    }
    const businessNumber = await this.prisma.phoneNumber.findUnique({
      where: { businessId: attempt.businessId },
    });
    if (!businessNumber) {
      return twiml(
        `${say('No business number is configured. The customer was not dialed.')}<Hangup/>`,
      );
    }
    const now = new Date();
    const moved = await this.prisma.voiceOutboundDialAttempt.updateMany({
      where: {
        id: attempt.id,
        status: VoiceOutboundDialAttemptStatus.agent_ringing,
      },
      data: {
        status: VoiceOutboundDialAttemptStatus.customer_ringing,
        customerDialed: true,
      },
    });
    if (moved.count !== 1) return twiml('<Hangup/>');
    await this.prisma.voiceOutboundCampaignMember.update({
      where: { id: attempt.memberId },
      data: { attemptCount: { increment: 1 }, lastAttemptAt: now },
    });
    const backendUrl = this.config.get<string>('BACKEND_URL') ?? '';
    const q = `attemptId=${encodeURIComponent(attempt.id)}`;
    const action = `${backendUrl}/voice/webhook/outbound/customer-result?${q}`;
    // Answering-machine detection is asynchronous: the result arrives on its own signed callback.
    const amd = attempt.campaign.voicemailDetection
      ? ` machineDetection="Enable" amdStatusCallback="${escapeXml(`${backendUrl}/voice/webhook/outbound/amd?${q}`)}" amdStatusCallbackMethod="POST"`
      : '';
    return twiml(
      `${say(`Connecting you to ${attempt.member.customer.name}.`)}<Dial callerId="${escapeXml(businessNumber.phoneNumber)}" timeout="${CUSTOMER_RING_SECONDS}" answerOnBridge="true" action="${escapeXml(action)}" method="POST"><Number${amd}>${escapeXml(attempt.member.customer.phone)}</Number></Dial>`,
    );
  }

  /** `<Dial action>` result for the customer leg. */
  async customerResult(
    attemptId: string,
    dialCallStatus: string,
    durationSec?: number,
  ) {
    const attempt = await this.prisma.voiceOutboundDialAttempt.findUnique({
      where: { id: attemptId },
      include: { campaign: true, member: true },
    });
    if (
      !attempt ||
      attempt.status !== VoiceOutboundDialAttemptStatus.customer_ringing
    ) {
      return twiml('<Hangup/>');
    }
    const dialed =
      DIAL_RESULT[dialCallStatus] ?? VoiceOutboundDialAttemptStatus.failed;
    // A connected leg that the provider classified as a machine is a voicemail, not a conversation.
    const status =
      dialed === VoiceOutboundDialAttemptStatus.answered &&
      isMachine(attempt.answeredBy)
        ? VoiceOutboundDialAttemptStatus.voicemail
        : dialed;
    const answered = status === VoiceOutboundDialAttemptStatus.answered;
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.voiceOutboundDialAttempt.update({
        where: { id: attempt.id },
        data: {
          status,
          answeredAt: answered ? now : null,
          durationSec:
            answered && Number.isFinite(durationSec) ? durationSec : null,
          endedAt: now,
        },
      }),
      this.prisma.voiceOutboundCampaignMember.update({
        where: { id: attempt.memberId },
        data: {
          status: answered
            ? VoiceOutboundCampaignMemberStatus.answered
            : attempt.member.attemptCount <
                attempt.campaign.maxAttemptsPerContact
              ? VoiceOutboundCampaignMemberStatus.retry
              : VoiceOutboundCampaignMemberStatus.completed,
        },
      }),
    ]);
    return twiml('<Hangup/>');
  }

  /** Asynchronous answering-machine result for the customer leg. */
  async answeringMachineResult(attemptId: string, answeredBy: string) {
    const value = answeredBy.slice(0, 30);
    const attempt = await this.prisma.voiceOutboundDialAttempt.findUnique({
      where: { id: attemptId },
      include: { campaign: true, member: true },
    });
    if (!attempt) return;
    await this.prisma.voiceOutboundDialAttempt.update({
      where: { id: attempt.id },
      data: { answeredBy: value },
    });
    // The Dial result came first and counted it as answered: correct it to voicemail.
    if (
      attempt.status === VoiceOutboundDialAttemptStatus.answered &&
      !attempt.disposition &&
      isMachine(value)
    ) {
      await this.prisma.$transaction([
        this.prisma.voiceOutboundDialAttempt.update({
          where: { id: attempt.id },
          data: { status: VoiceOutboundDialAttemptStatus.voicemail },
        }),
        this.prisma.voiceOutboundCampaignMember.updateMany({
          where: {
            id: attempt.memberId,
            status: VoiceOutboundCampaignMemberStatus.answered,
          },
          data: {
            status:
              attempt.member.attemptCount <
              attempt.campaign.maxAttemptsPerContact
                ? VoiceOutboundCampaignMemberStatus.retry
                : VoiceOutboundCampaignMemberStatus.completed,
          },
        }),
      ]);
    }
  }

  /** Agent-leg status callback. An agent leg that ended unanswered releases the contact untouched. */
  async agentStatus(attemptId: string, callStatus: string) {
    const attempt = await this.prisma.voiceOutboundDialAttempt.findUnique({
      where: { id: attemptId },
      include: { member: true },
    });
    if (
      !attempt ||
      attempt.status !== VoiceOutboundDialAttemptStatus.agent_ringing
    )
      return;
    const ended = ['completed', 'busy', 'no-answer', 'failed', 'canceled'];
    if (!ended.includes(callStatus)) return;
    await this.prisma.$transaction([
      this.prisma.voiceOutboundDialAttempt.update({
        where: { id: attempt.id },
        data: {
          status:
            callStatus === 'failed'
              ? VoiceOutboundDialAttemptStatus.failed
              : VoiceOutboundDialAttemptStatus.agent_no_answer,
          endedAt: new Date(),
        },
      }),
      this.prisma.voiceOutboundCampaignMember.update({
        where: { id: attempt.memberId },
        data: { status: this.memberResting(attempt.member.attemptCount) },
      }),
    ]);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async transition(
    businessId: string,
    actorUserId: string,
    campaignId: string,
    from: VoiceOutboundCampaignStatus[],
    data: Prisma.VoiceOutboundCampaignUpdateManyMutationInput,
    action: string,
  ) {
    const campaign = await this.findCampaign(businessId, campaignId);
    const result =
      await this.tenantPrisma.client.voiceOutboundCampaign.updateMany({
        where: { id: campaignId, businessId, status: { in: from } },
        data,
      });
    if (result.count !== 1) {
      throw this.stateError(`A ${campaign.status} campaign cannot do that.`);
    }
    await this.audit.log({
      entity: 'VoiceOutboundCampaign',
      entityId: campaignId,
      action,
      before: { status: campaign.status },
      after: { status: data.status, actorUserId },
    });
    return this.status(businessId, campaignId);
  }

  private async assignedAgent(
    businessId: string,
    actorUserId: string,
    campaignId: string,
  ) {
    const campaign = await this.findCampaign(businessId, campaignId);
    const profile =
      await this.tenantPrisma.client.voiceHumanAgentProfile.findFirst({
        where: {
          businessId,
          active: true,
          staffUser: { userId: actorUserId, active: true },
        },
        include: {
          staffUser: { select: { user: { select: { phone: true } } } },
        },
      });
    if (!profile || campaign.humanAgentProfileId !== profile.id) {
      throw new AppException(
        VOICE_ERROR_CODES.DIALER_NOT_ASSIGNED,
        'Only the agent assigned to this campaign can use its power dialer.',
        HttpStatus.FORBIDDEN,
      );
    }
    return { campaign, profile };
  }

  private async nextCallableMember(
    businessId: string,
    campaign: {
      id: string;
      maxAttemptsPerContact: number;
      retryCooldownHours: number;
    },
  ) {
    const candidates =
      await this.tenantPrisma.client.voiceOutboundCampaignMember.findMany({
        where: {
          businessId,
          campaignId: campaign.id,
          status: { in: CALLABLE_MEMBER },
          attemptCount: { lt: campaign.maxAttemptsPerContact },
        },
        include: { customer: { select: { name: true, phone: true } } },
        orderBy: [{ attemptCount: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        take: 50,
      });
    return candidates.find((member) => this.callable(member, campaign)) ?? null;
  }

  private callable(
    member: {
      status: VoiceOutboundCampaignMemberStatus;
      attemptCount: number;
      lastAttemptAt: Date | null;
    },
    campaign: { maxAttemptsPerContact: number; retryCooldownHours: number },
  ) {
    if (!CALLABLE_MEMBER.includes(member.status)) return false;
    if (member.attemptCount >= campaign.maxAttemptsPerContact) return false;
    if (!member.lastAttemptAt) return true;
    return (
      Date.now() - member.lastAttemptAt.getTime() >=
      campaign.retryCooldownHours * 3_600_000
    );
  }

  private isAvailable(profile: {
    presenceStatus: VoiceAgentPresenceStatus;
    lastHeartbeatAt: Date | null;
  }) {
    return (
      profile.presenceStatus === VoiceAgentPresenceStatus.available &&
      !!profile.lastHeartbeatAt &&
      Date.now() - profile.lastHeartbeatAt.getTime() <=
        VOICE_PRESENCE_TTL_SECONDS * 1000
    );
  }

  private memberResting(attemptCount: number) {
    return attemptCount > 0
      ? VoiceOutboundCampaignMemberStatus.retry
      : VoiceOutboundCampaignMemberStatus.eligible;
  }

  private async restoreMember(
    memberId: string,
    status: VoiceOutboundCampaignMemberStatus,
  ) {
    await this.tenantPrisma.client.voiceOutboundCampaignMember.updateMany({
      where: {
        id: memberId,
        status: VoiceOutboundCampaignMemberStatus.calling,
      },
      data: { status },
    });
  }

  /** Releases attempts whose provider callbacks never arrived, so contacts/agents are not stuck. */
  private async releaseStale(businessId: string) {
    const now = Date.now();
    const stale =
      await this.tenantPrisma.client.voiceOutboundDialAttempt.findMany({
        where: {
          businessId,
          OR: [
            {
              status: VoiceOutboundDialAttemptStatus.agent_ringing,
              createdAt: { lt: new Date(now - STALE_AGENT_RING_MS) },
            },
            {
              status: VoiceOutboundDialAttemptStatus.customer_ringing,
              updatedAt: { lt: new Date(now - STALE_CUSTOMER_LEG_MS) },
            },
          ],
        },
        include: { member: true, campaign: true },
      });
    for (const attempt of stale) {
      const agentLeg =
        attempt.status === VoiceOutboundDialAttemptStatus.agent_ringing;
      await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.voiceOutboundDialAttempt.updateMany({
          where: { id: attempt.id, status: attempt.status },
          data: {
            status: VoiceOutboundDialAttemptStatus.failed,
            blockReasonCode: 'provider_callback_missing',
            endedAt: new Date(),
          },
        }),
        this.tenantPrisma.client.voiceOutboundCampaignMember.updateMany({
          where: {
            id: attempt.memberId,
            status: VoiceOutboundCampaignMemberStatus.calling,
          },
          data: {
            status: agentLeg
              ? this.memberResting(attempt.member.attemptCount)
              : attempt.member.attemptCount <
                  attempt.campaign.maxAttemptsPerContact
                ? VoiceOutboundCampaignMemberStatus.retry
                : VoiceOutboundCampaignMemberStatus.completed,
          },
        }),
      ]);
    }
  }

  private async completeIfExhausted(businessId: string, campaignId: string) {
    const open =
      await this.tenantPrisma.client.voiceOutboundCampaignMember.count({
        where: {
          businessId,
          campaignId,
          status: {
            in: [
              ...CALLABLE_MEMBER,
              VoiceOutboundCampaignMemberStatus.calling,
              VoiceOutboundCampaignMemberStatus.answered,
            ],
          },
        },
      });
    if (open > 0) return;
    const done =
      await this.tenantPrisma.client.voiceOutboundCampaign.updateMany({
        where: {
          id: campaignId,
          businessId,
          status: VoiceOutboundCampaignStatus.running,
        },
        data: {
          status: VoiceOutboundCampaignStatus.completed,
          stoppedAt: new Date(),
        },
      });
    if (done.count === 1) {
      await this.audit.log({
        entity: 'VoiceOutboundCampaign',
        entityId: campaignId,
        action: 'voice.campaign.completed',
        after: { reason: 'no_callable_contacts' },
      });
    }
  }

  private presentAttempt(attempt: {
    id: string;
    memberId: string;
    status: VoiceOutboundDialAttemptStatus;
    blockReasonCode: string | null;
    customerDialed: boolean;
    durationSec: number | null;
    disposition: string | null;
    createdAt: Date;
    answeredAt: Date | null;
    endedAt: Date | null;
    member: { customer: { name: string; phone: string } };
  }) {
    return {
      id: attempt.id,
      memberId: attempt.memberId,
      contactName: attempt.member.customer.name,
      phone: maskPhone(attempt.member.customer.phone),
      status: attempt.status,
      blockReasonCode: attempt.blockReasonCode,
      customerDialed: attempt.customerDialed,
      durationSec: attempt.durationSec,
      disposition: attempt.disposition,
      createdAt: attempt.createdAt.toISOString(),
      answeredAt: attempt.answeredAt?.toISOString() ?? null,
      endedAt: attempt.endedAt?.toISOString() ?? null,
    };
  }

  private async findCampaign(businessId: string, campaignId: string) {
    const campaign =
      await this.tenantPrisma.client.voiceOutboundCampaign.findFirst({
        where: { id: campaignId, businessId },
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

  private stateError(message: string) {
    return new AppException(
      VOICE_ERROR_CODES.OUTBOUND_CAMPAIGN_STATE,
      message,
      HttpStatus.CONFLICT,
    );
  }
}
