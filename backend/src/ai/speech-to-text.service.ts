import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppException } from '../common/filters/app.exception';

interface WhisperTranscriptionResponse {
  text: string;
}

/**
 * Real speech-to-text via OpenAI's Whisper endpoint (Voice-entry Sale, UPD-BE-008 — and later the
 * AI Phone Receptionist, UPD-BE-057, which is why this lives in the shared `ai/` module rather
 * than inside `orders/`). Claude's own Messages API has no audio-input support (confirmed: no
 * multimodal audio plumbing anywhere in `ClaudeClient`), so transcription is a genuinely separate
 * real call, upstream of `AiInfraService.complete()` doing the structured parsing on the resulting
 * text. Needs `OPENAI_API_KEY` — same disclosed-placeholder pattern as every other external
 * credential in this app when unconfigured.
 */
@Injectable()
export class SpeechToTextService {
  private readonly logger = new Logger(SpeechToTextService.name);

  constructor(private readonly config: ConfigService) {}

  async transcribe(
    audioBuffer: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<string> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new AppException(
        'SPEECH_TO_TEXT_UNAVAILABLE',
        'Voice transcription is not available right now — please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(audioBuffer)], { type: mimeType }),
      filename,
    );
    form.append('model', 'whisper-1');

    try {
      const response = await axios.post<WhisperTranscriptionResponse>(
        'https://api.openai.com/v1/audio/transcriptions',
        form,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      return response.data.text;
    } catch (error) {
      this.logger.warn(
        `Whisper transcription failed: ${(error as Error).message}`,
      );
      throw new AppException(
        'SPEECH_TO_TEXT_UNAVAILABLE',
        'Voice transcription is not available right now — please try again later.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
