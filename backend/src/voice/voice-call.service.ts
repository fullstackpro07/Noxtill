import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { SpeechToTextService } from '../ai/speech-to-text.service';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppointmentsService } from '../bookings/appointments.service';
import { CreateWalkInAppointmentDto } from '../bookings/dto/create-walk-in-appointment.dto';
import { buildFulltextBooleanQuery } from '../common/utils/mysql-fulltext.util';
import { MissedCallService } from './missed-call.service';
import { CALL_DISCLOSURE_TEXT, MAX_CALL_TURNS } from './voice.constants';
import { escapeXml, say, twiml } from './twiml.util';
import { localParts, isAfterHours } from './voice-insights.service';
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
  VoiceRoutingRule,
} from '@prisma/client';

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
}

function recordNext(timeoutSeconds: number): string {
  return `<Record action="/api/v1/voice/webhook/recording" method="POST" maxLength="30" timeout="${timeoutSeconds}" playBeep="true" trim="trim-silence" />`;
}

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
  ) {}

  /** Twilio's inbound-call webhook. `toNumber` is the only way to know which business this is. */
  async handleIncoming(
    callSid: string,
    fromNumber: string,
    toNumber: string,
  ): Promise<string> {
    const phoneNumber = await this.prisma.phoneNumber.findUnique({
      where: { phoneNumber: toNumber },
    });
    if (!phoneNumber) {
      this.logger.warn(`Incoming call to unrecognized number ${toNumber}`);
      return twiml(
        say('Sorry, this number is not set up correctly.') + '<Hangup/>',
      );
    }

    const settings = await this.getSettings(phoneNumber.businessId);

    await this.prisma.phoneCall.create({
      data: {
        businessId: phoneNumber.businessId,
        callSid,
        fromNumber,
        status: PhoneCallStatus.in_progress,
        transcript: [],
      },
    });

    return twiml(
      say(CALL_DISCLOSURE_TEXT, settings.voiceId) +
        recordNext(settings.responseTimeoutSeconds),
    );
  }

  /** Twilio's recording-complete webhook — one full conversation turn. */
  async handleRecording(
    callSid: string,
    recordingUrl: string,
  ): Promise<string> {
    const call = await this.prisma.phoneCall.findUnique({
      where: { callSid },
    });
    if (!call) {
      this.logger.warn(`Recording callback for unknown call ${callSid}`);
      return twiml('<Hangup/>');
    }

    const [settings, business] = await Promise.all([
      this.getSettings(call.businessId),
      this.getBusiness(call.businessId),
    ]);
    const transcript = (call.transcript as unknown as CallTurn[]) ?? [];

    const { text: callerText, recordingKey } = await this.transcribeRecording(
      call.businessId,
      callSid,
      recordingUrl,
    );
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
    );
    const aiResponse = await this.classifyAndReply(
      call.businessId,
      transcript,
      settings,
      context.block,
    );
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
    if (customMatch) {
      await this.persist(callSid, transcript, PhoneCallOutcome.custom, {
        customIntentName: customMatch.name,
      });
      return twiml(say(aiResponse.reply, settings.voiceId) + '<Hangup/>');
    }

    const afterHours = isAfterHours(
      localParts(new Date(), business.timezone),
      business.workingHours,
    );
    const matchedRule = await this.evaluateRoutingRules(
      call.businessId,
      callerText,
      analysis,
      afterHours,
    );
    const effectiveIntent = matchedRule
      ? matchedRule.action === 'transfer'
        ? 'transfer'
        : 'message'
      : aiResponse.intent;

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
        );
      case 'end':
        await this.persist(callSid, transcript);
        return twiml(say(aiResponse.reply, settings.voiceId) + '<Hangup/>');
      case 'continue':
      default:
        await this.persist(callSid, transcript);
        return twiml(
          say(aiResponse.reply, settings.voiceId) +
            recordNext(settings.responseTimeoutSeconds),
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

    const missed =
      call.outcome === PhoneCallOutcome.none &&
      (callStatus === 'no-answer' ||
        callStatus === 'busy' ||
        callStatus === 'failed' ||
        callStatus === 'canceled');

    await this.prisma.phoneCall.update({
      where: { callSid },
      data: {
        status: missed
          ? PhoneCallStatus.missed
          : call.outcome === PhoneCallOutcome.transfer
            ? PhoneCallStatus.transferred
            : PhoneCallStatus.completed,
        endedAt: new Date(),
      },
    });

    if (missed) {
      await this.missedCall.notify(call);
    }
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
      await this.persist(call.callSid, transcript);
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

  private async handleTransferIntent(
    call: PhoneCall,
    transcript: CallTurn[],
    aiResponse: AiCallResponse,
    settings: ResolvedVoiceSettings,
    matchedRule: VoiceRoutingRule | null,
  ): Promise<string> {
    const transferNumber =
      matchedRule?.transferNumber ||
      settings.transferNumber ||
      this.config.get<string>('VOICE_TRANSFER_NUMBER');
    // Only a call that is really dialled through is a "transfer". With no transfer number the caller
    // is told their message has been noted, so it must be recorded as a message and reach the queue.
    await this.persist(
      call.callSid,
      transcript,
      transferNumber ? PhoneCallOutcome.transfer : PhoneCallOutcome.message,
      matchedRule
        ? { routedRuleId: matchedRule.id, routedRuleName: matchedRule.name }
        : {},
    );

    if (!transferNumber) {
      const noOneAvailable =
        "I'm not able to transfer you right now, but I've noted your message and someone will follow up.";
      return twiml(say(noOneAvailable, settings.voiceId) + '<Hangup/>');
    }
    return twiml(
      say(aiResponse.reply, settings.voiceId) +
        `<Dial>${escapeXml(transferNumber)}</Dial>`,
    );
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

    const knowledge = await this.findKnowledge(businessId, callerText);
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
  ): Promise<{
    id: string;
    title: string;
    content: string;
    kind: 'faq' | 'document';
  } | null> {
    const booleanQuery = buildFulltextBooleanQuery(text, false);
    if (!booleanQuery) return null;
    // Two separate single-column FULLTEXT indexes (title/content), scored and weighted
    // independently, same pattern as help.service.ts's retrieveHelpPassages.
    const rows = await this.prisma.$queryRaw<
      { id: string; title: string; content: string; kind: 'faq' | 'document' }[]
    >`
      SELECT id, title, content, kind,
             (MATCH(title) AGAINST(${booleanQuery} IN BOOLEAN MODE) * 2 + MATCH(content) AGAINST(${booleanQuery} IN BOOLEAN MODE)) AS score
      FROM voice_knowledge_entries
      WHERE business_id = ${businessId} AND active = true
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
  ): Promise<{ text: string; recordingKey: string }> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const response = await axios.get<ArrayBuffer>(`${recordingUrl}.mp3`, {
      responseType: 'arraybuffer',
      auth: { username: accountSid ?? '', password: authToken ?? '' },
    });
    const audio = Buffer.from(response.data);

    const recordingKey = `voice-recordings/${businessId}/${callSid}-${Date.now()}.mp3`;
    await this.s3.upload(recordingKey, audio, 'audio/mpeg');

    const text = await this.speechToText.transcribe(
      audio,
      'audio/mpeg',
      'call-recording.mp3',
    );
    return { text, recordingKey };
  }

  private async classifyAndReply(
    businessId: string,
    transcript: CallTurn[],
    settings: ResolvedVoiceSettings,
    contextBlock: string,
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

    const prompt = [
      'You are a phone receptionist for a small business, speaking live on a call. Read the conversation so far and decide what to say next.',
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
      const raw = await this.aiInfra.complete(businessId, prompt);
      const parsed = this.parseResponse(raw);
      if (parsed) return parsed;
    } catch (error) {
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
