"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectAnthropicStream = collectAnthropicStream;
async function collectAnthropicStream(stream, onTextDelta) {
    const blocks = [];
    let stopReason = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let buffer = '';
    for await (const chunk of stream) {
        buffer += chunk.toString('utf8');
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
            const dataLine = part
                .split('\n')
                .find((line) => line.startsWith('data:'));
            if (!dataLine)
                continue;
            const payload = JSON.parse(dataLine.slice(5).trim());
            if (typeof payload !== 'object' ||
                payload === null ||
                !('type' in payload))
                continue;
            const event = payload;
            switch (event.type) {
                case 'message_start': {
                    const message = event.message;
                    inputTokens = message.usage?.input_tokens ?? 0;
                    break;
                }
                case 'content_block_start': {
                    const block = event.content_block;
                    blocks[event.index] = { ...block, text: block.text ?? '' };
                    break;
                }
                case 'content_block_delta': {
                    const delta = event.delta;
                    const block = blocks[event.index];
                    if (delta.type === 'text_delta' && delta.text) {
                        block.text = (block.text ?? '') + delta.text;
                        onTextDelta?.(delta.text);
                    }
                    else if (delta.type === 'input_json_delta') {
                        block._rawInputJson =
                            (block._rawInputJson ?? '') + (delta.partial_json ?? '');
                    }
                    break;
                }
                case 'content_block_stop': {
                    const block = blocks[event.index];
                    if (block._rawInputJson !== undefined) {
                        block.input = block._rawInputJson
                            ? JSON.parse(block._rawInputJson)
                            : {};
                        delete block._rawInputJson;
                    }
                    break;
                }
                case 'message_delta': {
                    const delta = event.delta;
                    const usage = event.usage;
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
//# sourceMappingURL=anthropic-stream.util.js.map