/** Twilio Media Streams and OpenAI Realtime GA protocol helpers. */
export const VOICE_MEDIA_PATH = '/api/v1/voice/webhook/media-stream';

export function decodeVoiceSocketMessage(
  raw: Buffer | ArrayBuffer | Buffer[],
): string {
  return (
    Array.isArray(raw)
      ? Buffer.concat(raw)
      : Buffer.isBuffer(raw)
        ? raw
        : Buffer.from(raw)
  ).toString('utf8');
}

export function realtimeSessionUpdate(
  instructions: string,
  maxTokens: number,
  tools: unknown[],
  voice = 'marin',
) {
  return {
    type: 'session.update',
    session: {
      type: 'realtime',
      output_modalities: ['audio'],
      instructions,
      max_output_tokens: maxTokens,
      tools,
      tool_choice: 'auto',
      audio: {
        input: {
          format: { type: 'audio/pcmu' },
          transcription: { model: 'gpt-4o-mini-transcribe' },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: false,
            interrupt_response: true,
          },
        },
        output: { format: { type: 'audio/pcmu' }, voice },
      },
    },
  };
}

export class VoicePlaybackTracker {
  itemId: string | null = null;
  private startedAt = 0;
  private sentMs = 0;

  audio(itemId: string, payload: string, mediaTimestamp: number) {
    if (this.itemId !== itemId) {
      this.itemId = itemId;
      this.startedAt = mediaTimestamp;
      this.sentMs = 0;
    }
    this.sentMs += Buffer.from(payload, 'base64').length / 8;
  }

  interrupt(mediaTimestamp: number) {
    if (!this.itemId) return null;
    const event = {
      type: 'conversation.item.truncate',
      item_id: this.itemId,
      content_index: 0,
      audio_end_ms: Math.max(
        0,
        Math.floor(Math.min(this.sentMs, mediaTimestamp - this.startedAt)),
      ),
    };
    this.itemId = null;
    return event;
  }

  complete(itemId: string) {
    if (this.itemId === itemId) this.itemId = null;
  }
}

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  input_token_details?: {
    audio_tokens?: number;
    text_tokens?: number;
    cached_tokens?: number;
  };
  output_token_details?: { audio_tokens?: number; text_tokens?: number };
};

/** Conservative list-price estimate; cached inputs are charged as uncached in this estimate.
 * Source: https://developers.openai.com/api/docs/models/gpt-realtime (2026-10-20).
 * An unsupported model remains unpriced instead of inheriting another model's tariff.
 */
export function realtimeCostEstimate(
  model: string,
  usage: Usage,
): number | null {
  if (model !== 'gpt-realtime') return null;
  const i = usage.input_token_details;
  const o = usage.output_token_details;
  if (
    !i ||
    !o ||
    !Number.isFinite(i.audio_tokens) ||
    !Number.isFinite(i.text_tokens) ||
    !Number.isFinite(o.audio_tokens) ||
    !Number.isFinite(o.text_tokens)
  )
    return null;
  return (
    (i.audio_tokens! * 32 +
      i.text_tokens! * 4 +
      o.audio_tokens! * 64 +
      o.text_tokens! * 16) /
    1_000_000
  );
}
