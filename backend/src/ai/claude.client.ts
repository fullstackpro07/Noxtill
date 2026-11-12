/**
 * Kept as an import path for the shared message types only. There is no direct model client
 * any more: every call goes through `AiInfraService` → `AiRouterService` (routing/), which picks
 * the model from `routing/ai-routing.config.ts`.
 */
export type {
  AnthropicContentBlock,
  AnthropicMessage,
  AnthropicTool,
  CreateMessageParams,
  CreateMessageResult,
} from './ai-message.types';
