/**
 * Provider-neutral message shape used by every AI call site. It follows the Anthropic Messages
 * layout (content blocks, tool_use / tool_result) because that is what the codebase was built on;
 * each provider adapter under `routing/providers/` translates to and from its own wire format.
 */
export interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  /** `type: 'image'` or `'document'` (a PDF) — base64 inline media. */
  source?: {
    type: 'base64';
    media_type:
      | 'image/jpeg'
      | 'image/png'
      | 'image/gif'
      | 'image/webp'
      | 'application/pdf';
    data: string;
  };
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
  /**
   * Structural check on the model's output (spec §5.3). Throw to reject: the router then tries
   * the fallback model instead of returning bad data. See `expectJson` in `routing/validate.ts`.
   */
  validate?: (result: CreateMessageResult) => void;
}

export interface CreateMessageResult {
  content: AnthropicContentBlock[];
  stopReason: string | null;
  /** Total input tokens, including any served from the provider's prompt cache. */
  inputTokens: number;
  outputTokens: number;
  /** Portion of `inputTokens` billed at the cached-input rate. */
  cachedInputTokens?: number;
  /** Set by the router: which provider/model actually answered. */
  provider?: string;
  model?: string;
  operation?: string;
  tier?: string;
  usedFallback?: boolean;
  latencyMs?: number;
}
