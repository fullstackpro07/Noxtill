import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PollyClient,
  SynthesizeSpeechCommand,
  VoiceId,
} from '@aws-sdk/client-polly';

const PREVIEW_TEXT =
  'Hi, thanks for calling — this is your AI receptionist. How can I help today?';

/**
 * Receptionist Settings depth fix — a REAL in-app voice preview, replacing the earlier "no preview
 * possible" disclosed gap. Twilio's `<Say voice="Polly.X">` names are literally Amazon Polly voice
 * IDs under the hood, so this calls Polly's own `SynthesizeSpeech` directly (same audio engine
 * Twilio uses for the real call) — not an approximation via the browser's own speech synthesis.
 * Needs `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (same disclosed-gap pattern as every other
 * external credential in this app); returns null — never a fabricated clip — when unconfigured, the
 * voice fails to synthesize, or the selected voice isn't a real Polly voice (Twilio's 3 legacy
 * non-Polly names — "alice"/"man"/"woman" — have no Polly equivalent to preview).
 */
@Injectable()
export class PollyVoiceService {
  private readonly logger = new Logger(PollyVoiceService.name);

  constructor(private readonly config: ConfigService) {}

  async synthesizePreview(voiceId: string): Promise<Buffer | null> {
    const pollyVoice = this.toPollyVoiceId(voiceId);
    if (!pollyVoice) return null;

    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
    if (!accessKeyId || !secretAccessKey) {
      this.logger.debug(
        'AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY not configured — no voice preview available',
      );
      return null;
    }

    const client = new PollyClient({
      region: this.config.get<string>('AWS_REGION') ?? 'us-east-1',
      credentials: { accessKeyId, secretAccessKey },
    });

    try {
      const result = await client.send(
        new SynthesizeSpeechCommand({
          Text: PREVIEW_TEXT,
          VoiceId: pollyVoice,
          OutputFormat: 'mp3',
          Engine: 'standard',
        }),
      );
      if (!result.AudioStream) return null;
      const chunks: Uint8Array[] = [];
      for await (const chunk of result.AudioStream as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.warn(
        `Polly synthesis failed for voice ${pollyVoice}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /** Twilio's `<Say voice="Polly.Joanna">` maps to Polly VoiceId "Joanna" — null for Twilio's 3 legacy non-Polly names (no real preview source) or any name this app doesn't offer in its own voice picker. */
  private toPollyVoiceId(twilioVoiceId: string): VoiceId | null {
    if (!twilioVoiceId.startsWith('Polly.')) return null;
    const name = twilioVoiceId.slice('Polly.'.length);
    const known: Record<string, VoiceId> = {
      Joanna: VoiceId.Joanna,
      Matthew: VoiceId.Matthew,
      Amy: VoiceId.Amy,
      Brian: VoiceId.Brian,
    };
    return known[name] ?? null;
  }
}
