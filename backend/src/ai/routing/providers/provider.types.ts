import type {
  CreateMessageParams,
  CreateMessageResult,
} from '../../ai-message.types';

export const DEFAULT_MAX_TOKENS = 1024;

export interface ProviderCall {
  apiKey: string;
  model: string;
  params: CreateMessageParams;
  timeoutMs: number;
}

export interface ModelProviderAdapter {
  create(call: ProviderCall): Promise<CreateMessageResult>;
  /** Native SSE stream in Anthropic event format, when the provider supports it. */
  stream?(call: ProviderCall): Promise<NodeJS.ReadableStream>;
}
