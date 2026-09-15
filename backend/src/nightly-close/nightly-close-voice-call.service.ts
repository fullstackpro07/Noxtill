import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { say, twiml } from '../voice/twiml.util';

/** The 3 friendly names the settings screen offers map to real Twilio `<Say voice="Polly.X">`
 * identifiers — the same 4 Polly voices `PollyVoiceService` already knows how to preview, so the
 * call sounds exactly like what the in-app voice picker previews. */
const VOICE_ID_TO_TWILIO_VOICE: Record<string, string> = {
  warm_female: 'Polly.Joanna',
  calm_male: 'Polly.Matthew',
  energetic_neutral: 'Polly.Amy',
};

/**
 * Nightly Close voice note fix-it — a real outbound Twilio Voice call that reads the close aloud,
 * using the account's existing `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER` (the
 * same credentials `SmsService`/`TelephonyService` already use — no separate TTS vendor to
 * configure). The call's TwiML is passed inline via the `Twiml` param on `POST .../Calls.json`,
 * so no public webhook is needed to serve it. This replaces the "voiceNoteEnabled` saves a
 * preference but nothing is ever wired to it" gap `NightlyCloseService` previously disclosed —
 * best-effort only: a failed/unconfigured call never blocks or fails the real WhatsApp/SMS/email
 * send, which is the send `composeAndSend` is actually scored on.
 */
@Injectable()
export class NightlyCloseVoiceCallService {
  private readonly logger = new Logger(NightlyCloseVoiceCallService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('TWILIO_ACCOUNT_SID') &&
        this.config.get<string>('TWILIO_AUTH_TOKEN') &&
        this.config.get<string>('TWILIO_FROM_NUMBER'),
    );
  }

  /** Best-effort: returns whether the call was placed, never throws — a voice-call failure must
   * never fail the real close delivery it accompanies. */
  async callWithSummary(
    toPhone: string,
    spokenText: string,
    voiceId: string | null,
  ): Promise<{ placed: boolean; error?: string }> {
    const accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    const fromNumber = this.config.get<string>('TWILIO_FROM_NUMBER');
    if (!accountSid || !authToken || !fromNumber) {
      this.logger.debug(
        'TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER not configured — voice note call skipped',
      );
      return { placed: false, error: 'Voice calling is not configured yet' };
    }

    const twilioVoice = voiceId ? VOICE_ID_TO_TWILIO_VOICE[voiceId] : undefined;
    const twimlBody = twiml(say(spokenText, twilioVoice));

    try {
      const response = await axios.post<{ sid: string }>(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
        new URLSearchParams({ To: toPhone, From: fromNumber, Twiml: twimlBody }),
        { auth: { username: accountSid, password: authToken } },
      );
      this.logger.debug(`Nightly Close voice call placed, sid=${response.data.sid}`);
      return { placed: true };
    } catch (error) {
      const message = (error as Error).message;
      this.logger.warn(`Nightly Close voice call failed: ${message}`);
      return { placed: false, error: message };
    }
  }
}
