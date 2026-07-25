import { ConfigService } from '@nestjs/config';
export interface AnthropicContentBlock {
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
    tool_use_id?: string;
    content?: string;
}
export interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string | AnthropicContentBlock[];
}
export interface AnthropicTool {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}
export interface CreateMessageParams {
    system?: string;
    messages: AnthropicMessage[];
    tools?: AnthropicTool[];
    temperature?: number;
    maxTokens?: number;
}
export interface CreateMessageResult {
    content: AnthropicContentBlock[];
    stopReason: string | null;
    inputTokens: number;
    outputTokens: number;
}
export declare class ClaudeClient {
    private readonly config;
    private readonly logger;
    constructor(config: ConfigService);
    private apiKey;
    complete(prompt: string, temperature?: number): Promise<string>;
    createMessage(params: CreateMessageParams): Promise<CreateMessageResult>;
    streamMessage(params: CreateMessageParams): Promise<NodeJS.ReadableStream>;
}
