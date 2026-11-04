import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import {
  describeAiProviderFailure,
  describeAiSummaryProviderFailure,
} from './ai-provider-error.util';

describe('AI provider error disclosure', () => {
  it('explains insufficient provider credit without retaining the raw response', () => {
    const error = {
      isAxiosError: true,
      message: 'Request failed with status code 400',
      response: {
        status: 400,
        data: {
          error: {
            type: 'invalid_request_error',
            message: 'Your credit balance is too low. Add more credits.',
          },
        },
      },
    };

    const failure = describeAiSummaryProviderFailure(
      error,
      'The calculated evidence is still available.',
    );

    expect(failure).toEqual({
      status: 'unavailable',
      text: null,
      message:
        'The AI provider account has insufficient credit. Ask the platform administrator to add credit before retrying. The calculated evidence is still available.',
      inputTokens: 0,
      outputTokens: 0,
      errorCode: 'AI_PROVIDER_INSUFFICIENT_CREDIT',
    });
    expect(JSON.stringify(failure)).not.toContain('Add more credits');
  });

  it('marks an absent provider key as not configured', () => {
    const failure = describeAiSummaryProviderFailure(
      new Error('ANTHROPIC_API_KEY is not configured'),
      'The real queue remains available.',
    );

    expect(failure).toMatchObject({
      status: 'not_configured',
      errorCode: 'AI_PROVIDER_NOT_CONFIGURED',
    });
    expect(failure.message).toContain('The real queue remains available.');
  });

  it('keeps typed application guardrails blocked', () => {
    const failure = describeAiSummaryProviderFailure(
      new AppException(
        'AI_MONTHLY_LIMIT_REACHED',
        'The monthly AI budget is exhausted.',
        HttpStatus.TOO_MANY_REQUESTS,
      ),
      'The deterministic result remains available.',
    );

    expect(failure).toMatchObject({
      status: 'blocked',
      errorCode: 'AI_MONTHLY_LIMIT_REACHED',
    });
    expect(failure.message).toContain('The monthly AI budget is exhausted.');
  });

  it('uses a safe generic fallback for unrecognized provider errors', () => {
    const failure = describeAiProviderFailure(
      new Error('raw error contains a private key and must not be returned'),
    );

    expect(failure).toEqual({
      code: 'AI_PROVIDER_REQUEST_FAILED',
      message:
        'The AI provider could not complete this request. Check provider configuration, model access, and available credit.',
    });
    expect(JSON.stringify(failure)).not.toContain('private key');
  });
});
