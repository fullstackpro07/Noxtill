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

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

type GeminiPart =
  { text: string } | { inline_data: { mime_type: string; data: string } };

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

function toParts(content: string | AnthropicContentBlock[]): GeminiPart[] {
  if (typeof content === 'string') return [{ text: content }];
  const parts: GeminiPart[] = [];
  for (const b of content) {
    if (b.type === 'text' && b.text) parts.push({ text: b.text });
    else if ((b.type === 'image' || b.type === 'document') && b.source)
      parts.push({
        inline_data: { mime_type: b.source.media_type, data: b.source.data },
      });
  }
  return parts;
}

/**
 * Gemini `generateContent` — used for the spec §4 vision service (images and PDFs read natively).
 * Tool use is not translated: no vision call site passes tools.
 */
export const googleProvider: ModelProviderAdapter = {
  async create(call: ProviderCall): Promise<CreateMessageResult> {
    const { params } = call;
    if (params.tools?.length)
      throw new Error('Tool use is not supported on the Gemini adapter');
    const res = await axios.post<GeminiResponse>(
      `${API_BASE}/${encodeURIComponent(call.model)}:generateContent`,
      {
        ...(params.system
          ? { systemInstruction: { parts: [{ text: params.system }] } }
          : {}),
        contents: params.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: toParts(m.content),
        })),
        generationConfig: {
          maxOutputTokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: params.temperature ?? 0,
        },
      },
      {
        headers: {
          'x-goog-api-key': call.apiKey,
          'content-type': 'application/json',
        },
        timeout: call.timeoutMs,
      },
    );
    const cand = res.data.candidates?.[0];
    const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    const finish = cand?.finishReason ?? null;
    const u = res.data.usageMetadata ?? {};
    return {
      content: text ? [{ type: 'text', text }] : [],
      stopReason:
        finish === 'MAX_TOKENS'
          ? 'max_tokens'
          : finish === 'STOP'
            ? 'end_turn'
            : finish,
      inputTokens: u.promptTokenCount ?? 0,
      outputTokens: u.candidatesTokenCount ?? 0,
      cachedInputTokens: u.cachedContentTokenCount ?? 0,
    };
  },
};
