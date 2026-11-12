import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { collectAnthropicStream } from '../anthropic-stream.util';
import {
  AiRouterService,
  isAiNotConfiguredError,
  toAnthropicSse,
} from './ai-router.service';
import { TIERS } from './ai-routing.config';
import {
  fromOpenAiResponse,
  toOpenAiMessages,
} from './providers/openai.provider';
import { expectJson } from './validate';

jest.mock('axios');
// eslint-disable-next-line @typescript-eslint/unbound-method -- jest mock, never called unbound
const post = jest.mocked(axios).post;

const anthropicOk = (text: string) => ({
  data: {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 4 },
  },
});
const openAiOk = (text: string) => ({
  data: {
    choices: [{ message: { content: text }, finish_reason: 'stop' }],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 3,
      prompt_tokens_details: { cached_tokens: 8 },
    },
  },
});

function router(keys: Record<string, string>) {
  return new AiRouterService({
    get: (k: string) => keys[k],
  } as unknown as ConfigService);
}
const ALL = {
  OPENAI_API_KEY: 'o',
  ANTHROPIC_API_KEY: 'a',
  GEMINI_API_KEY: 'g',
};
const params = { messages: [{ role: 'user' as const, content: 'hi' }] };

describe('AiRouterService', () => {
  beforeEach(() => post.mockReset());

  it('routes an Easy kind to the Easy primary with the tier timeout', async () => {
    post.mockResolvedValueOnce(openAiOk('hello'));
    const res = await router(ALL).run('review_reply', params);
    expect(res.meta).toMatchObject({
      operation: 'reviews.response_draft',
      tier: 'easy',
      provider: TIERS.easy.primary.provider,
      model: TIERS.easy.primary.model,
      usedFallback: false,
    });
    expect(res.cachedInputTokens).toBe(8);
    const [url, body, opts] = post.mock.calls[0];
    expect(url).toContain('openai');
    expect((body as { model: string }).model).toBe(TIERS.easy.primary.model);
    expect(body).not.toHaveProperty('temperature');
    expect((opts as { timeout: number }).timeout).toBe(TIERS.easy.timeoutMs);
  });

  it('falls back to the other provider when the primary throws, and flags it', async () => {
    post
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce(anthropicOk('from fallback'));
    const res = await router(ALL).run('review_reply', params);
    expect(res.meta.usedFallback).toBe(true);
    expect(res.meta.model).toBe(TIERS.easy.fallback.model);
    expect(res.content[0].text).toBe('from fallback');
    // Anthropic reports cache reads separately; total input includes them.
    expect(res.inputTokens).toBe(14);
  });

  it('skips a provider with no key without calling it', async () => {
    post.mockResolvedValueOnce(anthropicOk('ok'));
    const res = await router({ ANTHROPIC_API_KEY: 'a' }).run(
      'review_reply',
      params,
    );
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toContain('anthropic');
    expect(res.meta.usedFallback).toBe(true);
  });

  it('invalid structured output triggers the fallback instead of returning it', async () => {
    post
      .mockResolvedValueOnce(openAiOk('not json at all'))
      .mockResolvedValueOnce(anthropicOk('[1,2]'));
    const res = await router(ALL).run('review_sentiment', {
      ...params,
      validate: expectJson((v) => Array.isArray(v)),
    });
    expect(res.meta.usedFallback).toBe(true);
    expect(res.content[0].text).toBe('[1,2]');
  });

  it('rethrows when both providers fail', async () => {
    post
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'));
    await expect(router(ALL).run('review_reply', params)).rejects.toThrow('b');
  });

  it('throws a recognisable not-configured error when no key is set', async () => {
    const err = await router({})
      .run('review_reply', params)
      .catch((e: unknown) => e);
    expect(isAiNotConfiguredError(err)).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses an unregistered kind', async () => {
    await expect(router(ALL).run('complete', params)).rejects.toThrow(
      /not registered/,
    );
  });

  it('routes Hard kinds to the Hard primary and vision kinds to the vision service', async () => {
    post.mockResolvedValue(anthropicOk('x'));
    const hard = await router(ALL).run('what_if', params);
    expect(hard.meta).toMatchObject({
      tier: 'hard',
      operation: 'bi.simulator',
    });
    post.mockResolvedValueOnce({
      data: {
        candidates: [
          { content: { parts: [{ text: 'seen' }] }, finishReason: 'STOP' },
        ],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 2 },
      },
    });
    const vision = await router(ALL).run('digitizer_scan', params);
    expect(vision.meta).toMatchObject({ tier: 'vision', provider: 'google' });
    expect(vision.content[0].text).toBe('seen');
  });

  it('stream() replays a non-streaming provider as Anthropic SSE', async () => {
    post.mockResolvedValueOnce(openAiOk('streamed'));
    const { stream, meta } = await router({ OPENAI_API_KEY: 'o' }).stream(
      'assistant_chat',
      params,
    );
    expect(meta.provider).toBe('openai');
    const deltas: string[] = [];
    const out = await collectAnthropicStream(stream, (t) => deltas.push(t));
    expect(out.content[0].text).toBe('streamed');
    expect(deltas).toEqual(['streamed']);
  });
});

describe('OpenAI adapter translation', () => {
  it('maps tool_use / tool_result both ways', () => {
    const msgs = toOpenAiMessages({
      system: 'sys',
      messages: [
        { role: 'user', content: 'q' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'checking' },
            { type: 'tool_use', id: 't1', name: 'get_x', input: { a: 1 } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: 't1', content: '{"x":2}' },
          ],
        },
      ],
    });
    expect(msgs[0]).toEqual({ role: 'system', content: 'sys' });
    expect(msgs[2]).toMatchObject({
      role: 'assistant',
      content: 'checking',
      tool_calls: [
        { id: 't1', function: { name: 'get_x', arguments: '{"a":1}' } },
      ],
    });
    expect(msgs[3]).toEqual({
      role: 'tool',
      tool_call_id: 't1',
      content: '{"x":2}',
    });

    const res = fromOpenAiResponse({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'c1',
                type: 'function',
                function: { name: 'f', arguments: '{"b":2}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
    expect(res.stopReason).toBe('tool_use');
    expect(res.content).toEqual([
      { type: 'tool_use', id: 'c1', name: 'f', input: { b: 2 } },
    ]);
  });

  it('synthesised SSE carries tool_use blocks', async () => {
    const out = await collectAnthropicStream(
      toAnthropicSse({
        content: [{ type: 'tool_use', id: 'x', name: 'n', input: { q: 1 } }],
        stopReason: 'tool_use',
        inputTokens: 3,
        outputTokens: 4,
      }),
    );
    expect(out.content[0]).toMatchObject({
      type: 'tool_use',
      id: 'x',
      input: { q: 1 },
    });
    expect(out.stopReason).toBe('tool_use');
    expect(out.outputTokens).toBe(4);
  });
});
