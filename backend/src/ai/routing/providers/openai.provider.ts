import axios from 'axios';
import type {
  AnthropicContentBlock,
  AnthropicMessage,
  CreateMessageParams,
  CreateMessageResult,
} from '../../ai-message.types';
import {
  DEFAULT_MAX_TOKENS,
  ModelProviderAdapter,
  ProviderCall,
} from './provider.types';

const API_URL = 'https://api.openai.com/v1/chat/completions';

type OpenAiPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file'; file: { filename: string; file_data: string } };

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type OpenAiMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | OpenAiPart[] }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: OpenAiToolCall[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

interface OpenAiResponse {
  choices: {
    message: { content: string | null; tool_calls?: OpenAiToolCall[] };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

function dataUri(block: AnthropicContentBlock): string {
  return `data:${block.source!.media_type};base64,${block.source!.data}`;
}

function toUserParts(blocks: AnthropicContentBlock[]): OpenAiPart[] {
  const parts: OpenAiPart[] = [];
  for (const b of blocks) {
    if (b.type === 'text' && b.text) parts.push({ type: 'text', text: b.text });
    else if (b.type === 'image' && b.source)
      parts.push({ type: 'image_url', image_url: { url: dataUri(b) } });
    else if (b.type === 'document' && b.source)
      parts.push({
        type: 'file',
        file: { filename: 'document.pdf', file_data: dataUri(b) },
      });
  }
  return parts;
}

/** Neutral (Anthropic-shaped) conversation → Chat Completions messages. */
export function toOpenAiMessages(params: CreateMessageParams): OpenAiMessage[] {
  const out: OpenAiMessage[] = [];
  if (params.system) out.push({ role: 'system', content: params.system });
  for (const m of params.messages) out.push(...convertMessage(m));
  return out;
}

function convertMessage(m: AnthropicMessage): OpenAiMessage[] {
  if (typeof m.content === 'string')
    return [{ role: m.role, content: m.content }];
  if (m.role === 'assistant') {
    const text = m.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('');
    const calls = m.content
      .filter((b) => b.type === 'tool_use')
      .map<OpenAiToolCall>((b) => ({
        id: b.id!,
        type: 'function',
        function: { name: b.name!, arguments: JSON.stringify(b.input ?? {}) },
      }));
    return [
      {
        role: 'assistant',
        content: text || null,
        ...(calls.length ? { tool_calls: calls } : {}),
      },
    ];
  }
  // User turn: tool results become `tool` messages (they must directly follow the call).
  const out: OpenAiMessage[] = m.content
    .filter((b) => b.type === 'tool_result')
    .map((b) => ({
      role: 'tool' as const,
      tool_call_id: b.tool_use_id!,
      content: b.content ?? '',
    }));
  const parts = toUserParts(m.content);
  if (parts.length) out.push({ role: 'user', content: parts });
  return out;
}

const STOP_REASON: Record<string, string> = {
  stop: 'end_turn',
  length: 'max_tokens',
  tool_calls: 'tool_use',
  function_call: 'tool_use',
  content_filter: 'refusal',
};

export function fromOpenAiResponse(data: OpenAiResponse): CreateMessageResult {
  const choice = data.choices[0];
  const content: AnthropicContentBlock[] = [];
  if (choice?.message.content)
    content.push({ type: 'text', text: choice.message.content });
  for (const c of choice?.message.tool_calls ?? []) {
    let input: Record<string, unknown> = {};
    try {
      input = c.function.arguments
        ? (JSON.parse(c.function.arguments) as Record<string, unknown>)
        : {};
    } catch {
      input = {};
    }
    content.push({ type: 'tool_use', id: c.id, name: c.function.name, input });
  }
  const finish = choice?.finish_reason ?? null;
  return {
    content,
    stopReason: finish ? (STOP_REASON[finish] ?? finish) : null,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    cachedInputTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  };
}

/**
 * OpenAI Chat Completions. `temperature` is deliberately not sent: current OpenAI reasoning
 * models reject any non-default value, and a rejected call would only burn a fallback.
 * Output limits use `max_completion_tokens` for the same reason.
 */
export const openAiProvider: ModelProviderAdapter = {
  async create(call: ProviderCall): Promise<CreateMessageResult> {
    const { params } = call;
    const res = await axios.post<OpenAiResponse>(
      API_URL,
      {
        model: call.model,
        messages: toOpenAiMessages(params),
        max_completion_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(params.tools?.length
          ? {
              tools: params.tools.map((t) => ({
                type: 'function',
                function: {
                  name: t.name,
                  description: t.description,
                  parameters: t.input_schema,
                },
              })),
            }
          : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${call.apiKey}`,
          'content-type': 'application/json',
        },
        timeout: call.timeoutMs,
      },
    );
    return fromOpenAiResponse(res.data);
  },
};
