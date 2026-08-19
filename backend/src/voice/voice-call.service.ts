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
import {
  AppointmentSource,
  PhoneCall,
  PhoneCallOutcome,
  PhoneCallStatus,
  Prisma,
} from '@prisma/client';

interface ServiceMatch {
  id: string;
  name: string;
}

interface CallTurn {
  speaker: 'caller' | 'assistant';
  text: string;
  at: string;
  /** Only present on caller turns — our own S3 copy of that turn's recording. */
  recordingKey?: string;
}

interface AiCallResponse {
  reply: string;
  intent: 'continue' | 'book' | 'message' | 'transfer' | 'end';
  service?: string;
  startsAt?: string;
  customerName?: string;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function say(text: string): string {
  return `<Say>${escapeXml(text)}</Say>`;
}

function recordNext(): string {
  return '<Record action="/api/v1/voice/webhook/recording" method="POST" maxLength="30" playBeep="true" trim="trim-silence" />';
}

function twiml(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

/**
 * Real-time call handling + outcomes (UPD-BE-057/058). Twilio drives this over two synchronous,
 * TwiML-returning webhooks per turn (not the async idempotency-queue pattern the other provider
 * webhooks use — Twilio needs live call-control XML back in the HTTP response itself, so this
 * can't be fire-and-forget): `handleIncoming` starts the call and speaks the mandatory disclosure
 * (UPD-BE-057 — not configurable out of the greeting), `handleRecording` closes each turn by
 * transcribing the caller's recording (`SpeechToTextService`, real Whisper), asking
 * `AiInfraService` to classify intent and draft a reply from ONLY that transcript, and returning
 * the next TwiML action for whatever it decided.
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

    await this.prisma.phoneCall.create({
      data: {
        businessId: phoneNumber.businessId,
        callSid,
        fromNumber,
        status: PhoneCallStatus.in_progress,
        transcript: [],
      },
    });

    return twiml(say(CALL_DISCLOSURE_TEXT) + recordNext());
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
        "I'm having trouble helping with this over the phone — let me get someone to call you back.";
      transcript.push({
        speaker: 'assistant',
        text: closing,
        at: new Date().toISOString(),
      });
      await this.persist(call.businessId, callSid, transcript);
      return twiml(say(closing) + '<Hangup/>');
    }

    const aiResponse = await this.classifyAndReply(call.businessId, transcript);
    transcript.push({
      speaker: 'assistant',
      text: aiResponse.reply,
      at: new Date().toISOString(),
    });

    switch (aiResponse.intent) {
      case 'book':
        return this.handleBookIntent(call, transcript, aiResponse);
      case 'message':
        await this.persist(
          call.businessId,
          callSid,
          transcript,
          PhoneCallOutcome.message,
        );
        return twiml(say(aiResponse.reply) + '<Hangup/>');
      case 'transfer':
        return this.handleTransferIntent(call, transcript, aiResponse);
      case 'end':
        await this.persist(call.businessId, callSid, transcript);
        return twiml(say(aiResponse.reply) + '<Hangup/>');
      case 'continue':
      default:
        await this.persist(call.businessId, callSid, transcript);
        return twiml(say(aiResponse.reply) + recordNext());
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
  ): Promise<string> {
    const service = aiResponse.service
      ? await this.findService(call.businessId, aiResponse.service)
      : null;

    if (!service || !aiResponse.startsAt) {
      // Missing/unresolvable details — keep the conversation going rather than fail silently.
      await this.persist(call.businessId, call.callSid, transcript);
      return twiml(say(aiResponse.reply) + recordNext());
    }

    // Only the create itself is allowed to fall back to "try another time" — once a real
    // appointment exists, a failure persisting the call record must not tell the caller the
    // booking didn't happen (it did), so that step is outside this try/catch.
    let appointment: Awaited<ReturnType<AppointmentsService['createWalkIn']>>;
    try {
      const dto: CreateWalkInAppointmentDto = {
        serviceId: service.id,
        startsAt: aiResponse.startsAt,
        customerName: aiResponse.customerName ?? 'Phone caller',
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
      await this.persist(call.businessId, call.callSid, transcript);
      return twiml(say(fallback) + recordNext());
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
    return twiml(say(confirmation) + '<Hangup/>');
  }

  private async handleTransferIntent(
    call: PhoneCall,
    transcript: CallTurn[],
    aiResponse: AiCallResponse,
  ): Promise<string> {
    const transferNumber = this.config.get<string>('VOICE_TRANSFER_NUMBER');
    await this.persist(
      call.businessId,
      call.callSid,
      transcript,
      PhoneCallOutcome.transfer,
    );

    if (!transferNumber) {
      const noOneAvailable =
        "I'm not able to transfer you right now, but I've noted your message and someone will follow up.";
      return twiml(say(noOneAvailable) + '<Hangup/>');
    }
    return twiml(
      say(aiResponse.reply) + `<Dial>${escapeXml(transferNumber)}</Dial>`,
    );
  }

  private async persist(
    businessId: string,
    callSid: string,
    transcript: CallTurn[],
    outcome?: PhoneCallOutcome,
  ): Promise<void> {
    await this.prisma.phoneCall.update({
      where: { callSid },
      data: {
        transcript: transcript as unknown as Prisma.InputJsonValue,
        ...(outcome ? { outcome } : {}),
      },
    });
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
  ): Promise<AiCallResponse> {
    const conversation = transcript
      .map((t) => `${t.speaker === 'caller' ? 'Caller' : 'You'}: ${t.text}`)
      .join('\n');

    const prompt = [
      'You are a phone receptionist for a small business, speaking live on a call. Read the conversation so far and decide what to say next.',
      conversation,
      'Reply with ONLY a JSON object (no other text) shaped exactly like this:',
      '{"reply": "what to say next, 1-2 short sentences", "intent": "continue" | "book" | "message" | "transfer" | "end", "service": "service name if booking, else omit", "startsAt": "ISO8601 datetime if booking, else omit", "customerName": "caller name if given, else omit"}',
      'Use "book" only once you have both a clear service and a clear date/time from the caller.',
      'Use "transfer" if the caller explicitly asks for a person, or you cannot help.',
      'Use "message" if the caller wants to leave a message rather than book anything.',
      'Use "end" once the conversation is naturally finished (goodbye, nothing more to do).',
      'Otherwise use "continue".',
    ].join('\n\n');

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

    const rows = await this.prisma.$queryRaw<ServiceMatch[]>`
      SELECT id, name FROM products
      WHERE business_id = ${businessId} AND kind = 'service'
        AND MATCH(name) AGAINST(${booleanQuery} IN BOOLEAN MODE)
      ORDER BY MATCH(name) AGAINST(${booleanQuery} IN BOOLEAN MODE) DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
}
