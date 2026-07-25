import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

const ANTHROPIC_API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-3-5-haiku-20241022'; // fast/cheap tier per spec §14
const DEFAULT_MAX_TOKENS = 1024;

export interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface CreateMessageParams {
  system?: string;
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  temperature?: number;
  maxTokens?: number;
}

export interface CreateMessageResult {
  content: AnthropicContentBlock[];
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

interface AnthropicResponseBody {
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * Anthropic Messages API client. `complete` is the original single-prompt
 * primitive (BE-038) kept for backward compatibility; `createMessage` is the
 * full primitive (system prompt, conversation history, tools) that the
 * shared AI infra (BE-075) and the tool-calling assistant (BE-074) build on.
 * `streamMessage` is the same call with `stream: true`, returning the raw
 * SSE byte stream for the assistant's final turn to pipe through to the client.
 */
@Injectable()
export class ClaudeClient {
  private readonly logger = new Logger(ClaudeClient.name);

  constructor(private readonly config: ConfigService) {}

  private apiKey(): string {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    return apiKey;
  }

  async complete(prompt: string, temperature = 0): Promise<string> {
    const result = await this.createMessage({
      messages: [{ role: 'user', content: prompt }],
      temperature,
    });
    const text = result.content.find((block) => block.type === 'text')?.text;
    if (!text) {
      this.logger.warn('Claude response contained no text block');
    }
    return text ?? '';
  }

  async createMessage(
    params: CreateMessageParams,
  ): Promise<CreateMessageResult> {
    const response = await axios.post<AnthropicResponseBody>(
      'https://api.anthropic.com/v1/messages',
      {
        model: DEFAULT_MODEL,
        max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: params.temperature ?? 0,
        system: params.system,
        messages: params.messages,
        tools: params.tools,
      },
      {
        headers: {
          'x-api-key': this.apiKey(),
          'anthropic-version': ANTHROPIC_API_VERSION,
          'content-type': 'application/json',
        },
      },
    );

    return {
      content: response.data.content,
      stopReason: response.data.stop_reason,
      inputTokens: response.data.usage.input_tokens,
      outputTokens: response.data.usage.output_tokens,
    };
  }

  /** Same call as createMessage but with `stream: true` — resolves to the raw SSE byte stream. */
  async streamMessage(
    params: CreateMessageParams,
  ): Promise<NodeJS.ReadableStream> {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: DEFAULT_MODEL,
        max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: params.temperature ?? 0,
        system: params.system,
        messages: params.messages,
        tools: params.tools,
        stream: true,
      },
      {
        headers: {
          'x-api-key': this.apiKey(),
          'anthropic-version': ANTHROPIC_API_VERSION,
          'content-type': 'application/json',
        },
        responseType: 'stream',
      },
    );
    return response.data as NodeJS.ReadableStream;
  }
}
