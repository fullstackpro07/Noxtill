import axios from 'axios';
import { AppException } from '../common/filters/app.exception';
import { isAiNotConfiguredError } from './routing/ai-router.service';

export interface AiProviderFailure {
  code: string;
  message: string;
}

/** Operator-facing reasons only: never persist a raw provider body or credential. */
export function describeAiProviderFailure(error: unknown): AiProviderFailure {
  if (error instanceof AppException) {
    const body = error.getResponse();
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;
      return {
        code:
          typeof record.code === 'string' ? record.code : 'AI_REQUEST_REJECTED',
        message:
          typeof record.message === 'string'
            ? record.message
            : 'AI request was refused by a business guardrail.',
      };
    }
  }
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data as
      { error?: { type?: unknown; message?: unknown } } | undefined;
    const message =
      typeof data?.error?.message === 'string' ? data.error.message : '';
    // Anthropic reports low credit as 400; OpenAI reports exhausted quota as 429.
    if (
      (status === 400 || status === 429) &&
      /credit balance.*(?:low|insufficient)|insufficient.*credit|insufficient_quota|exceeded your current quota/i.test(
        message,
      )
    ) {
      return {
        code: 'AI_PROVIDER_INSUFFICIENT_CREDIT',
        message:
          'The AI provider account has insufficient credit. Ask the platform administrator to add credit before retrying.',
      };
    }
    if (status === 401 || status === 403) {
      return {
        code: 'AI_PROVIDER_ACCESS_DENIED',
        message:
          'The AI provider rejected server access. Ask the platform administrator to check the API key and permissions.',
      };
    }
    if (
      status === 404 &&
      (data?.error?.type === 'not_found_error' ||
        /model/i.test(message) ||
        (data?.error as { code?: unknown } | undefined)?.code ===
          'model_not_found')
    ) {
      return {
        code: 'AI_PROVIDER_MODEL_UNAVAILABLE',
        message:
          'The configured AI model is not available to this provider account. Ask the platform administrator to check model access.',
      };
    }
    if (status === 429) {
      return {
        code: 'AI_PROVIDER_RATE_LIMITED',
        message:
          'The AI provider rate limit was reached. Wait before retrying.',
      };
    }
  }
  if (isAiNotConfiguredError(error)) {
    return {
      code: 'AI_PROVIDER_NOT_CONFIGURED',
      message: 'The AI reply provider is not configured on this server.',
    };
  }
  return {
    code: 'AI_PROVIDER_REQUEST_FAILED',
    message:
      'The AI provider could not complete this request. Check provider configuration, model access, and available credit.',
  };
}
