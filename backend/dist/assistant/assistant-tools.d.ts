import { WidgetContext } from '../widgets/widget-registry';
import { AnthropicTool } from '../ai/claude.client';
export interface AssistantTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
    execute(ctx: WidgetContext, input: Record<string, unknown>): Promise<unknown>;
}
export declare const ASSISTANT_TOOLS: AssistantTool[];
export declare function findAssistantTool(name: string): AssistantTool | undefined;
export declare function toAnthropicTools(): AnthropicTool[];
