import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import type {
  CreateMessageParams,
  CreateMessageResult,
} from '../ai-message.types';
import { resolveRoute } from './ai-operations';
import {
  AiProvider,
  ModelTarget,
  PROVIDER_KEY_ENV,
  PROVIDER_LABEL,
  routeConfig,
} from './ai-routing.config';
import { anthropicProvider } from './providers/anthropic.provider';
import { googleProvider } from './providers/google.provider';
import { openAiProvider } from './providers/openai.provider';
import type { ModelProviderAdapter } from './providers/provider.types';

const ADAPTERS: Record<AiProvider, ModelProviderAdapter> = {
  anthropic: anthropicProvider,
  openai: openAiProvider,
  google: googleProvider,
};

export const AI_NOT_CONFIGURED_MESSAGE =
  'No AI provider is configured on this server for this operation';

/** Thrown when neither the primary nor the fallback provider of a route has an API key. */
export class AiNotConfiguredError extends Error {
  constructor(readonly operation: string) {
    super(AI_NOT_CONFIGURED_MESSAGE);
    this.name = 'AiNotConfiguredError';
  }
}

export function isAiNotConfiguredError(error: unknown): boolean {
  return (
    error instanceof AiNotConfiguredError ||
    (error instanceof Error && error.message === AI_NOT_CONFIGURED_MESSAGE)
  );
}

/** Which route, provider and model answered — written to `ai_usage`. */
export interface RouteMeta {
  kind: string;
  operation: string;
  tier: string;
  provider: AiProvider;
  model: string;
  usedFallback: boolean;
  latencyMs: number;
}

export interface RoutedStream {
  stream: NodeJS.ReadableStream;
  meta: RouteMeta;
}

/**
 * Spec §5.3 — the single entry point that turns an AI `kind` into a model call. Tries the
 * tier's primary, then its fallback (always the other provider). A target whose provider has
 * no API key is skipped without a request. A provider error, timeout, or output rejected by
 * `params.validate` moves on to the fallback; if both fail the last error is rethrown.
 *
 * This only routes. Rate limits, cost cap, feature toggles, credits and logging stay in
 * `AiInfraService`, which is the only caller (plus the assistant's streamed turn).
 */
@Injectable()
export class AiRouterService {
  private readonly logger = new Logger(AiRouterService.name);

  constructor(private readonly config: ConfigService) {}

  private key(provider: AiProvider): string | undefined {
    return this.config.get<string>(PROVIDER_KEY_ENV[provider]) || undefined;
  }

  private targets(kind: string) {
    const r = resolveRoute(kind);
    const cfg = routeConfig(r.route);
    return { r, cfg, targets: [cfg.primary, cfg.fallback] as ModelTarget[] };
  }

  /** True when at least one provider on this kind's route has a key. */
  isConfigured(kind: string): boolean {
    const { targets } = this.targets(kind);
    return targets.some((t) => !!this.key(t.provider));
  }

  /** Provider labels on this kind's route that have a key, primary first. */
  configuredProviders(kind: string): string[] {
    const { targets } = this.targets(kind);
    return targets
      .filter((t) => !!this.key(t.provider))
      .map((t) => PROVIDER_LABEL[t.provider]);
  }

  async run(
    kind: string,
    params: CreateMessageParams,
  ): Promise<CreateMessageResult & { meta: RouteMeta }> {
    const { r, cfg, targets } = this.targets(kind);
    const t0 = Date.now();
    const { validate, ...wire } = params;
    let lastError: unknown = null;
    let attempted = false;

    for (const target of targets) {
      const apiKey = this.key(target.provider);
      if (!apiKey) continue;
      attempted = true;
      try {
        const res = await ADAPTERS[target.provider].create({
          apiKey,
          model: target.model,
          params: wire,
          timeoutMs: cfg.timeoutMs,
        });
        validate?.(res);
        const meta: RouteMeta = {
          kind,
          operation: r.operation,
          tier: r.route,
          provider: target.provider,
          model: target.model,
          usedFallback: target !== cfg.primary,
          latencyMs: Date.now() - t0,
        };
        return { ...res, ...meta, meta };
      } catch (error) {
        lastError = error;
        if (target !== cfg.fallback)
          this.logger.warn(
            `AI ${r.operation} primary ${target.model} failed (${(error as Error).message}); trying fallback`,
          );
      }
    }
    if (!attempted) throw new AiNotConfiguredError(r.operation);
    throw lastError;
  }

  /**
   * Streamed turn (assistant chat). A provider with native streaming streams; otherwise the
   * call is made in full and replayed as an Anthropic-format SSE stream, so the caller's
   * `collectAnthropicStream` parsing works the same whichever provider answered. Fallback
   * applies only until the stream opens — a stream that breaks mid-way is not retried.
   */
  async stream(
    kind: string,
    params: CreateMessageParams,
  ): Promise<RoutedStream> {
    const { r, cfg, targets } = this.targets(kind);
    const t0 = Date.now();
    const { validate: _validate, ...wire } = params;
    void _validate;
    let lastError: unknown = null;
    let attempted = false;

    for (const target of targets) {
      const apiKey = this.key(target.provider);
      if (!apiKey) continue;
      attempted = true;
      const adapter = ADAPTERS[target.provider];
      const call = {
        apiKey,
        model: target.model,
        params: wire,
        timeoutMs: cfg.timeoutMs,
      };
      try {
        const stream = adapter.stream
          ? await adapter.stream(call)
          : toAnthropicSse(await adapter.create(call));
        return {
          stream,
          meta: {
            kind,
            operation: r.operation,
            tier: r.route,
            provider: target.provider,
            model: target.model,
            usedFallback: target !== cfg.primary,
            latencyMs: Date.now() - t0,
          },
        };
      } catch (error) {
        lastError = error;
      }
    }
    if (!attempted) throw new AiNotConfiguredError(r.operation);
    throw lastError;
  }
}

/** Replays a complete result as the Anthropic Messages SSE event sequence. */
export function toAnthropicSse(
  result: CreateMessageResult,
): NodeJS.ReadableStream {
  const events: Record<string, unknown>[] = [
    {
      type: 'message_start',
      message: { usage: { input_tokens: result.inputTokens } },
    },
  ];
  result.content.forEach((block, index) => {
    if (block.type === 'tool_use') {
      events.push({
        type: 'content_block_start',
        index,
        content_block: {
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: {},
        },
      });
      events.push({
        type: 'content_block_delta',
        index,
        delta: {
          type: 'input_json_delta',
          partial_json: JSON.stringify(block.input ?? {}),
        },
      });
    } else {
      events.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'text', text: '' },
      });
      events.push({
        type: 'content_block_delta',
        index,
        delta: { type: 'text_delta', text: block.text ?? '' },
      });
    }
    events.push({ type: 'content_block_stop', index });
  });
  events.push({
    type: 'message_delta',
    delta: { stop_reason: result.stopReason },
    usage: { output_tokens: result.outputTokens },
  });
  events.push({ type: 'message_stop' });
  const text = events
    .map((e) => `event: ${e.type as string}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('');
  return Readable.from([Buffer.from(text, 'utf8')]);
}
