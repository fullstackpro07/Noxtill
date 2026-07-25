import { Readable } from 'stream';
import { collectAnthropicStream } from './anthropic-stream.util';

function sseStream(
  events: { type: string; [key: string]: unknown }[],
): Readable {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  return Readable.from([Buffer.from(body)]);
}

describe('collectAnthropicStream (BE-074)', () => {
  it('reconstructs streamed text into a single text content block', async () => {
    const stream = sseStream([
      { type: 'message_start', message: { usage: { input_tokens: 100 } } },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello, ' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'world!' },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 12 },
      },
      { type: 'message_stop' },
    ]);

    const deltas: string[] = [];
    const result = await collectAnthropicStream(stream, (text) =>
      deltas.push(text),
    );

    expect(deltas).toEqual(['Hello, ', 'world!']);
    expect(result.content).toEqual([{ type: 'text', text: 'Hello, world!' }]);
    expect(result.stopReason).toBe('end_turn');
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(12);
  });

  it('reconstructs a streamed tool_use block from partial JSON deltas, without emitting text', async () => {
    const stream = sseStream([
      { type: 'message_start', message: { usage: { input_tokens: 50 } } },
      {
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'tool_1',
          name: 'get_revenue_today',
          input: {},
        },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"a":' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '1}' },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use' },
        usage: { output_tokens: 5 },
      },
      { type: 'message_stop' },
    ]);

    const deltas: string[] = [];
    const result = await collectAnthropicStream(stream, (text) =>
      deltas.push(text),
    );

    expect(deltas).toEqual([]);
    expect(result.content).toEqual([
      {
        type: 'tool_use',
        id: 'tool_1',
        name: 'get_revenue_today',
        input: { a: 1 },
        text: '',
      },
    ]);
    expect(result.stopReason).toBe('tool_use');
  });
});
