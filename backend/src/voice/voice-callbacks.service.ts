import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PhoneCallStatus,
  VoiceOutboundDialAttemptStatus,
  VoicePolicyCallerType,
} from '@prisma/client';
import axios from 'axios';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { voiceSpendState } from './voice-usage-metering.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompleteVoiceCallbackDto,
  PlaceVoiceCallbackDto,
} from './dto/voice-callback.dto';
import { VoiceComplianceService } from './voice-compliance.service';
import { escapeXml, say, twiml } from './twiml.util';
import { VOICE_ERROR_CODES } from './voice.constants';

const maskPhone = (phone: string) => `•••• ${phone.slice(-4)}`;
const AGENT_RING_SECONDS = 25;
const CUSTOMER_RING_SECONDS = 25;
const STALE_AGENT_RING_MS = 3 * 60_000;
/** A bridged leg can legitimately run long; only release it after this. */
const STALE_CUSTOMER_LEG_MS = 4 * 60 * 60_000;
const IN_FLIGHT: VoiceOutboundDialAttemptStatus[] = [
  VoiceOutboundDialAttemptStatus.agent_ringing,
  VoiceOutboundDialAttemptStatus.customer_ringing,
];
const DIAL_RESULT: Record<string, VoiceOutboundDialAttemptStatus> = {
  completed: VoiceOutboundDialAttemptStatus.answered,
  answered: VoiceOutboundDialAttemptStatus.answered,
  busy: VoiceOutboundDialAttemptStatus.busy,
  'no-answer': VoiceOutboundDialAttemptStatus.no_answer,
  canceled: VoiceOutboundDialAttemptStatus.canceled,
  failed: VoiceOutboundDialAttemptStatus.failed,
};
/** Recovery window shown on the Missed Calls screen. */
const WINDOW_DAYS = 30;

/**
 * Missed Calls — compliant call-backs. Each try re-runs the outbound eligibility check
 * (purpose `callback`, live agent) before anything is dialed. With a provider and an agent
 * profile, Twilio rings the staff member's phone first and bridges to the caller from the
 * business number; otherwise the check result is returned so staff may dial manually.
 */
@Injectable()
export class VoiceCallbacksService {
  private readonly logger = new Logger(VoiceCallbacksService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly compliance: VoiceComplianceService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Missed or callback-requested calls in the recovery window, with their call-back state. */
  async list(businessId: string) {
    await this.releaseStale(businessId);
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
    const calls = await this.tenantPrisma.client.phoneCall.findMany({
      where: {
        businessId,
        startedAt: { gte: since },
        OR: [
          { status: PhoneCallStatus.missed },
          { callbackRequestedAt: { not: null } },
        ],
      },
      include: {
        callback: {
          include: {
            attempts: { orderBy: { createdAt: 'desc' }, take: 5 },
          },
        },
      },
      orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
      take: 200,
    });
    // Delivery comes from the message pipeline's provider status, never assumed from "queued".
    const messageIds = calls
      .map((call) => call.textBackMessageId)
      .filter((id): id is string => !!id);
    const messages = messageIds.length
      ? await this.tenantPrisma.client.message.findMany({
          where: { businessId, id: { in: messageIds } },
          select: { id: true, status: true, channel: true },
        })
      : [];
    const messageById = new Map(
      messages.map((message) => [message.id, message]),
    );
    const items = calls.map((call) => ({
      callId: call.id,
      caller: call.fromNumber,
      startedAt: call.startedAt.toISOString(),
      status: call.status,
      callbackRequestedAt: call.callbackRequestedAt?.toISOString() ?? null,
      resolvedAt: call.resolvedAt?.toISOString() ?? null,
      assignedToUserId: call.assignedToUserId,
      trackingSource: call.trackingNumberId ? call.attributionSource : null,
      textBack: call.textBackStatus
        ? {
            status: call.textBackStatus,
            delivery: call.textBackMessageId
              ? (messageById.get(call.textBackMessageId)?.status ?? null)
              : null,
            channel: call.textBackMessageId
              ? (messageById.get(call.textBackMessageId)?.channel ?? null)
              : null,
          }
        : null,
      callback: call.callback
        ? {
            id: call.callback.id,
            status: call.callback.status,
            attemptCount: call.callback.attemptCount,
            lastAttemptAt: call.callback.lastAttemptAt?.toISOString() ?? null,
            lastBlockReason: call.callback.lastBlockReason,
            outcome: call.callback.outcome,
            completedAt: call.callback.completedAt?.toISOString() ?? null,
            attempts: call.callback.attempts.map((attempt) => ({
              id: attempt.id,
              status: attempt.status,
              blockReasonCode: attempt.blockReasonCode,
              customerDialed: attempt.customerDialed,
              viaProvider: attempt.agentProfileId !== null,
              durationSec: attempt.durationSec,
              createdAt: attempt.createdAt.toISOString(),
            })),
          }
        : null,
    }));
    const open = items.filter((item) => !item.resolvedAt);
    const recovered = items.filter(
      (item) =>
        item.callback?.outcome === 'resolved' ||
        item.callback?.outcome === 'booked',
    );
    return {
      windowDays: WINDOW_DAYS,
      summary: {
        open: open.length,
        neverCalledBack: open.filter((item) => !item.callback?.attemptCount)
          .length,
        recovered: recovered.length,
        blockedLastTry: open.filter((item) => item.callback?.lastBlockReason)
          .length,
      },
      items,
    };
  }

  /**
   * One call-back try. Order: (optionally) record the staff-attested callback request as consent
   * → eligibility check (decision row) → lock the call-back → ring the staff member first.
   */
  async place(
    businessId: string,
    actorUserId: string,
    phoneCallId: string,
    dto: PlaceVoiceCallbackDto,
  ) {
    if ((await voiceSpendState(this.prisma, businessId)).reached) {
      throw new AppException(
        'VOICE_SPEND_CAP_REACHED',
        'This business has reached its monthly phone spending cap.',
        HttpStatus.FORBIDDEN,
      );
    }
    const call = await this.tenantPrisma.client.phoneCall.findFirst({
      where: { id: phoneCallId, businessId },
    });
    if (!call) {
      throw new AppException(
        VOICE_ERROR_CODES.CALLBACK_NOT_FOUND,
        'Call was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (call.status !== PhoneCallStatus.missed && !call.callbackRequestedAt) {
      throw this.invalid(
        'Only a missed call or a call with a requested callback can be called back here.',
      );
    }
    const parsed = parsePhoneNumberFromString(call.fromNumber);
    const callback = await this.tenantPrisma.client.voiceCallback.upsert({
      where: { phoneCallId },
      create: { businessId, phoneCallId, phoneE164: call.fromNumber },
      update: {},
    });
    if (callback.status === 'completed') {
      throw this.invalid('This call-back is already completed.');
    }

    if (!parsed?.isValid() || !parsed.country) {
      return this.blocked(
        businessId,
        actorUserId,
        callback.id,
        null,
        'phone_invalid',
      );
    }
    if (dto.callerRequestedCallback) {
      const existing =
        await this.tenantPrisma.client.voiceConsentEvidence.findFirst({
          where: {
            businessId,
            phoneE164: parsed.number,
            purpose: 'callback',
            evidenceReference: `phone_call:${call.id}`,
            revokedAt: null,
          },
          select: { id: true },
        });
      if (!existing) {
        await this.compliance.recordConsent(businessId, actorUserId, {
          phoneE164: parsed.number,
          purpose: 'callback',
          callerType: VoicePolicyCallerType.live_agent,
          source: 'missed_call',
          noticeText:
            'Staff confirmed the caller asked to be called back about this call.',
          evidenceReference: `phone_call:${call.id}`,
          legalBasis: 'caller_requested_callback',
          grantedAt: call.startedAt.toISOString(),
          evidenceReviewed: true,
        });
      }
    }
    const decision = await this.compliance.checkEligibility(
      businessId,
      actorUserId,
      {
        phoneE164: parsed.number,
        countryCode: parsed.country,
        purpose: 'callback',
        callerType: VoicePolicyCallerType.live_agent,
      },
    );
    if (!decision.allowed) {
      return this.blocked(
        businessId,
        actorUserId,
        callback.id,
        decision.id,
        decision.reasonCode,
        decision.message,
      );
    }

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
    const businessNumber =
      await this.tenantPrisma.client.phoneNumber.findUnique({
        where: { businessId },
      });
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const agentPhone = profile?.staffUser.user.phone ?? null;
    const manualReason =
      !accountSid || !authToken || !businessNumber
        ? 'provider_not_configured'
        : !profile
          ? 'no_agent_profile'
          : !agentPhone
            ? 'agent_phone_missing'
            : null;
    if (manualReason) {
      // Eligible, but Noxtill cannot place the call: staff may dial from their own phone.
      const attempt =
        await this.tenantPrisma.client.voiceCallbackAttempt.create({
          data: {
            businessId,
            callbackId: callback.id,
            agentProfileId: null,
            eligibilityDecisionId: decision.id,
            status: VoiceOutboundDialAttemptStatus.canceled,
            blockReasonCode: manualReason,
            placedByUserId: actorUserId,
            endedAt: new Date(),
          },
        });
      await this.tenantPrisma.client.voiceCallback.update({
        where: { id: callback.id },
        data: { lastBlockReason: null },
      });
      if (!call.callbackRequestedAt) {
        await this.tenantPrisma.client.phoneCall.update({
          where: { id: call.id },
          data: { callbackRequestedAt: new Date() },
        });
      }
      return {
        callbackId: callback.id,
        attemptId: attempt.id,
        eligible: true,
        placed: false,
        reasonCode: manualReason,
        decisionId: decision.id,
        manualDialNumber: parsed.number,
        message:
          manualReason === 'provider_not_configured'
            ? 'Eligibility passed. Noxtill cannot place calls on this server, so dial from your own phone.'
            : 'Eligibility passed. Add an agent profile with your phone number to have Noxtill place call-backs; for now dial from your own phone.',
      };
    }

    const agentProfile = profile!;
    const attempt = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM voice_callbacks WHERE id = ${callback.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM voice_human_agent_profiles WHERE id = ${agentProfile.id} FOR UPDATE`;
      const busy =
        (await tx.voiceCallbackAttempt.count({
          where: {
            businessId,
            OR: [
              { callbackId: callback.id },
              { agentProfileId: agentProfile.id },
            ],
            status: { in: IN_FLIGHT },
          },
        })) +
        (await tx.voiceOutboundDialAttempt.count({
          where: {
            businessId,
            agentProfileId: agentProfile.id,
            status: { in: IN_FLIGHT },
          },
        }));
      if (busy > 0) {
        throw new AppException(
          VOICE_ERROR_CODES.DIALER_AGENT_UNAVAILABLE,
          'A call-back is already in progress for this caller or for you.',
          HttpStatus.CONFLICT,
        );
      }
      await tx.voiceCallback.update({
        where: { id: callback.id },
        data: { status: 'calling', lastBlockReason: null },
      });
      return tx.voiceCallbackAttempt.create({
        data: {
          businessId,
          callbackId: callback.id,
          agentProfileId: agentProfile.id,
          eligibilityDecisionId: decision.id,
          status: VoiceOutboundDialAttemptStatus.agent_ringing,
          placedByUserId: actorUserId,
        },
      });
    });

    const backendUrl = this.config.get<string>('BACKEND_URL') ?? '';
    const q = `attemptId=${encodeURIComponent(attempt.id)}`;
    let agentCallSid: string;
    try {
      const response = await axios.post<{ sid: string }>(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
        new URLSearchParams({
          To: agentPhone!,
          From: businessNumber!.phoneNumber,
          Url: `${backendUrl}/voice/webhook/callback/agent-answered?${q}`,
          Method: 'POST',
          StatusCallback: `${backendUrl}/voice/webhook/callback/agent-status?${q}`,
          StatusCallbackMethod: 'POST',
          Timeout: String(AGENT_RING_SECONDS),
        }),
        { auth: { username: accountSid!, password: authToken! } },
      );
      agentCallSid = response.data.sid;
    } catch {
      await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.voiceCallbackAttempt.update({
          where: { id: attempt.id },
          data: {
            status: VoiceOutboundDialAttemptStatus.failed,
            blockReasonCode: 'provider_rejected',
            endedAt: new Date(),
          },
        }),
        this.tenantPrisma.client.voiceCallback.update({
          where: { id: callback.id },
          data: { status: 'open' },
        }),
      ]);
      this.logger.warn(`Call-back originate failed for attempt ${attempt.id}`);
      throw new AppException(
        VOICE_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        'The call provider rejected the call. Nothing was dialed.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    // The provider accepted the call; from here the attempt is live even if bookkeeping fails.
    await this.tenantPrisma.client.voiceCallbackAttempt.update({
      where: { id: attempt.id },
      data: { agentCallSid },
    });
    if (!call.callbackRequestedAt) {
      await this.tenantPrisma.client.phoneCall.update({
        where: { id: call.id },
        data: { callbackRequestedAt: new Date() },
      });
    }
    await this.audit.log({
      entity: 'VoiceCallback',
      entityId: callback.id,
      action: 'voice.callback.attempt_queued',
      after: {
        attemptId: attempt.id,
        decisionId: decision.id,
        phone: maskPhone(parsed.number),
      },
    });
    return {
      callbackId: callback.id,
      attemptId: attempt.id,
      eligible: true,
      placed: true,
      reasonCode: null,
      decisionId: decision.id,
      manualDialNumber: null,
      message:
        'Your phone is ringing. Answer it and the caller will be dialed.',
    };
  }

  /** Closes the call-back; also marks the original call handled. `do_not_call` suppresses the number. */
  async complete(
    businessId: string,
    actorUserId: string,
    callbackId: string,
    dto: CompleteVoiceCallbackDto,
  ) {
    const callback = await this.tenantPrisma.client.voiceCallback.findFirst({
      where: { id: callbackId, businessId },
    });
    if (!callback) {
      throw new AppException(
        VOICE_ERROR_CODES.CALLBACK_NOT_FOUND,
        'Call-back was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (callback.status === 'completed')
      throw this.invalid('This call-back is already completed.');
    if (callback.status === 'calling')
      throw this.invalid('Wait for the current call-back attempt to finish.');
    if (dto.outcome === 'do_not_call') {
      await this.compliance.addSuppression(businessId, actorUserId, {
        phoneE164: callback.phoneE164,
        purpose: null,
        source: 'callback_outcome',
        reason:
          'Caller asked not to be called again during a missed-call call-back.',
        effectiveAt: new Date().toISOString(),
      });
    }
    const now = new Date();
    await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.voiceCallback.update({
        where: { id: callbackId },
        data: {
          status: 'completed',
          outcome: dto.outcome,
          outcomeNotes: dto.notes?.trim() || null,
          completedAt: now,
          completedByUserId: actorUserId,
        },
      }),
      this.tenantPrisma.client.phoneCall.updateMany({
        where: { id: callback.phoneCallId, businessId, resolvedAt: null },
        data: { resolvedAt: now },
      }),
    ]);
    await this.audit.log({
      entity: 'VoiceCallback',
      entityId: callbackId,
      action: 'voice.callback.completed',
      after: { outcome: dto.outcome, actorUserId },
    });
    return { callbackId, status: 'completed', outcome: dto.outcome };
  }

  // ── Signed Twilio webhooks (no request tenant; resolve by attempt id) ────

  async agentAnsweredTwiml(attemptId: string): Promise<string> {
    const attempt = await this.prisma.voiceCallbackAttempt.findUnique({
      where: { id: attemptId },
      include: { callback: true },
    });
    if (
      !attempt ||
      attempt.status !== VoiceOutboundDialAttemptStatus.agent_ringing
    ) {
      return twiml(
        `${say('This call-back is no longer active. The caller was not dialed.')}<Hangup/>`,
      );
    }
    const businessNumber = await this.prisma.phoneNumber.findUnique({
      where: { businessId: attempt.businessId },
    });
    const moved = await this.prisma.voiceCallbackAttempt.updateMany({
      where: {
        id: attempt.id,
        status: VoiceOutboundDialAttemptStatus.agent_ringing,
      },
      data: businessNumber
        ? {
            status: VoiceOutboundDialAttemptStatus.customer_ringing,
            customerDialed: true,
          }
        : {
            status: VoiceOutboundDialAttemptStatus.failed,
            blockReasonCode: 'no_business_number',
            endedAt: new Date(),
          },
    });
    if (moved.count !== 1 || !businessNumber) {
      await this.reopen(attempt.callbackId);
      return twiml(`${say('The caller could not be dialed.')}<Hangup/>`);
    }
    await this.prisma.voiceCallback.update({
      where: { id: attempt.callbackId },
      data: { attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
    });
    const backendUrl = this.config.get<string>('BACKEND_URL') ?? '';
    const action = `${backendUrl}/voice/webhook/callback/customer-result?attemptId=${encodeURIComponent(attempt.id)}`;
    return twiml(
      `${say('Calling back the missed caller now.')}<Dial callerId="${escapeXml(businessNumber.phoneNumber)}" timeout="${CUSTOMER_RING_SECONDS}" answerOnBridge="true" action="${escapeXml(action)}" method="POST"><Number>${escapeXml(attempt.callback.phoneE164)}</Number></Dial>`,
    );
  }

  async customerResult(
    attemptId: string,
    dialCallStatus: string,
    durationSec?: number,
  ) {
    const attempt = await this.prisma.voiceCallbackAttempt.findUnique({
      where: { id: attemptId },
    });
    if (
      !attempt ||
      attempt.status !== VoiceOutboundDialAttemptStatus.customer_ringing
    ) {
      return twiml('<Hangup/>');
    }
    const status =
      DIAL_RESULT[dialCallStatus] ?? VoiceOutboundDialAttemptStatus.failed;
    const answered = status === VoiceOutboundDialAttemptStatus.answered;
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.voiceCallbackAttempt.update({
        where: { id: attempt.id },
        data: {
          status,
          answeredAt: answered ? now : null,
          durationSec:
            answered && Number.isFinite(durationSec) ? durationSec : null,
          endedAt: now,
        },
      }),
      this.prisma.voiceCallback.update({
        where: { id: attempt.callbackId },
        data: { status: answered ? 'connected' : 'open' },
      }),
    ]);
    return twiml('<Hangup/>');
  }

  async agentStatus(attemptId: string, callStatus: string) {
    const attempt = await this.prisma.voiceCallbackAttempt.findUnique({
      where: { id: attemptId },
    });
    if (
      !attempt ||
      attempt.status !== VoiceOutboundDialAttemptStatus.agent_ringing
    )
      return;
    if (
      !['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(
        callStatus,
      )
    )
      return;
    await this.prisma.voiceCallbackAttempt.update({
      where: { id: attempt.id },
      data: {
        status:
          callStatus === 'failed'
            ? VoiceOutboundDialAttemptStatus.failed
            : VoiceOutboundDialAttemptStatus.agent_no_answer,
        endedAt: new Date(),
      },
    });
    await this.reopen(attempt.callbackId);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async blocked(
    businessId: string,
    actorUserId: string,
    callbackId: string,
    decisionId: string | null,
    reasonCode: string,
    message?: string,
  ) {
    const attempt = await this.tenantPrisma.client.voiceCallbackAttempt.create({
      data: {
        businessId,
        callbackId,
        eligibilityDecisionId: decisionId,
        status: VoiceOutboundDialAttemptStatus.blocked,
        blockReasonCode: reasonCode,
        placedByUserId: actorUserId,
        endedAt: new Date(),
      },
    });
    await this.tenantPrisma.client.voiceCallback.update({
      where: { id: callbackId },
      data: { lastBlockReason: reasonCode },
    });
    await this.audit.log({
      entity: 'VoiceCallback',
      entityId: callbackId,
      action: 'voice.callback.eligibility_blocked',
      after: { reasonCode, decisionId, callPlaced: false },
    });
    return {
      callbackId,
      attemptId: attempt.id,
      eligible: false,
      placed: false,
      reasonCode,
      decisionId,
      manualDialNumber: null,
      message: message ?? 'This number cannot be called back.',
    };
  }

  private async reopen(callbackId: string) {
    await this.prisma.voiceCallback.updateMany({
      where: { id: callbackId, status: 'calling' },
      data: { status: 'open' },
    });
  }

  /** Releases attempts whose provider callbacks never arrived, so the call-back is not stuck. */
  private async releaseStale(businessId: string) {
    const now = Date.now();
    const stale = await this.tenantPrisma.client.voiceCallbackAttempt.findMany({
      where: {
        businessId,
        OR: [
          {
            status: VoiceOutboundDialAttemptStatus.agent_ringing,
            updatedAt: { lt: new Date(now - STALE_AGENT_RING_MS) },
          },
          {
            status: VoiceOutboundDialAttemptStatus.customer_ringing,
            updatedAt: { lt: new Date(now - STALE_CUSTOMER_LEG_MS) },
          },
        ],
      },
      select: { id: true, callbackId: true, status: true },
    });
    for (const attempt of stale) {
      await this.tenantPrisma.client.voiceCallbackAttempt.updateMany({
        where: { id: attempt.id, status: attempt.status },
        data: {
          status: VoiceOutboundDialAttemptStatus.failed,
          blockReasonCode: 'provider_callback_missing',
          endedAt: new Date(),
        },
      });
      await this.reopen(attempt.callbackId);
    }
  }

  private invalid(message: string) {
    return new AppException(
      VOICE_ERROR_CODES.CALLBACK_INVALID,
      message,
      HttpStatus.CONFLICT,
    );
  }
}
