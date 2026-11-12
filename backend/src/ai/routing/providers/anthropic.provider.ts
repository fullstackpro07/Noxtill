import axios from 'axios';
import type {
  AnthropicContentBlock,
  CreateMessageResult,
} from '../../ai-message.types';
import {
  DEFAULT_MAX_TOKENS,
  ModelProviderAdapter,
  ProviderCall,
} from './provider.types';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

interface AnthropicResponseBody {
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

function body(call: ProviderCall, stream: boolean) {
  const { params } = call;
  return {
    model: call.model,
    max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
    temperature: params.temperature ?? 0,
    system: params.system,
    messages: params.messages,
    tools: params.tools?.length ? params.tools : undefined,
    ...(stream ? { stream: true } : {}),
  };
}

function headers(apiKey: string) {
  return {
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    'content-type': 'application/json',
  };
}

/** Anthropic Messages API — the neutral message shape is already its wire format. */
export const anthropicProvider: ModelProviderAdapter = {
  async create(call): Promise<CreateMessageResult> {
    const res = await axios.post<AnthropicResponseBody>(
      API_URL,
      body(call, false),
      { headers: headers(call.apiKey), timeout: call.timeoutMs },
    );
    const u = res.data.usage;
    const cached = u.cache_read_input_tokens ?? 0;
    return {
      content: res.data.content,
      stopReason: res.data.stop_reason,
      // Anthropic reports cache reads/writes separately from `input_tokens`.
      inputTokens:
        u.input_tokens + cached + (u.cache_creation_input_tokens ?? 0),
      outputTokens: u.output_tokens,
      cachedInputTokens: cached,
    };
  },

  async stream(call): Promise<NodeJS.ReadableStream> {
    const res = await axios.post(API_URL, body(call, true), {
      headers: headers(call.apiKey),
      timeout: call.timeoutMs,
      responseType: 'stream',
    });
    return res.data as NodeJS.ReadableStream;
  },
};
