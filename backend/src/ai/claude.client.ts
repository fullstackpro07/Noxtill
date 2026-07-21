import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const ANTHROPIC_API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-3-5-haiku-20241022'; // fast/cheap tier per spec §14

/**
 * Minimal Anthropic Messages API client. Standalone for now (BE-038); once
 * BE-075 (shared AI infra, BE-M12) lands, this should move behind the shared
 * service that adds per-business rate limiting, a monthly cost cap, and
 * tool-call logging — this client's call signature won't need to change.
 */
@Injectable()
export class ClaudeClient {
  private readonly logger = new Logger(ClaudeClient.name);

  constructor(private readonly config: ConfigService) {}

  async complete(prompt: string, temperature = 0): Promise<string> {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const response = await axios.post<{
      content: { type: string; text?: string }[];
    }>(
      'https://api.anthropic.com/v1/messages',
      {
        model: DEFAULT_MODEL,
        max_tokens: 512,
        temperature,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
          'content-type': 'application/json',
        },
      },
    );

    const text = response.data.content.find(
      (block) => block.type === 'text',
    )?.text;
    if (!text) {
      this.logger.warn('Claude response contained no text block');
    }
    return text ?? '';
  }
}
