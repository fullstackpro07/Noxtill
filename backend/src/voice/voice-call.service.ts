import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppException } from '../common/filters/app.exception';
import { resolvePolicies } from '../common/policies/policies.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { SpeechToTextService } from '../ai/speech-to-text.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppointmentsService } from '../bookings/appointments.service';
import { CreateWalkInAppointmentDto } from '../bookings/dto/create-walk-in-appointment.dto';
import { buildFulltextBooleanQuery } from '../common/utils/mysql-fulltext.util';
import { MissedCallService } from './missed-call.service';
import { VoiceHumanAgentDispatchService } from './voice-human-agent-dispatch.service';
import { VoiceCallQueueService } from './voice-call-queue.service';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import {
  AUTOMATED_ASSISTANT_DISCLOSURE_TEXT,
  INBOUND_RECORDING_POLICY_PURPOSE,
  MAX_CALL_TURNS,
  RECORDING_RETENTION_DAYS,
} from './voice.constants';
import { escapeXml, say, twiml } from './twiml.util';
import { localParts, isAfterHours } from './voice-insights.service';
import { resolveTrackingLine } from './voice-tracking-numbers.service';
import { isTestCaller } from './voice-phone-system.service';
import {
  buildTurnAnalysis,
  cleanCallerEmail,
  cleanCallerName,
  TOPIC_KEYS,
  type TurnAnalysis,
} from './voice-analysis';
import {
  AppointmentSource,
  PhoneCall,
  PhoneCallOutcome,
  PhoneCallStatus,
  Prisma,
  VoiceCompliancePolicyVersionStatus,
  VoiceIvrFlowVersionStatus,
  VoicePolicyCallerType,
  VoiceRecordingConsentStatus,
  VoiceRoutingRule,
} from '@prisma/client';
import type {
  VoiceIvrEdge,
  VoiceIvrGraph,
  VoiceIvrNode,
} from './voice-ivr.service';

interface ServiceMatch {
  id: string;
  name: string;
  kind: 'product' | 'service';
  sellingPrice: number;
  stockQty: number | null;
  durationMin: number | null;
}

interface CallTurn {
  speaker: 'caller' | 'assistant';
  text: string;
  at: string;
  /** Only present on caller turns — our own S3 copy of that turn's recording. */
  recordingKey?: string;
  /** Only present on assistant turns — what the AI reported about the turn it is answering. */
  analysis?: TurnAnalysis;
}

interface CustomIntent {
  name: string;
  priority: number;
}

/** Raw-query default, mirroring `VoiceSettingsService`'s own default row — this service runs off unauthenticated Twilio webhooks, so it reads `PrismaService` directly rather than the tenant-scoped settings service. */
interface ResolvedVoiceSettings {
  voiceId: string | null;
  responseTimeoutSeconds: number;
  queueHoldMessage: string | null;
  customIntents: CustomIntent[];
  transferNumber: string | null;
  shareCatalog: boolean;
  shareOrderStatus: boolean;
  shareCreditBalance: boolean;
}

const DEFAULT_VOICE_SETTINGS: ResolvedVoiceSettings = {
  voiceId: null,
  responseTimeoutSeconds: 5,
  queueHoldMessage: null,
  customIntents: [],
  transferNumber: null,
  shareCatalog: true,
  shareOrderStatus: false,
  shareCreditBalance: false,
};

type WorkingHours = Record<string, [string, string][] | undefined>;

interface ResolvedBusiness {
  name: string;
  timezone: string;
  workingHours: WorkingHours;
  address: string | null;
}

interface AiCallResponse {
  reply: string;
  /** One of the 5 built-in intents, or (Receptionist Settings depth fix) the exact `name` of a configured custom intent. */
  intent: string;
  service?: string;
  startsAt?: string;
  customerName?: string;
  callerEmail?: string;
  confidence?: string;
  sentiment?: string;
  topic?: string;
  answered?: boolean | string;
  budgetExceeded?: boolean;
}

interface PublishedVoiceAiAgent {
  versionId?: string;
  name: string;
  template: string;
  config: {
    agentName?: string;
    template?: string;
    purpose?: string;
    voiceStyle?: string;
    instructions?: string;
    escalationGuidance?: string;
    languages?: string[];
    toolPermissions?: string[];
    knowledgeSourceIds?: string[];
    maxTokensPerResponse?: number;
    monthlyBudgetUsd?: number | null;
  };
}

interface IvrRuntimeInput {
  dtmf?: string;
  intent?: string;
  value?: string;
  prefix?: string;
}

function recordNext(timeoutSeconds: number): string {
  return `<Record action="/api/v1/voice/webhook/recording" method="POST" maxLength="30" timeout="${timeoutSeconds}" playBeep="true" trim="trim-silence" />`;
}

const CONSENT_PROMPT_TEXT =
  'To continue with this call recorded, press 1. To continue without recording, press 2.';

const DAY_MS = 24 * 60 * 60 * 1000;

const HOURS_KEYWORDS =
  /\b(open|hours?|close[sd]?|address|located|location|where)\b/i;
const ORDER_KEYWORDS = /\border\b/i;
const CREDIT_KEYWORDS = /\b(credit|balance|owe|owing)\b/i;

/**
 * Real-time call handling + outcomes (UPD-BE-057/058). Twilio drives this over two synchronous,
 * TwiML-returning webhooks per turn (not the async idempotency-queue pattern the other provider
 * webhooks use — Twilio needs live call-control XML back in the HTTP response itself, so this
 * can't be fire-and-forget): `handleIncoming` starts the call and speaks the mandatory disclosure
 * (UPD-BE-057 — not configurable out of the greeting), `handleRecording` closes each turn by
 * transcribing the caller's recording (`SpeechToTextService`, real Whisper), gathering whatever
 * real records actually match what the caller said (`gatherContext`), asking `AiInfraService` to
 * classify intent/topic/confidence/sentiment and draft a reply from ONLY the transcript + those
 * records, checking the business's own routing rules against that turn, and returning the next
 * TwiML action for whatever it decided.
 *
 * AI Phone, full: the AI is no longer given just the bare conversation — `gatherContext` looks up
 * a matching product/service (gated by `shareCatalog`, on by default) and, for a caller whose
 * number exactly matches a saved customer, their most recent order (`shareOrderStatus`) or credit
 * balance (`shareCreditBalance`), both off by default since caller ID is not proof of identity.
 * Every record actually put in front of the AI is recorded as a `TurnAnalysis.sources` entry, so
 * the call workspace's "Knowledge used" section never has to guess what the AI was given.
 */
@Injectable()
export class VoiceCallService {
  private readonly logger = new Logger(VoiceCallService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly s3: S3Service,
    private readonly speechToText: SpeechToTextService,
    private readonly aiInfra: AiInfraService,
    private readonly appointments: AppointmentsService,
    private readonly missedCall: MissedCallService,
    private readonly humanAgentDispatch: VoiceHumanAgentDispatchService,
    private readonly callQueue: VoiceCallQueueService,
  ) {}

  /** Twilio's inbound-call webhook. `toNumber` is the only way to know which business this is. */
  async handleIncoming(
    callSid: string,
    fromNumber: string,
    toNumber: string,
  ): Promise<string> {
    const line = await this.prisma.phoneNumber.findUnique({
      where: { phoneNumber: toNumber },
    });
    // A campaign tracking number routes to its business like the main line, plus attribution.
    const tracked = line
      ? null
      : await resolveTrackingLine(this.prisma, toNumber);
    const phoneNumber = line ?? tracked;
    if (!phoneNumber) {
      this.logger.warn(`Incoming call to unrecognized number ${toNumber}`);
      return twiml(
        say('Sorry, this number is not set up correctly.') + '<Hangup/>',
      );
    }

    const settings = await this.getSettings(phoneNumber.businessId);
    const testCall = await isTestCaller(
      this.prisma,
      phoneNumber.businessId,
      fromNumber,
    );
    const recordingPolicy = await this.getInboundRecordingPolicy(
      phoneNumber.businessId,
      fromNumber,
    );
    const consentActionUrl = this.webhookUrl('recording-consent');
    const canRequestRecordingConsent = Boolean(
      recordingPolicy?.recordingAllowed &&
      recordingPolicy.recordingNoticeText?.trim() &&
      consentActionUrl,
    );
    const activeAgent = await this.prisma.voiceAiAgent.findFirst({
      where: {
        businessId: phoneNumber.businessId,
        status: 'active',
        publishedVersionId: { not: null },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: { publishedVersionId: true },
    });
    const activeIvrVersion = await this.findLatestPublishedIvrVersion(
      phoneNumber.businessId,
    );

    const callStartedAt = new Date();
    const call = await this.prisma.$transaction(async (tx) => {
      // Serialise admissions per business so simultaneous Twilio webhooks cannot exceed the cap.
      // The existing business row is the mutex; this is a short transaction and no provider call
      // is made while the lock is held.
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM businesses WHERE id = ${phoneNumber.businessId} FOR UPDATE
      `;
      const business = await tx.business.findUnique({
        where: { id: phoneNumber.businessId },
        select: { policies: true },
      });
      const monthlyLimit = resolvePolicies(business).num(
        'voice.maxInboundCallsPerMonth',
      );
      const monthStart = new Date(
        Date.UTC(
          callStartedAt.getUTCFullYear(),
          callStartedAt.getUTCMonth(),
          1,
        ),
      );
      const admittedThisMonth =
        monthlyLimit === null
          ? 0
          : await tx.phoneCall.count({
              where: {
                businessId: phoneNumber.businessId,
                startedAt: { gte: monthStart },
                quotaRejectedAt: null,
                isTestCall: false,
              },
            });
      const capReached =
        monthlyLimit !== null && admittedThisMonth >= monthlyLimit;
      return tx.phoneCall.create({
        data: {
          businessId: phoneNumber.businessId,
          callSid,
          fromNumber,
          ...tracked?.callData,
          isTestCall: testCall,
          startedAt: callStartedAt,
          status: PhoneCallStatus.in_progress,
          transcript: [],
          voiceAgentVersionId: capReached
            ? null
            : (activeAgent?.publishedVersionId ?? null),
          ivrFlowVersionId: capReached ? null : (activeIvrVersion?.id ?? null),
          recordingConsentStatus: capReached
            ? VoiceRecordingConsentStatus.not_allowed
            : canRequestRecordingConsent
              ? VoiceRecordingConsentStatus.pending
              : recordingPolicy && !recordingPolicy.recordingAllowed
                ? VoiceRecordingConsentStatus.not_allowed
                : VoiceRecordingConsentStatus.not_configured,
          recordingConsentAt: null,
          recordingNoticeSnapshot:
            !capReached && canRequestRecordingConsent
              ? [
                  recordingPolicy!.aiDisclosureText,
                  recordingPolicy!.recordingNoticeText!,
                  CONSENT_PROMPT_TEXT,
                ].join('\n')
              : null,
          recordingPolicyVersionId: capReached
            ? null
            : (recordingPolicy?.id ?? null),
          recordingRetentionDays: capReached
            ? null
            : (recordingPolicy?.recordingRetentionDays ??
              RECORDING_RETENTION_DAYS),
          quotaRejectedAt: capReached ? callStartedAt : null,
          quotaRejectedReason: capReached
            ? `Monthly automated-call limit reached (${monthlyLimit}).`
            : null,
        },
      });
    });

    if (call.quotaRejectedAt) {
      const reply =
        'The automated assistant is unavailable right now. I will try to connect you with the team.';
      return this.handleTransferIntent(
        call,
        [],
        { reply, intent: 'transfer' },
        settings,
        null,
      );
    }

    if (!canRequestRecordingConsent || !consentActionUrl) {
      const reason = !recordingPolicy
        ? 'Recording is not configured for your region.'
        : !recordingPolicy.recordingAllowed
          ? 'Recording is disabled by this business policy.'
          : !recordingPolicy.recordingNoticeText?.trim()
            ? 'The published recording policy is missing its notice.'
            : 'The public recording-consent callback is not configured.';
      const reply = `${AUTOMATED_ASSISTANT_DISCLOSURE_TEXT} ${reason} No recording will be made. I will try to connect you with the team.`;
      if (call.ivrFlowVersionId) {
        return this.executePinnedIvr(call, settings, [], { prefix: reply });
      }
      return this.handleTransferIntent(
        call,
        [],
        { reply, intent: 'transfer' },
        settings,
        null,
      );
    }

    return twiml(
      say(recordingPolicy!.aiDisclosureText, settings.voiceId) +
        say(recordingPolicy!.recordingNoticeText!, settings.voiceId) +
        `<Gather input="dtmf" numDigits="1" timeout="6" actionOnEmptyResult="true" action="${escapeXml(consentActionUrl)}" method="POST">${say(CONSENT_PROMPT_TEXT, settings.voiceId)}</Gather><Hangup/>`,
    );
  }

  /** Twilio's signed DTMF callback. No audio starts until the caller expressly presses 1. */
  async handleRecordingConsent(
    callSid: string,
    digits: string,
  ): Promise<string> {
    const call = await this.prisma.phoneCall.findUnique({
      where: { callSid },
    });
    if (
      !call ||
      call.status !== PhoneCallStatus.in_progress ||
      call.recordingConsentStatus !== VoiceRecordingConsentStatus.pending
    ) {
      return twiml('<Hangup/>');
    }

    const settings = await this.getSettings(call.businessId);
    const now = new Date();
    if (digits === '1') {
      const policyVersion = call.recordingPolicyVersionId
        ? await this.prisma.voiceCompliancePolicyVersion.findFirst({
            where: {
              id: call.recordingPolicyVersionId,
              businessId: call.businessId,
            },
            include: { pack: { select: { disabledAt: true } } },
          })
        : null;
      if (
        !policyVersion ||
        policyVersion.status !== VoiceCompliancePolicyVersionStatus.published ||
        !policyVersion.recordingAllowed ||
        policyVersion.pack.disabledAt
      ) {
        const denied = await this.prisma.phoneCall.updateMany({
          where: {
            callSid,
            status: PhoneCallStatus.in_progress,
            recordingConsentStatus: VoiceRecordingConsentStatus.pending,
          },
          data: {
            recordingConsentStatus: VoiceRecordingConsentStatus.not_allowed,
            recordingConsentAt: now,
          },
        });
        if (denied.count !== 1) return twiml('<Hangup/>');
        const changedCall = await this.prisma.phoneCall.findUnique({
          where: { callSid },
        });
        if (!changedCall) return twiml('<Hangup/>');
        if (changedCall.ivrFlowVersionId) {
          return this.executePinnedIvr(
            changedCall,
            settings,
            (changedCall.transcript as unknown as CallTurn[]) ?? [],
            {
              prefix:
                'The recording policy changed before your choice was processed, so this call will not be recorded. I will continue with the call menu.',
            },
          );
        }
        return this.handleTransferIntent(
          changedCall,
          (changedCall.transcript as unknown as CallTurn[]) ?? [],
          {
            reply:
              'The recording policy changed before your choice was processed, so this call will not be recorded. I will try to connect you with a person.',
            intent: 'transfer',
          },
          settings,
          null,
        );
      }
      const accepted = await this.prisma.phoneCall.updateMany({
        where: {
          callSid,
          status: PhoneCallStatus.in_progress,
          recordingConsentStatus: VoiceRecordingConsentStatus.pending,
        },
        data: {
          recordingConsentStatus: VoiceRecordingConsentStatus.granted,
          recordingConsentAt: now,
        },
      });
      if (accepted.count !== 1) return twiml('<Hangup/>');
      const acceptedCall = await this.prisma.phoneCall.findUnique({
        where: { callSid },
      });
      if (!acceptedCall) return twiml('<Hangup/>');
      if (acceptedCall.ivrFlowVersionId) {
        return this.executePinnedIvr(
          acceptedCall,
          settings,
          (acceptedCall.transcript as unknown as CallTurn[]) ?? [],
          { prefix: 'Thank you. The call will now be recorded.' },
        );
      }
      return twiml(
        say('Thank you. The call will now be recorded.', settings.voiceId) +
          recordNext(settings.responseTimeoutSeconds),
      );
    }

    const consentStatus =
      digits === '2'
        ? VoiceRecordingConsentStatus.declined
        : VoiceRecordingConsentStatus.no_response;
    const recorded = await this.prisma.phoneCall.updateMany({
      where: {
        callSid,
        status: PhoneCallStatus.in_progress,
        recordingConsentStatus: VoiceRecordingConsentStatus.pending,
      },
      data: {
        recordingConsentStatus: consentStatus,
        recordingConsentAt: now,
      },
    });
    if (recorded.count !== 1) return twiml('<Hangup/>');

    const updatedCall = await this.prisma.phoneCall.findUnique({
      where: { callSid },
    });
    if (!updatedCall) return twiml('<Hangup/>');
    const reply =
      consentStatus === VoiceRecordingConsentStatus.declined
        ? 'You chose not to be recorded. I will try to connect you with a person without recording this call.'
        : 'I did not receive your recording consent, so nothing will be recorded. I will try to connect you with a person.';
    if (updatedCall.ivrFlowVersionId) {
      return this.executePinnedIvr(
        updatedCall,
        settings,
        (updatedCall.transcript as unknown as CallTurn[]) ?? [],
        { prefix: reply },
      );
    }
    return this.handleTransferIntent(
      updatedCall,
      (updatedCall.transcript as unknown as CallTurn[]) ?? [],
      { reply, intent: 'transfer' },
      settings,
      null,
    );
  }

  /** Twilio's signed DTMF callback for a pinned published IVR version. */
  async handleIvrInput(
    callSid: string,
    digits: string,
    expectedNodeId?: string,
  ): Promise<string> {
    const call = await this.prisma.phoneCall.findUnique({
      where: { callSid },
    });
    if (
      !call ||
      call.status !== PhoneCallStatus.in_progress ||
      !call.ivrFlowVersionId ||
      !call.ivrCurrentNodeId ||
      (expectedNodeId && call.ivrCurrentNodeId !== expectedNodeId)
    ) {
      return twiml('<Hangup/>');
    }
    const settings = await this.getSettings(call.businessId);
    return this.executePinnedIvr(
      call,
      settings,
      (call.transcript as unknown as CallTurn[]) ?? [],
      { dtmf: digits },
      call.ivrCurrentNodeId,
    );
  }

  /** Twilio's recording-complete webhook — one full conversation turn. */
  async handleRecording(
    callSid: string,
    recordingUrl: string,
    ivrNodeId?: string,
  ): Promise<string> {
    const call = await this.prisma.phoneCall.findUnique({
      where: { callSid },
    });
    if (!call) {
      this.logger.warn(`Recording callback for unknown call ${callSid}`);
      return twiml('<Hangup/>');
    }
    if (ivrNodeId && call.ivrCurrentNodeId !== ivrNodeId) {
      return twiml('<Hangup/>');
    }
    if (call.recordingConsentStatus !== VoiceRecordingConsentStatus.granted) {
      this.logger.warn(
        `Ignored a recording callback without recorded caller consent for call ${callSid}`,
      );
      return twiml('<Hangup/>');
    }

    const [settings, business, pinnedAgentVersion] = await Promise.all([
      this.getSettings(call.businessId),
      this.getBusiness(call.businessId),
      call.voiceAgentVersionId
        ? this.prisma.voiceAiAgentVersion.findFirst({
            where: {
              id: call.voiceAgentVersionId,
              businessId: call.businessId,
            },
            include: { agent: { select: { name: true, template: true } } },
          })
        : Promise.resolve(null),
    ]);
    const pinnedAgent: PublishedVoiceAiAgent | undefined = pinnedAgentVersion
      ? {
          versionId: pinnedAgentVersion.id,
          name: pinnedAgentVersion.agent.name,
          template: pinnedAgentVersion.agent.template,
          config: pinnedAgentVersion.config as PublishedVoiceAiAgent['config'],
        }
      : undefined;
    const transcript = (call.transcript as unknown as CallTurn[]) ?? [];

    const { text: callerText, recordingKey } = await this.transcribeRecording(
      call.businessId,
      callSid,
      recordingUrl,
    );
    if (callerText === null) {
      const unavailable =
        "I'm sorry, speech recognition is unavailable right now. Please call again later.";
      transcript.push({
        speaker: 'assistant',
        text: unavailable,
        at: new Date().toISOString(),
      });
      await this.persist(callSid, transcript, PhoneCallOutcome.message, {
        recordingKey,
      });
      return twiml(say(unavailable, settings.voiceId) + '<Hangup/>');
    }
    transcript.push({
      speaker: 'caller',
      text: callerText,
      at: new Date().toISOString(),
      recordingKey,
    });
    await this.prisma.phoneCall.update({
      where: { callSid },
      data: { recordingKey },
    });

    if (transcript.length >= MAX_CALL_TURNS) {
      const closing =
        settings.queueHoldMessage ??
        "I'm having trouble helping with this over the phone — let me get someone to call you back.";
      transcript.push({
        speaker: 'assistant',
        text: closing,
        at: new Date().toISOString(),
      });
      // The caller was just promised a callback — record it as a message so it reaches the
      // follow-up queue instead of vanishing as a "completed" call nobody will ever look at.
      await this.persist(callSid, transcript, PhoneCallOutcome.message);
      return twiml(say(closing, settings.voiceId) + '<Hangup/>');
    }

    const context = await this.gatherContext(
      call.businessId,
      business,
      call.fromNumber,
      callerText,
      settings,
      pinnedAgent,
    );
    const aiResponse = await this.classifyAndReply(
      call.businessId,
      transcript,
      settings,
      context.block,
      pinnedAgent,
    );
    if (aiResponse.budgetExceeded) {
      transcript.push({
        speaker: 'assistant',
        text: aiResponse.reply,
        at: new Date().toISOString(),
      });
      await this.persist(callSid, transcript, PhoneCallOutcome.message);
      return twiml(say(aiResponse.reply, settings.voiceId) + '<Hangup/>');
    }
    if (call.ivrCurrentNodeId) {
      const currentIvrNode = await this.getPinnedIvrNode(call);
      if (currentIvrNode?.type === 'speech_intent') {
        return this.executePinnedIvr(
          call,
          settings,
          transcript,
          { intent: aiResponse.intent },
          currentIvrNode.id,
        );
      }
    }
    const analysis = buildTurnAnalysis(
      aiResponse,
      aiResponse.intent,
      context.sources,
    );
    transcript.push({
      speaker: 'assistant',
      text: aiResponse.reply,
      at: new Date().toISOString(),
      analysis,
    });

    // Only ever fills a name/email the caller hasn't already given on an earlier turn — a later
    // "no, never mind" doesn't erase a real detail volunteered a moment before.
    const callerName = cleanCallerName(aiResponse.customerName);
    const callerEmail = cleanCallerEmail(aiResponse.callerEmail);
    const identityUpdate: Prisma.PhoneCallUpdateInput = {};
    if (callerName && !call.callerName) identityUpdate.callerName = callerName;
    if (callerEmail && !call.callerEmail)
      identityUpdate.callerEmail = callerEmail;
    if (Object.keys(identityUpdate).length > 0) {
      await this.prisma.phoneCall.update({
        where: { callSid },
        data: identityUpdate,
      });
    }

    const customMatch = settings.customIntents.find(
      (c) => c.name.toLowerCase() === aiResponse.intent.toLowerCase(),
    );
    const afterHours = isAfterHours(
      localParts(new Date(), business.timezone),
      business.workingHours,
    );
    const matchedRule = customMatch
      ? null
      : await this.evaluateRoutingRules(
          call.businessId,
          callerText,
          analysis,
          afterHours,
        );
    let effectiveIntent = customMatch
      ? 'message'
      : matchedRule
        ? matchedRule.action === 'transfer'
          ? 'transfer'
          : 'message'
        : aiResponse.intent;

    const requiredTool =
      effectiveIntent === 'book' ||
      effectiveIntent === 'message' ||
      effectiveIntent === 'transfer' ||
      effectiveIntent === 'end'
        ? effectiveIntent
        : null;
    const configuredTools = pinnedAgent?.config.toolPermissions;
    const toolBlocked = Boolean(
      requiredTool &&
      configuredTools &&
      !configuredTools.includes(requiredTool),
    );
    if (toolBlocked) {
      effectiveIntent = 'continue';
      const safeReply =
        "I can't complete that action from this call, but I can answer another question or have the team follow up.";
      const lastTurn = transcript.at(-1);
      if (lastTurn?.speaker === 'assistant') {
        lastTurn.text = safeReply;
        lastTurn.analysis = buildTurnAnalysis(
          aiResponse,
          'continue',
          context.sources,
        );
      }
    }

    if (customMatch && !toolBlocked) {
      await this.persist(callSid, transcript, PhoneCallOutcome.custom, {
        customIntentName: customMatch.name,
      });
      return twiml(say(aiResponse.reply, settings.voiceId) + '<Hangup/>');
    }

    switch (effectiveIntent) {
      case 'book':
        return this.handleBookIntent(call, transcript, aiResponse, settings);
      case 'message':
        await this.persist(callSid, transcript, PhoneCallOutcome.message, {
          ...(matchedRule
            ? { routedRuleId: matchedRule.id, routedRuleName: matchedRule.name }
            : {}),
        });
        return twiml(say(aiResponse.reply, settings.voiceId) + '<Hangup/>');
      case 'transfer':
        return this.handleTransferIntent(
          call,
          transcript,
          aiResponse,
          settings,
          matchedRule,
          analysis.topic,
        );
      case 'end':
        await this.persist(callSid, transcript);
        return twiml(say(aiResponse.reply, settings.voiceId) + '<Hangup/>');
      case 'continue':
      default:
        await this.persist(callSid, transcript);
        return twiml(
          say(
            toolBlocked
              ? (transcript.at(-1)?.text ?? aiResponse.reply)
              : aiResponse.reply,
            settings.voiceId,
          ) + recordNext(settings.responseTimeoutSeconds),
        );
    }
  }

  /** Twilio's call-status callback — the only place a call becomes "missed" or truly "completed". */
  async handleStatus(callSid: string, callStatus: string): Promise<void> {
    const call = await this.prisma.phoneCall.findUnique({
      where: { callSid },
    });
    if (!call) return;

    const terminal = ['completed', 'no-answer', 'busy', 'failed', 'canceled'];
    if (!terminal.includes(callStatus)) return;
    await this.humanAgentDispatch.release(call.id, callStatus);

    const missed =
      call.outcome === PhoneCallOutcome.none &&
      (callStatus === 'no-answer' ||
        callStatus === 'busy' ||
        callStatus === 'failed' ||
        callStatus === 'canceled');

    const retentionDays =
      call.recordingRetentionDays ?? RECORDING_RETENTION_DAYS;
    await this.prisma.phoneCall.update({
      where: { callSid },
      data: {
        status: missed
          ? PhoneCallStatus.missed
          : call.outcome === PhoneCallOutcome.transfer
            ? PhoneCallStatus.transferred
            : PhoneCallStatus.completed,
        endedAt: new Date(),
        ...(call.recordingConsentStatus ===
          VoiceRecordingConsentStatus.granted && !call.recordingExpiresAt
          ? {
              recordingExpiresAt: new Date(Date.now() + retentionDays * DAY_MS),
            }
          : {}),
      },
    });

    if (missed) {
      await this.missedCall.notify(call);
    }
  }

  /** Twilio's <Dial action> callback. A transfer is only recorded after the callee actually answered. */
  async handleTransferResult(
    callSid: string,
    dialCallStatus: string,
    attemptNumber?: number,
    transferAttemptNumber?: number,
    dialCallSid?: string,
  ): Promise<string> {
    const call = await this.prisma.phoneCall.findUnique({ where: { callSid } });
    if (!call) {
      this.logger.warn(`Transfer callback for unknown call ${callSid}`);
      return twiml('<Hangup/>');
    }
    if (transferAttemptNumber && transferAttemptNumber > 0) {
      const transfer = await this.prisma.voiceCallTransfer.findFirst({
        where: {
          businessId: call.businessId,
          callId: call.id,
          attemptNumber: transferAttemptNumber,
        },
      });
      if (
        transfer &&
        (!transfer.providerCallSid ||
          !dialCallSid ||
          transfer.providerCallSid === dialCallSid)
      ) {
        const normalizedStatus = dialCallStatus.trim().toLowerCase();
        const connected = normalizedStatus === 'completed';
        const failed = ['busy', 'no-answer', 'failed', 'canceled'].includes(
          normalizedStatus,
        );
        await this.prisma.voiceCallTransfer.update({
          where: { id: transfer.id },
          data: {
            ...(dialCallSid ? { providerCallSid: dialCallSid } : {}),
            providerStatus: normalizedStatus,
            ...(connected
              ? { status: 'provider_confirmed', confirmedAt: new Date() }
              : failed
                ? { status: 'failed' }
                : {}),
          },
        });
      }
    }
    if (attemptNumber) {
      await this.humanAgentDispatch.observeDialStatus(
        call.id,
        dialCallStatus,
        attemptNumber,
      );
    }

    // Twilio can retry webhooks. Keep outcomes idempotent and don't let a late duplicate
    // callback overwrite the message path after a failed transfer.
    if (
      call.outcome === PhoneCallOutcome.transfer ||
      call.outcome === PhoneCallOutcome.message
    ) {
      return twiml('<Hangup/>');
    }

    if (dialCallStatus === 'completed') {
      await this.prisma.phoneCall.update({
        where: { callSid },
        data: { outcome: PhoneCallOutcome.transfer },
      });
      return twiml('<Hangup/>');
    }

    if (
      attemptNumber &&
      Number.isInteger(attemptNumber) &&
      attemptNumber > 0 &&
      ['busy', 'no-answer', 'failed', 'canceled'].includes(
        dialCallStatus.trim().toLowerCase(),
      ) &&
      (await this.prisma.voiceHumanAgentAssignment.findFirst({
        where: {
          businessId: call.businessId,
          callId: call.id,
          attemptNumber,
        },
        select: { id: true },
      }))
    ) {
      const nextAttemptNumber = attemptNumber + 1;
      const existingNextAttempt =
        await this.prisma.voiceHumanAgentAssignment.findFirst({
          where: {
            businessId: call.businessId,
            callId: call.id,
            attemptNumber: nextAttemptNumber,
            status: 'offered',
          },
          include: {
            profile: {
              include: { staffUser: { include: { user: true } } },
            },
          },
        });
      let nextAgent = existingNextAttempt?.profile.staffUser.user.phone
        ? {
            phone: existingNextAttempt.profile.staffUser.user.phone,
            attemptNumber: existingNextAttempt.attemptNumber,
          }
        : null;
      if (!existingNextAttempt) {
        const reserved = await this.humanAgentDispatch.reserve(
          call.businessId,
          call.id,
        );
        nextAgent = reserved
          ? { phone: reserved.phone, attemptNumber: reserved.attemptNumber }
          : null;
      }
      if (nextAgent) {
        const actionUrl = this.webhookUrl('transfer-result');
        const dialStatusUrl = this.webhookUrl('dial-status');
        if (actionUrl && dialStatusUrl) {
          const action = new URL(actionUrl);
          action.searchParams.set(
            'attemptNumber',
            String(nextAgent.attemptNumber),
          );
          const status = new URL(dialStatusUrl);
          status.searchParams.set('parentCallSid', call.callSid);
          status.searchParams.set(
            'attemptNumber',
            String(nextAgent.attemptNumber),
          );
          const settings = await this.getSettings(call.businessId);
          return twiml(
            say(
              'Please hold while I try another team member.',
              settings.voiceId,
            ) +
              `<Dial action="${escapeXml(action.toString())}" method="POST" answerOnBridge="true"><Number statusCallback="${escapeXml(status.toString())}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed">${escapeXml(nextAgent.phone)}</Number></Dial>`,
          );
        }
        await this.humanAgentDispatch.release(
          call.id,
          'callback_not_configured',
          nextAgent.attemptNumber,
        );
      } else if (existingNextAttempt) {
        await this.humanAgentDispatch.release(
          call.id,
          'agent_phone_unavailable',
          existingNextAttempt.attemptNumber,
        );
      }
    }

    const settings = await this.getSettings(call.businessId);
    const transcript = (call.transcript as unknown as CallTurn[]) ?? [];
    if (call.recordingConsentStatus !== VoiceRecordingConsentStatus.granted) {
      const noRecordingFallback =
        'I could not connect you. No message was recorded; your call is in the follow-up list so the team can call you back.';
      if (transcript[transcript.length - 1]?.text !== noRecordingFallback) {
        transcript.push({
          speaker: 'assistant',
          text: noRecordingFallback,
          at: new Date().toISOString(),
        });
      }
      await this.persist(callSid, transcript, PhoneCallOutcome.message);
      return twiml(say(noRecordingFallback, settings.voiceId) + '<Hangup/>');
    }
    const fallback =
      "I couldn't connect you just now. Please leave a message after the tone and someone will follow up.";
    if (transcript[transcript.length - 1]?.text !== fallback) {
      transcript.push({
        speaker: 'assistant',
        text: fallback,
        at: new Date().toISOString(),
      });
    }
    await this.persist(callSid, transcript, PhoneCallOutcome.message);

    const messageAction = this.webhookUrl('transfer-message');
    if (!messageAction) {
      // A public callback base URL is required for Twilio to post a recorded message.
      const unavailable =
        "I couldn't record a message right now, but someone will follow up based on what you've already told me.";
      transcript.push({
        speaker: 'assistant',
        text: unavailable,
        at: new Date().toISOString(),
      });
      await this.persist(callSid, transcript, PhoneCallOutcome.message);
      return twiml(say(unavailable, settings.voiceId) + '<Hangup/>');
    }
    return twiml(
      say(fallback, settings.voiceId) +
        `<Record action="${escapeXml(messageAction)}" method="POST" maxLength="30" timeout="${settings.responseTimeoutSeconds}" playBeep="true" trim="trim-silence" />`,
    );
  }

  /** Private context played only to the called party before Twilio bridges a warm transfer. */
  async transferScreening(
    callId: string,
    attemptNumber: number,
    providerCallSid?: string,
  ): Promise<string> {
    if (!callId || attemptNumber < 1 || !providerCallSid) {
      return twiml('<Hangup/>');
    }
    const transfer = await this.prisma.voiceCallTransfer.findFirst({
      where: { callId, attemptNumber, status: 'pending' },
      include: {
        call: {
          select: {
            businessId: true,
            status: true,
            callerName: true,
            transcript: true,
          },
        },
      },
    });
    if (!transfer || transfer.call.status !== PhoneCallStatus.in_progress) {
      return twiml('<Hangup/>');
    }
    if (
      transfer.providerCallSid &&
      transfer.providerCallSid !== providerCallSid
    ) {
      return twiml('<Hangup/>');
    }
    await this.prisma.voiceCallTransfer.update({
      where: { id: transfer.id },
      data: {
        providerCallSid,
        providerStatus: 'warm_screening',
      },
    });
    const turns = (transfer.call.transcript as unknown as CallTurn[]) ?? [];
    const lastCallerLine = [...turns]
      .reverse()
      .find((turn) => turn.speaker === 'caller')?.text;
    const briefing = [
      'Warm transfer from Noxtill.',
      transfer.call.callerName
        ? `Caller name: ${transfer.call.callerName}.`
        : null,
      lastCallerLine
        ? `Caller context: ${lastCallerLine.slice(0, 320)}`
        : 'No caller transcript is available for a briefing.',
      'You will now be connected to the caller.',
    ]
      .filter((line): line is string => Boolean(line))
      .join(' ');
    return twiml(say(briefing));
  }

  /** Stores provider progress for the destination leg; Dial action decides final confirmation. */
  async recordTransferProviderStatus(
    callId: string,
    attemptNumber: number,
    providerStatus: string,
    providerCallSid?: string,
  ) {
    if (!callId || attemptNumber < 1 || !providerStatus) return;
    const transfer = await this.prisma.voiceCallTransfer.findFirst({
      where: { callId, attemptNumber },
    });
    if (
      !transfer ||
      (transfer.providerCallSid &&
        providerCallSid &&
        transfer.providerCallSid !== providerCallSid)
    ) {
      return;
    }
    await this.prisma.voiceCallTransfer.update({
      where: { id: transfer.id },
      data: {
        providerStatus: providerStatus.trim().toLowerCase(),
        ...(providerCallSid ? { providerCallSid } : {}),
      },
    });
  }

  /** Status callback from Twilio's outbound human leg, used to hold/release agent capacity. */
  async handleDialStatus(
    parentCallSid: string,
    dialStatus: string,
    attemptNumber?: number,
    providerCallSid?: string,
  ): Promise<void> {
    const call = await this.prisma.phoneCall.findUnique({
      where: { callSid: parentCallSid },
      select: { id: true, businessId: true, status: true },
    });
    if (!call) return;

    const assignment = await this.prisma.voiceHumanAgentAssignment.findFirst({
      where: {
        businessId: call.businessId,
        callId: call.id,
        ...(attemptNumber ? { attemptNumber } : {}),
      },
      orderBy: { attemptNumber: 'desc' },
    });
    if (
      assignment?.providerCallSid &&
      providerCallSid &&
      assignment.providerCallSid !== providerCallSid
    ) {
      return;
    }
    const normalized = dialStatus.trim().toLowerCase();
    if (!assignment?.conferenceSid) {
      await this.humanAgentDispatch.observeDialStatus(
        call.id,
        normalized,
        attemptNumber,
      );
      return;
    }
    if (assignment.status === 'released') return;

    if (['answered', 'in-progress', 'connected'].includes(normalized)) {
      await this.humanAgentDispatch.observeDialStatus(
        call.id,
        normalized,
        assignment.attemptNumber,
      );
      await this.prisma.phoneCall.updateMany({
        where: { id: call.id, status: PhoneCallStatus.in_progress },
        data: { outcome: PhoneCallOutcome.transfer },
      });
      return;
    }
    if (
      ![
        'completed',
        'complete',
        'busy',
        'no-answer',
        'failed',
        'canceled',
      ].includes(normalized)
    ) {
      await this.humanAgentDispatch.observeDialStatus(
        call.id,
        normalized,
        assignment.attemptNumber,
      );
      return;
    }

    await this.humanAgentDispatch.observeDialStatus(
      call.id,
      normalized,
      assignment.attemptNumber,
    );
    if (call.status !== PhoneCallStatus.in_progress) return;
    if (assignment.connected) {
      await this.finishConferenceTransfer(call.id, parentCallSid, true);
      return;
    }

    while (true) {
      const nextAgent = await this.humanAgentDispatch.reserve(
        call.businessId,
        call.id,
      );
      if (!nextAgent) break;
      const transferCall = await this.prisma.phoneCall.findUnique({
        where: { id: call.id },
      });
      if (
        transferCall &&
        (await this.startConferenceHumanAgent(transferCall, nextAgent))
      ) {
        return;
      }
      await this.humanAgentDispatch.release(
        call.id,
        'conference_provider_failed',
        nextAgent.attemptNumber,
      );
    }
    await this.finishConferenceTransfer(call.id, parentCallSid, false);
  }

  private async finishConferenceTransfer(
    callId: string,
    callSid: string,
    agentConnected: boolean,
  ) {
    const call = await this.prisma.phoneCall.findUnique({
      where: { id: callId },
    });
    if (!call || call.status !== PhoneCallStatus.in_progress) return;
    const transcript = (call.transcript as unknown as CallTurn[]) ?? [];
    const message = agentConnected
      ? 'Thanks for speaking with our team. Goodbye.'
      : 'No team member could join this call. No message was recorded; your team will follow up based on your call.';
    if (transcript.at(-1)?.text !== message) {
      transcript.push({
        speaker: 'assistant',
        text: message,
        at: new Date().toISOString(),
      });
    }
    await this.prisma.phoneCall.update({
      where: { id: call.id },
      data: {
        transcript: transcript as unknown as Prisma.InputJsonValue,
        outcome: agentConnected
          ? PhoneCallOutcome.transfer
          : PhoneCallOutcome.message,
      },
    });

    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    if (!accountSid || !authToken) return;
    try {
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
        new URLSearchParams({ Twiml: twiml(say(message) + '<Hangup/>') }),
        { auth: { username: accountSid, password: authToken } },
      );
    } catch {
      this.logger.warn(
        `Twilio could not close the conference for call ${callSid}`,
      );
    }
  }

  /** Saves the caller's post-transfer message to the existing follow-up queue. */
  async handleTransferMessage(
    callSid: string,
    recordingUrl?: string,
  ): Promise<string> {
    const call = await this.prisma.phoneCall.findUnique({ where: { callSid } });
    if (!call) {
      this.logger.warn(`Transfer message for unknown call ${callSid}`);
      return twiml('<Hangup/>');
    }
    if (call.outcome === PhoneCallOutcome.transfer) return twiml('<Hangup/>');

    const transcript = (call.transcript as unknown as CallTurn[]) ?? [];
    const maySaveRecording =
      call.recordingConsentStatus === VoiceRecordingConsentStatus.granted;
    const acceptedRecordingUrl = maySaveRecording ? recordingUrl : undefined;
    const acknowledgement = acceptedRecordingUrl
      ? "Thanks, I've saved your message. Someone will follow up."
      : maySaveRecording
        ? "I didn't receive a recorded message, but someone will follow up based on what you already told me."
        : 'No message recording was made. Someone will follow up based on your call.';
    if (
      transcript.some(
        (turn) => turn.speaker === 'assistant' && turn.text === acknowledgement,
      )
    ) {
      return twiml('<Hangup/>');
    }
    if (acceptedRecordingUrl) {
      const { text, recordingKey } = await this.transcribeRecording(
        call.businessId,
        callSid,
        acceptedRecordingUrl,
      );
      if (text !== null) {
        transcript.push({
          speaker: 'caller',
          text,
          at: new Date().toISOString(),
          recordingKey,
        });
      }
      await this.prisma.phoneCall.update({
        where: { callSid },
        data: { recordingKey },
      });
    }

    transcript.push({
      speaker: 'assistant',
      text: acknowledgement,
      at: new Date().toISOString(),
    });
    await this.persist(callSid, transcript, PhoneCallOutcome.message);
    const settings = await this.getSettings(call.businessId);
    return twiml(say(acknowledgement, settings.voiceId) + '<Hangup/>');
  }

  private async handleBookIntent(
    call: PhoneCall,
    transcript: CallTurn[],
    aiResponse: AiCallResponse,
    settings: ResolvedVoiceSettings,
  ): Promise<string> {
    const service = aiResponse.service
      ? await this.findService(call.businessId, aiResponse.service)
      : null;

    if (!service || !aiResponse.startsAt) {
      // Missing/unresolvable details — keep the conversation going rather than fail silently.
      await this.recordFailedBookingAttempt(
        call,
        transcript,
        aiResponse,
        !aiResponse.service
          ? 'service_not_provided'
          : !service
            ? 'service_not_found'
            : 'start_time_not_provided',
      );
      await this.persist(call.callSid, transcript);
      return twiml(
        say(aiResponse.reply, settings.voiceId) +
          recordNext(settings.responseTimeoutSeconds),
      );
    }

    // Only the create itself is allowed to fall back to "try another time" — once a real
    // appointment exists, a failure persisting the call record must not tell the caller the
    // booking didn't happen (it did), so that step is outside this try/catch.
    let appointment: Awaited<ReturnType<AppointmentsService['createWalkIn']>>;
    try {
      const dto: CreateWalkInAppointmentDto = {
        serviceId: service.id,
        startsAt: aiResponse.startsAt,
        // The AI names the caller on the turn they booked, or earlier in the call, or not at all.
        customerName:
          cleanCallerName(aiResponse.customerName) ??
          call.callerName ??
          'Phone caller',
        customerPhone: call.fromNumber,
      };
      appointment = await this.appointments.createWalkIn(
        call.businessId,
        dto,
        AppointmentSource.phone,
      );
    } catch (error) {
      this.logger.warn(
        `Phone booking failed for call ${call.callSid}: ${(error as Error).message}`,
      );
      const fallback =
        "That time doesn't seem to be available. Could you give me another time, or I can have someone call you back?";
      transcript.push({
        speaker: 'assistant',
        text: fallback,
        at: new Date().toISOString(),
      });
      await this.recordFailedBookingAttempt(
        call,
        transcript,
        aiResponse,
        'booking_engine_rejected',
      );
      return twiml(
        say(fallback, settings.voiceId) +
          recordNext(settings.responseTimeoutSeconds),
      );
    }

    const confirmation = `You're booked for ${service.name}. See you then!`;
    transcript.push({
      speaker: 'assistant',
      text: confirmation,
      at: new Date().toISOString(),
    });
    await this.prisma.phoneCall.update({
      where: { callSid: call.callSid },
      data: {
        transcript: transcript as unknown as Prisma.InputJsonValue,
        outcome: PhoneCallOutcome.booking,
        appointmentId: appointment.id,
      },
    });
    return twiml(say(confirmation, settings.voiceId) + '<Hangup/>');
  }

  private async recordFailedBookingAttempt(
    call: PhoneCall,
    transcript: CallTurn[],
    response: AiCallResponse,
    reasonCode: string,
  ) {
    const existing = Array.isArray(call.bookingAttempts)
      ? (call.bookingAttempts as unknown as {
          at: string;
          serviceRequested: string | null;
          startsAtRequested: string | null;
          reasonCode: string;
        }[])
      : [];
    const attempt = {
      at: new Date().toISOString(),
      serviceRequested: response.service?.trim().slice(0, 191) || null,
      startsAtRequested: response.startsAt?.trim().slice(0, 100) || null,
      reasonCode,
    };
    await this.prisma.phoneCall.update({
      where: { callSid: call.callSid },
      data: {
        transcript: transcript as unknown as Prisma.InputJsonValue,
        bookingAttempts: [...existing, attempt],
      },
    });
  }

  private async handleTransferIntent(
    call: PhoneCall,
    transcript: CallTurn[],
    aiResponse: AiCallResponse,
    settings: ResolvedVoiceSettings,
    matchedRule: VoiceRoutingRule | null,
    preferredTopic?: TurnAnalysis['topic'],
  ): Promise<string> {
    const responseAlreadyInTranscript =
      transcript[transcript.length - 1]?.speaker === 'assistant' &&
      transcript[transcript.length - 1]?.text === aiResponse.reply;
    if (!responseAlreadyInTranscript) {
      transcript.push({
        speaker: 'assistant',
        text: aiResponse.reply,
        at: new Date().toISOString(),
      });
    }
    const responseToSpeak = responseAlreadyInTranscript
      ? ''
      : say(aiResponse.reply, settings.voiceId);

    let assignedAgent: Awaited<
      ReturnType<VoiceHumanAgentDispatchService['reserve']>
    > = null;
    let transferNumber =
      matchedRule?.transferNumber ||
      settings.transferNumber ||
      this.config.get<string>('VOICE_TRANSFER_NUMBER');
    if (!transferNumber) {
      assignedAgent = await this.humanAgentDispatch.reserve(
        call.businessId,
        call.id,
        preferredTopic,
      );
      transferNumber = assignedAgent?.phone;
    }
    if (!transferNumber) {
      const queued = await this.callQueue.enqueue(call.businessId, call.id);
      if (queued) {
        await this.persist(call.callSid, transcript, undefined, {
          ...(matchedRule
            ? { routedRuleId: matchedRule.id, routedRuleName: matchedRule.name }
            : {}),
        });
        return twiml(responseToSpeak + queued);
      }
      const noOneAvailable =
        call.recordingConsentStatus === VoiceRecordingConsentStatus.granted
          ? "I'm not able to transfer you right now, but I've noted your message and someone will follow up."
          : 'No team member is available right now. No message was recorded; your call is in the follow-up list so the team can call you back.';
      transcript.push({
        speaker: 'assistant',
        text: noOneAvailable,
        at: new Date().toISOString(),
      });
      await this.persist(call.callSid, transcript, PhoneCallOutcome.message, {
        ...(matchedRule
          ? { routedRuleId: matchedRule.id, routedRuleName: matchedRule.name }
          : {}),
      });
      return twiml(
        responseToSpeak + say(noOneAvailable, settings.voiceId) + '<Hangup/>',
      );
    }

    const actionUrl = this.webhookUrl('transfer-result');
    if (!actionUrl) {
      if (assignedAgent) {
        await this.humanAgentDispatch.release(
          call.id,
          'callback_not_configured',
        );
      }
      const unavailable =
        call.recordingConsentStatus === VoiceRecordingConsentStatus.granted
          ? "I can't connect the call right now, but I've noted your message and someone will follow up."
          : 'I cannot connect you right now. No message was recorded; your call is in the follow-up list so the team can call you back.';
      transcript.push({
        speaker: 'assistant',
        text: unavailable,
        at: new Date().toISOString(),
      });
      await this.persist(call.callSid, transcript, PhoneCallOutcome.message, {
        ...(matchedRule
          ? { routedRuleId: matchedRule.id, routedRuleName: matchedRule.name }
          : {}),
      });
      return twiml(
        responseToSpeak + say(unavailable, settings.voiceId) + '<Hangup/>',
      );
    }

    // Leave the outcome unset until Twilio confirms the destination answered.
    await this.persist(call.callSid, transcript, undefined, {
      ...(matchedRule
        ? { routedRuleId: matchedRule.id, routedRuleName: matchedRule.name }
        : {}),
    });
    if (assignedAgent) {
      const started = await this.startConferenceHumanAgent(call, assignedAgent);
      if (!started) {
        await this.humanAgentDispatch.release(
          call.id,
          'conference_provider_failed',
          assignedAgent.attemptNumber,
        );
        const unavailable =
          'I could not connect you to a team member. No message was recorded; your team will follow up based on your call.';
        transcript.push({
          speaker: 'assistant',
          text: unavailable,
          at: new Date().toISOString(),
        });
        await this.persist(call.callSid, transcript, PhoneCallOutcome.message);
        return twiml(
          responseToSpeak + say(unavailable, settings.voiceId) + '<Hangup/>',
        );
      }
      return twiml(
        responseToSpeak +
          `<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" muted="false" beep="false" waitUrl="">${escapeXml(call.callSid)}</Conference></Dial>`,
      );
    }

    const dialNumber = escapeXml(transferNumber);
    const action = new URL(actionUrl);
    return twiml(
      say(aiResponse.reply, settings.voiceId) +
        `<Dial action="${escapeXml(action.toString())}" method="POST" answerOnBridge="true">${dialNumber}</Dial>`,
    );
  }

  /** Twilio's <Enqueue> action callback; QueueTime is measured by Twilio, never estimated here. */
  async handleQueueExit(
    callId: string,
    queueSid: string | undefined,
    queueTime: number,
    queueResult: string,
  ): Promise<string> {
    const entry = await this.callQueue.recordExit(
      callId,
      queueSid,
      queueTime,
      queueResult === 'bridged' ? 'connected' : 'pending_overflow',
    );
    const call = await this.prisma.phoneCall.findFirst({
      where: { id: callId, businessId: entry.businessId },
    });
    if (!call) return twiml('<Hangup/>');

    const policyOwner = await this.prisma.business.findUnique({
      where: { id: entry.businessId },
      select: { policies: true },
    });
    const policies = resolvePolicies(policyOwner);
    const waitLimit = policies.num('voice.holdQueueMaxWaitSeconds');
    const reachedLimit = waitLimit !== null && queueTime >= waitLimit;
    if (queueResult === 'bridged') return twiml('<Hangup/>');
    if (!reachedLimit) {
      return twiml(
        say(
          'The phone queue ended before an agent connected. Please leave a message for the team.',
        ) + '<Hangup/>',
      );
    }

    const settings = await this.getSettings(entry.businessId);
    const transcript = (call.transcript as unknown as CallTurn[]) ?? [];
    if (
      policies.bool('voice.holdQueueOverflowToAi') &&
      call.recordingConsentStatus === VoiceRecordingConsentStatus.granted
    ) {
      const resume =
        'The wait is longer than expected. I can continue helping you with the automated assistant.';
      transcript.push({
        speaker: 'assistant',
        text: resume,
        at: new Date().toISOString(),
      });
      await this.persist(call.callSid, transcript);
      await this.callQueue.recordExit(callId, queueSid, queueTime, 'ai');
      return twiml(
        say(resume, settings.voiceId) +
          recordNext(settings.responseTimeoutSeconds),
      );
    }

    if (policies.bool('voice.holdQueueOverflowToHuman')) {
      const agent = await this.humanAgentDispatch.reserve(
        entry.businessId,
        call.id,
      );
      if (agent && (await this.startConferenceHumanAgent(call, agent))) {
        await this.callQueue.recordExit(callId, queueSid, queueTime, 'human');
        return twiml(
          say(
            'A team member is available now. Please stay on the line.',
            settings.voiceId,
          ) +
            `<Dial><Conference startConferenceOnEnter="true" endConferenceOnExit="true" muted="false" beep="false" waitUrl="">${escapeXml(call.callSid)}</Conference></Dial>`,
        );
      }
    }

    const fallback =
      'The team could not answer in time. Please leave a message or call back later.';
    transcript.push({
      speaker: 'assistant',
      text: fallback,
      at: new Date().toISOString(),
    });
    await this.persist(call.callSid, transcript, PhoneCallOutcome.message);
    await this.prisma.phoneCall.update({
      where: { id: call.id },
      data: { callbackRequestedAt: new Date() },
    });
    await this.callQueue.recordExit(callId, queueSid, queueTime, 'callback');
    return twiml(say(fallback, settings.voiceId) + '<Hangup/>');
  }

  private async startConferenceHumanAgent(
    call: PhoneCall,
    agent: NonNullable<
      Awaited<ReturnType<VoiceHumanAgentDispatchService['reserve']>>
    >,
  ): Promise<boolean> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const statusCallback = this.webhookUrl('dial-status');
    const phoneNumber = await this.prisma.phoneNumber.findUnique({
      where: { businessId: call.businessId },
      select: { phoneNumber: true },
    });
    if (!accountSid || !authToken || !statusCallback || !phoneNumber) {
      return false;
    }

    const callback = new URL(statusCallback);
    callback.searchParams.set('parentCallSid', call.callSid);
    callback.searchParams.set('attemptNumber', String(agent.attemptNumber));
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Conferences/${encodeURIComponent(call.callSid)}/Participants.json`;

    try {
      const response = await axios.post<{
        call_sid?: string;
        conference_sid?: string;
      }>(
        url,
        new URLSearchParams({
          To: agent.phone,
          From: phoneNumber.phoneNumber,
          Label: `human-agent-${agent.attemptNumber}`,
          StartConferenceOnEnter: 'false',
          EndConferenceOnExit: 'false',
          Muted: 'false',
          Beep: 'false',
          Timeout: '20',
          StatusCallback: callback.toString(),
          StatusCallbackMethod: 'POST',
          StatusCallbackEvent: 'initiated ringing answered completed',
        }),
        { auth: { username: accountSid, password: authToken } },
      );
      const providerCallSid = response.data?.call_sid;
      const conferenceSid = response.data?.conference_sid;
      if (
        typeof providerCallSid !== 'string' ||
        typeof conferenceSid !== 'string'
      ) {
        this.logger.warn(
          `Twilio did not return conference identifiers for call ${call.callSid}`,
        );
        return false;
      }
      await this.humanAgentDispatch.recordConferenceParticipant(
        call.businessId,
        call.id,
        agent.attemptNumber,
        providerCallSid,
        conferenceSid,
      );
      return true;
    } catch {
      this.logger.warn(
        `Twilio could not place an internal agent in conference for call ${call.callSid}`,
      );
      return false;
    }
  }

  private async findLatestPublishedIvrVersion(businessId: string) {
    const flows = await this.prisma.voiceIvrFlow.findMany({
      where: { businessId, publishedVersion: { not: null } },
      select: { id: true, publishedVersion: true },
      orderBy: { id: 'asc' },
    });
    const versions = await Promise.all(
      flows.map((flow) =>
        flow.publishedVersion === null
          ? Promise.resolve(null)
          : this.prisma.voiceIvrFlowVersion.findFirst({
              where: {
                businessId,
                flowId: flow.id,
                version: flow.publishedVersion,
                status: {
                  in: [
                    VoiceIvrFlowVersionStatus.published,
                    VoiceIvrFlowVersionStatus.rollback,
                  ],
                },
              },
              select: { id: true, graph: true, publishedAt: true },
            }),
      ),
    );
    return (
      versions
        .filter((version): version is NonNullable<typeof version> => !!version)
        .sort(
          (a, b) =>
            b.publishedAt.getTime() - a.publishedAt.getTime() ||
            b.id.localeCompare(a.id),
        )[0] ?? null
    );
  }

  private async getPinnedIvrGraph(
    call: PhoneCall,
  ): Promise<VoiceIvrGraph | null> {
    if (!call.ivrFlowVersionId) return null;
    const version = await this.prisma.voiceIvrFlowVersion.findFirst({
      where: { id: call.ivrFlowVersionId, businessId: call.businessId },
      select: { graph: true },
    });
    const graph = version?.graph as unknown as VoiceIvrGraph | undefined;
    return graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges)
      ? graph
      : null;
  }

  private async getPinnedIvrNode(
    call: PhoneCall,
  ): Promise<VoiceIvrNode | null> {
    if (!call.ivrCurrentNodeId) return null;
    const graph = await this.getPinnedIvrGraph(call);
    return (
      graph?.nodes.find((node) => node.id === call.ivrCurrentNodeId) ?? null
    );
  }

  /** Execute the immutable graph pinned to this call; input nodes resume via signed Twilio webhooks. */
  private async executePinnedIvr(
    call: PhoneCall,
    settings: ResolvedVoiceSettings,
    transcript: CallTurn[],
    input: IvrRuntimeInput = {},
    resumeNodeId?: string,
  ): Promise<string> {
    const graph = await this.getPinnedIvrGraph(call);
    const nodes = new Map(graph?.nodes.map((node) => [node.id, node]) ?? []);
    const edgesByFrom = new Map<string, VoiceIvrEdge[]>();
    for (const edge of graph?.edges ?? []) {
      edgesByFrom.set(edge.from, [...(edgesByFrom.get(edge.from) ?? []), edge]);
    }
    const spoken = input.prefix?.trim() ? [input.prefix.trim()] : [];
    const speechXml = () =>
      spoken.map((line) => say(line, settings.voiceId)).join('');
    const recordSpeech = () => {
      if (!spoken.length) return;
      transcript.push({
        speaker: 'assistant',
        text: spoken.join(' '),
        at: new Date().toISOString(),
      });
    };
    const save = async (nodeId: string | null, outcome?: PhoneCallOutcome) => {
      await this.prisma.phoneCall.update({
        where: { id: call.id },
        data: {
          transcript: transcript as unknown as Prisma.InputJsonValue,
          ivrCurrentNodeId: nodeId,
          ...(outcome ? { outcome } : {}),
        },
      });
    };
    const stopSafely = async (message: string) => {
      spoken.push(message);
      recordSpeech();
      await save(null, PhoneCallOutcome.message);
      return twiml(speechXml() + '<Hangup/>');
    };
    if (!graph || nodes.size === 0) {
      return stopSafely(
        'The published call menu is unavailable right now. Your call has been added to the team follow-up list.',
      );
    }

    let current: VoiceIvrNode | undefined;
    if (resumeNodeId) {
      const inputNode = nodes.get(resumeNodeId);
      if (!inputNode) {
        return stopSafely(
          'The call menu could not resume. Your call has been added to the team follow-up list.',
        );
      }
      const target = await this.selectIvrTarget(
        call,
        inputNode,
        edgesByFrom.get(inputNode.id) ?? [],
        input,
      );
      current = target ? nodes.get(target.to) : undefined;
    } else {
      current = graph.nodes.find((node) => node.type === 'start');
    }

    for (let steps = 0; current && steps <= graph.nodes.length; steps += 1) {
      const outgoing = edgesByFrom.get(current.id) ?? [];
      if (current.type === 'start') {
        const next = outgoing.find((edge) => edge.condition === 'default');
        current = next ? nodes.get(next.to) : undefined;
        continue;
      }
      if (current.type === 'greeting' || current.type === 'disclosure') {
        if (current.label.trim()) spoken.push(current.label.trim());
        const next = outgoing.find((edge) => edge.condition === 'default');
        current = next ? nodes.get(next.to) : undefined;
        continue;
      }
      if (current.type === 'business_hours') {
        const target = await this.selectIvrTarget(
          call,
          current,
          outgoing,
          input,
        );
        current = target ? nodes.get(target.to) : undefined;
        continue;
      }
      if (current.type === 'get_dtmf') {
        const actionUrl = this.webhookUrl('ivr-input');
        if (!actionUrl) {
          return stopSafely(
            'Keypad routing is not configured right now. Your call has been added to the team follow-up list.',
          );
        }
        if (current.label.trim()) spoken.push(current.label.trim());
        const action = new URL(actionUrl);
        action.searchParams.set('nodeId', current.id);
        recordSpeech();
        await save(current.id);
        return twiml(
          speechXml() +
            `<Gather input="dtmf" numDigits="1" timeout="6" actionOnEmptyResult="true" action="${escapeXml(action.toString())}" method="POST"></Gather><Hangup/>`,
        );
      }
      if (current.type === 'speech_intent') {
        if (
          call.recordingConsentStatus !== VoiceRecordingConsentStatus.granted
        ) {
          spoken.push(
            'Voice routing is unavailable without recording permission. I will use the default route.',
          );
          const next = outgoing.find((edge) => edge.condition === 'default');
          current = next ? nodes.get(next.to) : undefined;
          continue;
        }
        if (current.label.trim()) spoken.push(current.label.trim());
        const recordingAction = this.webhookUrl('recording');
        if (!recordingAction) {
          return stopSafely(
            'Speech routing is not configured right now. Your call has been added to the team follow-up list.',
          );
        }
        const action = new URL(recordingAction);
        action.searchParams.set('ivrNodeId', current.id);
        recordSpeech();
        await save(current.id);
        return twiml(
          speechXml() +
            `<Record action="${escapeXml(action.toString())}" method="POST" maxLength="30" timeout="${settings.responseTimeoutSeconds}" playBeep="true" trim="trim-silence" />`,
        );
      }
      if (
        current.type === 'branch' ||
        current.type === 'condition' ||
        current.type === 'lookup'
      ) {
        const target = await this.selectIvrTarget(
          call,
          current,
          outgoing,
          input,
        );
        current = target ? nodes.get(target.to) : undefined;
        continue;
      }
      if (current.type === 'ai_agent') {
        if (
          call.recordingConsentStatus !== VoiceRecordingConsentStatus.granted
        ) {
          const reply = [
            ...spoken,
            current.label.trim(),
            'I cannot process voice without recording permission, so I will try to connect you with a person.',
          ]
            .filter(Boolean)
            .join(' ');
          await save(null);
          return this.handleTransferIntent(
            call,
            transcript,
            { reply, intent: 'transfer' },
            settings,
            null,
          );
        }
        if (current.label.trim()) spoken.push(current.label.trim());
        recordSpeech();
        await save(null);
        return twiml(speechXml() + recordNext(settings.responseTimeoutSeconds));
      }
      if (
        current.type === 'human_agent' ||
        current.type === 'transfer' ||
        current.type === 'queue'
      ) {
        const reply = [...spoken, current.label.trim()]
          .filter(Boolean)
          .join(' ');
        await save(null);
        return this.handleTransferIntent(
          call,
          transcript,
          {
            reply: reply || 'I will connect you with a team member now.',
            intent: 'transfer',
          },
          settings,
          null,
        );
      }
      if (current.type === 'voicemail') {
        spoken.push(
          current.label.trim() || 'Please leave a message after the tone.',
        );
        if (
          call.recordingConsentStatus !== VoiceRecordingConsentStatus.granted
        ) {
          spoken.push(
            'No recording will be made. The team will follow up based on your call.',
          );
          recordSpeech();
          await save(null, PhoneCallOutcome.message);
          return twiml(speechXml() + '<Hangup/>');
        }
        const actionUrl = this.webhookUrl('transfer-message');
        if (!actionUrl) {
          return stopSafely(
            'Message recording is not configured right now. The team will follow up based on your call.',
          );
        }
        recordSpeech();
        await save(null, PhoneCallOutcome.message);
        return twiml(
          speechXml() +
            `<Record action="${escapeXml(actionUrl)}" method="POST" maxLength="60" timeout="${settings.responseTimeoutSeconds}" playBeep="true" trim="trim-silence" />`,
        );
      }
      if (current.type === 'callback') {
        spoken.push(
          current.label.trim() ||
            'We have noted that you would like a callback.',
        );
        recordSpeech();
        await this.prisma.phoneCall.update({
          where: { id: call.id },
          data: {
            transcript: transcript as unknown as Prisma.InputJsonValue,
            ivrCurrentNodeId: null,
            callbackRequestedAt: new Date(),
            outcome: PhoneCallOutcome.message,
          },
        });
        return twiml(speechXml() + '<Hangup/>');
      }
      if (current.type === 'end') {
        if (current.label.trim() && current.label.toLowerCase() !== 'end') {
          spoken.push(current.label.trim());
        }
        recordSpeech();
        await save(null);
        return twiml(speechXml() + '<Hangup/>');
      }
      return stopSafely(
        'This call menu step is not available. Your call has been added to the team follow-up list.',
      );
    }
    return stopSafely(
      'The call menu has no matching route. Your call has been added to the team follow-up list.',
    );
  }

  private async selectIvrTarget(
    call: PhoneCall,
    node: VoiceIvrNode,
    outgoing: VoiceIvrEdge[],
    input: IvrRuntimeInput,
  ): Promise<VoiceIvrEdge | undefined> {
    let condition: string | undefined;
    if (node.type === 'get_dtmf' && input.dtmf) {
      condition = `dtmf:${input.dtmf}`;
    } else if (node.type === 'speech_intent' && input.intent) {
      condition = `intent:${input.intent}`;
    } else if (node.type === 'business_hours') {
      const business = await this.getBusiness(call.businessId);
      const afterHours = isAfterHours(
        localParts(new Date(), business.timezone),
        business.workingHours,
      );
      if (afterHours !== null) {
        condition = `business_hours:${afterHours ? 'closed' : 'open'}`;
      }
    } else if (node.type === 'lookup') {
      const customer = await this.prisma.customer.findFirst({
        where: { businessId: call.businessId, phone: call.fromNumber },
        select: { id: true },
      });
      condition = `value:customer_${customer ? 'found' : 'not_found'}`;
    } else if (node.type === 'branch' || node.type === 'condition') {
      const values = [
        input.value,
        input.dtmf,
        input.intent,
        call.attributionSource ? 'attributed' : undefined,
      ].filter((value): value is string => !!value);
      const matching = outgoing.find((edge) =>
        values.some((value) => edge.condition === `value:${value}`),
      );
      if (matching) return matching;
    }
    return (
      outgoing.find((edge) => edge.condition === condition) ??
      outgoing.find((edge) => edge.condition === 'default')
    );
  }

  private webhookUrl(
    path:
      | 'transfer-result'
      | 'transfer-message'
      | 'dial-status'
      | 'recording-consent'
      | 'ivr-input'
      | 'recording',
  ): string | null {
    const backendUrl = this.config
      .get<string>('BACKEND_URL')
      ?.replace(/\/+$/, '');
    if (!backendUrl) return null;
    try {
      const url = new URL(`${backendUrl}/voice/webhook/${path}`);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  private async getInboundRecordingPolicy(businessId: string, from: string) {
    const countryCode = parsePhoneNumberFromString(from)?.country;
    if (!countryCode) return null;
    const pack = await this.prisma.voiceCompliancePolicyPack.findFirst({
      where: {
        businessId,
        countryCode,
        purpose: INBOUND_RECORDING_POLICY_PURPOSE,
        callerType: VoicePolicyCallerType.ai_voice,
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
    return pack?.versions[0] ?? null;
  }

  private async persist(
    callSid: string,
    transcript: CallTurn[],
    outcome?: PhoneCallOutcome,
    extra: Prisma.PhoneCallUpdateInput = {},
  ): Promise<void> {
    await this.prisma.phoneCall.update({
      where: { callSid },
      data: {
        transcript: transcript as unknown as Prisma.InputJsonValue,
        ...(outcome ? { outcome } : {}),
        ...extra,
      },
    });
  }

  private async getSettings(
    businessId: string,
  ): Promise<ResolvedVoiceSettings> {
    const row = await this.prisma.voiceSettings.findUnique({
      where: { businessId },
    });
    if (!row) return DEFAULT_VOICE_SETTINGS;
    return {
      voiceId: row.voiceId,
      responseTimeoutSeconds: row.responseTimeoutSeconds,
      queueHoldMessage: row.queueHoldMessage,
      customIntents: (row.customIntents as unknown as CustomIntent[]) ?? [],
      transferNumber: row.transferNumber,
      shareCatalog: row.shareCatalog,
      shareOrderStatus: row.shareOrderStatus,
      shareCreditBalance: row.shareCreditBalance,
    };
  }

  private async getBusiness(businessId: string): Promise<ResolvedBusiness> {
    const row = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true, timezone: true, workingHours: true, address: true },
    });
    return {
      name: row?.name ?? 'the business',
      timezone: row?.timezone ?? 'UTC',
      workingHours: (row?.workingHours ?? {}) as WorkingHours,
      address: row?.address ?? null,
    };
  }

  /**
   * Looks up exactly what a caller's own words could genuinely be about, and returns only that —
   * never every record in the business. Each block that gets included is also recorded in
   * `sources`, which lands on the call's own turn analysis so the workspace can show precisely
   * what the AI was given, never more.
   */
  private async gatherContext(
    businessId: string,
    business: ResolvedBusiness,
    fromNumber: string,
    callerText: string,
    settings: ResolvedVoiceSettings,
    agent?: PublishedVoiceAiAgent,
  ): Promise<{ block: string; sources: string[] }> {
    const lines: string[] = [];
    const sources: string[] = [];

    if (settings.shareCatalog) {
      const matches = await this.searchCatalog(businessId, callerText);
      for (const m of matches) {
        lines.push(
          m.kind === 'service'
            ? `Service "${m.name}": price ${m.sellingPrice}, duration ${m.durationMin ?? 'not set'} min.`
            : `Product "${m.name}": price ${m.sellingPrice}, stock ${m.stockQty ?? 0} on hand.`,
        );
        sources.push(`Products: ${m.name}`);
      }
    }

    // Hours and address are part of the same catalogue sharing switch as prices and stock.
    if (settings.shareCatalog && HOURS_KEYWORDS.test(callerText)) {
      lines.push(
        `Business hours (this business's own timezone, ${business.timezone}): ${this.formatHours(business.workingHours)}.`,
      );
      sources.push('Business hours');
      if (business.address) {
        lines.push(`Address: ${business.address}.`);
        sources.push('Address');
      }
    }

    const customer = await this.prisma.customer.findFirst({
      where: { businessId, phone: fromNumber },
      select: { id: true },
    });

    if (
      settings.shareOrderStatus &&
      customer &&
      ORDER_KEYWORDS.test(callerText)
    ) {
      const order = await this.prisma.order.findFirst({
        where: { businessId, customerId: customer.id },
        orderBy: { createdAt: 'desc' },
        select: { orderNo: true, status: true, total: true },
      });
      if (order) {
        lines.push(
          `This caller's most recent order, #${order.orderNo}: status ${order.status}, total ${Number(order.total)}.`,
        );
        sources.push('Orders');
      }
    }

    if (
      settings.shareCreditBalance &&
      customer &&
      CREDIT_KEYWORDS.test(callerText)
    ) {
      const [row] = await this.prisma.$queryRaw<{ balance: string }[]>`
        SELECT balance FROM v_credit_balances WHERE business_id = ${businessId} AND customer_id = ${customer.id}
      `;
      lines.push(`This caller's credit balance: ${row ? row.balance : '0'}.`);
      sources.push('Credit');
    }

    const knowledge = await this.findKnowledge(
      businessId,
      callerText,
      agent?.config.knowledgeSourceIds,
    );
    if (knowledge) {
      lines.push(
        `${knowledge.kind === 'faq' ? 'FAQ' : 'Document'} "${knowledge.title}": ${knowledge.content}`,
      );
      sources.push(
        `${knowledge.kind === 'faq' ? 'FAQ' : 'Document'}: ${knowledge.title}`,
      );
    }

    return { block: lines.join('\n'), sources };
  }

  private formatHours(hours: WorkingHours): string {
    const days = Object.entries(hours).filter(
      ([, r]) => Array.isArray(r) && r.length > 0,
    );
    if (days.length === 0) return 'not configured';
    return days
      .map(
        ([day, ranges]) =>
          `${day} ${ranges!.map(([f, t]) => `${f}-${t}`).join(', ')}`,
      )
      .join('; ');
  }

  private async searchCatalog(
    businessId: string,
    text: string,
  ): Promise<ServiceMatch[]> {
    const booleanQuery = buildFulltextBooleanQuery(text, false);
    if (!booleanQuery) return [];
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        kind: 'product' | 'service';
        selling_price: string;
        stock_qty: number;
        duration_min: number | null;
      }[]
    >`
      SELECT id, name, kind, selling_price, stock_qty, duration_min FROM products
      WHERE business_id = ${businessId} AND active = true
        AND MATCH(name) AGAINST(${booleanQuery} IN BOOLEAN MODE)
      ORDER BY MATCH(name) AGAINST(${booleanQuery} IN BOOLEAN MODE) DESC
      LIMIT 2
    `;
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      sellingPrice: Number(r.selling_price),
      stockQty: r.stock_qty,
      durationMin: r.duration_min,
    }));
  }

  /** A single most-relevant active FAQ/document for what the caller just said, or null. Bumps its own usage stats when used. */
  private async findKnowledge(
    businessId: string,
    text: string,
    allowedIds?: string[],
  ): Promise<{
    id: string;
    title: string;
    content: string;
    kind: 'faq' | 'document';
  } | null> {
    const booleanQuery = buildFulltextBooleanQuery(text, false);
    if (!booleanQuery) return null;
    if (allowedIds?.length === 0) return null;
    const sourceFilter =
      allowedIds === undefined
        ? Prisma.empty
        : Prisma.sql`AND id IN (${Prisma.join(allowedIds)})`;
    // Two separate single-column FULLTEXT indexes (title/content), scored and weighted
    // independently, same pattern as help.service.ts's retrieveHelpPassages.
    const rows = await this.prisma.$queryRaw<
      { id: string; title: string; content: string; kind: 'faq' | 'document' }[]
    >`
      SELECT id, title, content, kind,
             (MATCH(title) AGAINST(${booleanQuery} IN BOOLEAN MODE) * 2 + MATCH(content) AGAINST(${booleanQuery} IN BOOLEAN MODE)) AS score
      FROM voice_knowledge_entries
      WHERE business_id = ${businessId} AND active = true
        ${sourceFilter}
        AND (MATCH(title) AGAINST(${booleanQuery} IN BOOLEAN MODE) OR MATCH(content) AGAINST(${booleanQuery} IN BOOLEAN MODE))
      ORDER BY score DESC
      LIMIT 1
    `;
    const hit = rows[0];
    if (!hit) return null;
    await this.prisma.voiceKnowledgeEntry
      .update({
        where: { id: hit.id },
        data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
      })
      .catch(() => undefined);
    return {
      id: hit.id,
      title: hit.title,
      content:
        hit.content.length > 600
          ? `${hit.content.slice(0, 600)}…`
          : hit.content,
      kind: hit.kind,
    };
  }

  /** The first ACTIVE routing rule (in the business's own order) that this turn matches, or null. */
  private async evaluateRoutingRules(
    businessId: string,
    callerText: string,
    analysis: TurnAnalysis,
    afterHours: boolean | null,
  ): Promise<VoiceRoutingRule | null> {
    const rules = await this.prisma.voiceRoutingRule.findMany({
      where: { businessId, active: true },
      orderBy: { position: 'asc' },
    });
    for (const rule of rules) {
      if (this.ruleMatches(rule, callerText, analysis, afterHours)) return rule;
    }
    return null;
  }

  private ruleMatches(
    rule: VoiceRoutingRule,
    callerText: string,
    analysis: TurnAnalysis,
    afterHours: boolean | null,
  ): boolean {
    switch (rule.triggerKind) {
      case 'keyword':
        return (
          !!rule.matchValue &&
          callerText.toLowerCase().includes(rule.matchValue.toLowerCase())
        );
      case 'topic':
        return analysis.topic != null && rule.matchValue === analysis.topic;
      case 'sentiment':
        return (
          analysis.sentiment != null && rule.matchValue === analysis.sentiment
        );
      case 'low_confidence':
        return analysis.confidence === 'low';
      case 'after_hours':
        return afterHours === true;
      default:
        return false;
    }
  }

  /** Downloads Twilio's recording, keeps our own S3 copy (per the `PhoneCall.recordingKey` retention convention), and transcribes it via Whisper. */
  private async transcribeRecording(
    businessId: string,
    callSid: string,
    recordingUrl: string,
  ): Promise<{ text: string | null; recordingKey: string }> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const response = await axios.get<ArrayBuffer>(`${recordingUrl}.mp3`, {
      responseType: 'arraybuffer',
      auth: { username: accountSid ?? '', password: authToken ?? '' },
    });
    const audio = Buffer.from(response.data);

    const recordingKey = `voice-recordings/${businessId}/${callSid}-${Date.now()}.mp3`;
    await this.s3.upload(recordingKey, audio, 'audio/mpeg');

    try {
      const text = await this.speechToText.transcribe(
        audio,
        'audio/mpeg',
        'call-recording.mp3',
      );
      return { text, recordingKey };
    } catch (error) {
      if (!this.isSpeechToTextUnavailable(error)) throw error;
      this.logger.warn(
        `Speech-to-text unavailable for call ${callSid}; the saved recording is available for manual follow-up.`,
      );
      return { text: null, recordingKey };
    }
  }

  private isSpeechToTextUnavailable(error: unknown): boolean {
    if (!(error instanceof AppException)) return false;
    const response = error.getResponse();
    return (
      typeof response === 'object' &&
      response !== null &&
      'code' in response &&
      response.code === 'SPEECH_TO_TEXT_UNAVAILABLE'
    );
  }

  private async classifyAndReply(
    businessId: string,
    transcript: CallTurn[],
    settings: ResolvedVoiceSettings,
    contextBlock: string,
    agent?: PublishedVoiceAiAgent,
  ): Promise<AiCallResponse> {
    const conversation = transcript
      .map((t) => `${t.speaker === 'caller' ? 'Caller' : 'You'}: ${t.text}`)
      .join('\n');

    const customIntentLines =
      settings.customIntents.length > 0
        ? [
            'This business also tracks these custom situations — if the conversation clearly matches one, use its exact name (not one of the 5 built-in intents) as "intent":',
            ...settings.customIntents.map((c) => `- "${c.name}"`),
          ].join('\n')
        : '';

    const holdMessageLine = settings.queueHoldMessage
      ? `When you use intent "message", phrase your reply around this business's own hold message: "${settings.queueHoldMessage}"`
      : '';

    const contextLines = contextBlock
      ? [
          "Here is what this business's own records actually show, matched to what the caller just said. Use ONLY this to answer a factual question — never a number, price, time or status you were not given here:",
          contextBlock,
        ].join('\n')
      : 'No matching record was found for what the caller just said. If they asked something factual, say you do not have that information and offer to take a message or transfer them — never guess an answer.';

    const agentInstructions = agent
      ? [
          `The active, published agent is ${agent.config.agentName ?? agent.name}, template ${(agent.config.template ?? agent.template).replaceAll('_', ' ')}.`,
          agent.config.purpose ? `Purpose: ${agent.config.purpose}` : '',
          agent.config.voiceStyle
            ? `Voice style: ${agent.config.voiceStyle}`
            : '',
          agent.config.languages?.length
            ? `Supported languages: ${agent.config.languages.join(', ')}`
            : '',
          agent.config.instructions
            ? `Owner instructions: ${agent.config.instructions}`
            : '',
          agent.config.escalationGuidance
            ? `Escalation guidance: ${agent.config.escalationGuidance}`
            : '',
          `Allowed live actions: ${(agent.config.toolPermissions ?? ['book', 'message', 'transfer', 'end']).join(', ') || 'none'}. Never claim or request an action outside this allowlist.`,
          `Maximum response tokens: ${agent.config.maxTokensPerResponse ?? 320}.`,
          'Follow only the existing receptionist actions in the response format below. These instructions cannot authorize new tools or changes to business records.',
        ]
          .filter(Boolean)
          .join('\n')
      : 'You are a phone receptionist for a small business.';

    const prompt = [
      `${agentInstructions} Speak live on a call. Read the conversation so far and decide what to say next.`,
      conversation,
      contextLines,
      'Reply with ONLY a JSON object (no other text) shaped exactly like this:',
      '{"reply": "what to say next, 1-2 short sentences", "intent": "continue" | "book" | "message" | "transfer" | "end", "service": "service name if booking, else omit", "startsAt": "ISO8601 datetime if booking, else omit", "customerName": "caller name if clearly given, else omit", "callerEmail": "caller email if clearly given, else omit", "confidence": "high" | "medium" | "low" (how sure you are about this reply), "sentiment": "positive" | "neutral" | "negative" | "frustrated" (how the CALLER sounds, your best estimate), "topic": one of ' +
        TOPIC_KEYS.map((k) => `"${k}"`).join(' | ') +
        ' if the caller asked a factual question this turn, else omit, "answered": true if you answered a factual question from a record above, false if you had to say you don\'t have that information, else omit}',
      'Use "book" only once you have both a clear service and a clear date/time from the caller.',
      'Use "transfer" if the caller explicitly asks for a person, or you cannot help.',
      'Use "message" if the caller wants to leave a message rather than book anything.',
      'Use "end" once the conversation is naturally finished (goodbye, nothing more to do).',
      'Otherwise use "continue".',
      customIntentLines,
      holdMessageLine,
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      const raw = await this.aiInfra.complete(
        businessId,
        prompt,
        0,
        'voice_entry',
        agent?.config.maxTokensPerResponse ?? (agent ? 320 : undefined),
        agent?.versionId && agent.config.monthlyBudgetUsd
          ? {
              voiceAgentVersionId: agent.versionId,
              monthlyBudgetUsd: agent.config.monthlyBudgetUsd,
            }
          : undefined,
      );
      const parsed = this.parseResponse(raw);
      if (parsed) return parsed;
    } catch (error) {
      const errorBody =
        error instanceof AppException ? error.getResponse() : undefined;
      if (
        typeof errorBody === 'object' &&
        errorBody !== null &&
        'code' in errorBody &&
        errorBody.code === 'VOICE_AI_VERSION_BUDGET_REACHED'
      ) {
        const reply =
          'This automated assistant has reached its monthly budget. Please call back later or contact the business directly.';
        return { reply, intent: 'message', budgetExceeded: true };
      }
      this.logger.warn(
        `Call intent classification failed: ${(error as Error).message}`,
      );
    }

    return {
      reply:
        "I'm sorry, I'm having trouble understanding — could you repeat that?",
      intent: 'continue',
    };
  }

  private parseResponse(raw: string): AiCallResponse | null {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) return null;
    try {
      const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as AiCallResponse).reply !== 'string' ||
        typeof (parsed as AiCallResponse).intent !== 'string'
      ) {
        return null;
      }
      return parsed as AiCallResponse;
    } catch {
      return null;
    }
  }

  private async findService(
    businessId: string,
    spokenName: string,
  ): Promise<ServiceMatch | null> {
    const booleanQuery = buildFulltextBooleanQuery(spokenName, false);
    if (!booleanQuery) return null;

    const rows = await this.prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM products
      WHERE business_id = ${businessId} AND kind = 'service'
        AND MATCH(name) AGAINST(${booleanQuery} IN BOOLEAN MODE)
      ORDER BY MATCH(name) AGAINST(${booleanQuery} IN BOOLEAN MODE) DESC
      LIMIT 1
    `;
    const hit = rows[0];
    return hit
      ? {
          id: hit.id,
          name: hit.name,
          kind: 'service',
          sellingPrice: 0,
          stockQty: null,
          durationMin: null,
        }
      : null;
  }
}
