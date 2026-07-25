import { AnthropicContentBlock } from './claude.client';
export interface StreamedMessageResult {
    content: AnthropicContentBlock[];
    stopReason: string | null;
    inputTokens: number;
    outputTokens: number;
}
export declare function collectAnthropicStream(stream: NodeJS.ReadableStream, onTextDelta?: (text: string) => void): Promise<StreamedMessageResult>;
