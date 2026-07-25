import { AnthropicContentBlock } from './claude.client';

export interface StreamedMessageResult {
  content: AnthropicContentBlock[];
  stopReason: string | null;
  inputTokens: number;
  outputTokens: number;
}

interface BlockAccumulator extends AnthropicContentBlock {
  /** Raw partial JSON accumulated for a tool_use block's `input`, parsed once the block closes. */
  _rawInputJson?: string;
}

/**
 * Reconstructs a full Anthropic message from its SSE event stream, calling
 * `onTextDelta` with each token of `text_delta` content as it arrives (the
 * only thing that should ever reach the end user mid-stream — tool_use
 * blocks are opaque server-side orchestration, never shown to the caller).
 */
export async function collectAnthropicStream(
  stream: NodeJS.ReadableStream,
  onTextDelta?: (text: string) => void,
): Promise<StreamedMessageResult> {
  const blocks: BlockAccumulator[] = [];
  let stopReason: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let buffer = '';

  for await (const chunk of stream) {
    buffer += (chunk as Buffer).toString('utf8');
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const dataLine = part
        .split('\n')
        .find((line) => line.startsWith('data:'));
      if (!dataLine) continue;

      const payload: unknown = JSON.parse(dataLine.slice(5).trim());
      if (
        typeof payload !== 'object' ||
        payload === null ||
        !('type' in payload)
      )
        continue;
      const event = payload as Record<string, unknown>;

      switch (event.type) {
        case 'message_start': {
          const message = event.message as {
            usage?: { input_tokens?: number };
          };
          inputTokens = message.usage?.input_tokens ?? 0;
          break;
        }
        case 'content_block_start': {
          const block = event.content_block as AnthropicContentBlock;
          blocks[event.index as number] = { ...block, text: block.text ?? '' };
          break;
        }
        case 'content_block_delta': {
          const delta = event.delta as {
            type: string;
            text?: string;
            partial_json?: string;
          };
          const block = blocks[event.index as number];
          if (delta.type === 'text_delta' && delta.text) {
            block.text = (block.text ?? '') + delta.text;
            onTextDelta?.(delta.text);
          } else if (delta.type === 'input_json_delta') {
            block._rawInputJson =
              (block._rawInputJson ?? '') + (delta.partial_json ?? '');
          }
          break;
        }
        case 'content_block_stop': {
          const block = blocks[event.index as number];
          if (block._rawInputJson !== undefined) {
            block.input = block._rawInputJson
              ? (JSON.parse(block._rawInputJson) as Record<string, unknown>)
              : {};
            delete block._rawInputJson;
          }
          break;
        }
        case 'message_delta': {
          const delta = event.delta as { stop_reason?: string | null };
          const usage = event.usage as { output_tokens?: number } | undefined;
          stopReason = delta.stop_reason ?? stopReason;
          if (usage?.output_tokens !== undefined) {
            outputTokens = usage.output_tokens;
          }
          break;
        }
        default:
          break;
      }
    }
  }

  return { content: blocks, stopReason, inputTokens, outputTokens };
}
