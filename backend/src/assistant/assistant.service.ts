import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  ClaudeClient,
  AnthropicContentBlock,
  AnthropicMessage,
} from '../ai/claude.client';
import { AiInfraService } from '../ai/ai-infra.service';
import { collectAnthropicStream } from '../ai/anthropic-stream.util';
import {
  ASSISTANT_TOOLS,
  findAssistantTool,
  toAnthropicTools,
} from './assistant-tools';

const MAX_TOOL_ITERATIONS = 5;
const AI_CALL_KIND = 'assistant_chat';

const SYSTEM_PROMPT = [
  "You are Noxtill's in-product assistant for a small business owner.",
  'Use the provided tools to answer any question involving numbers, counts, or business data — ' +
    'NEVER state a number, count, or fact you did not get from a tool result. If no tool can answer ' +
    'the question, say so honestly rather than guessing.',
  'Keep answers short (2-4 sentences) and plain-language.',
].join(' ');

export interface AssistantChatResult {
  text: string;
  toolCalls: { name: string; input: unknown; output: unknown }[];
}

/**
 * Tool-calling assistant (BE-074). Every turn is streamed via
 * ClaudeClient.streamMessage so the caller sees tokens arrive live —
 * including any "let me check that..." preamble before a tool call — and
 * the loop keeps calling tools (tenant-locked to `businessId`, never a
 * value the model can override) until Claude stops requesting them.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly claude: ClaudeClient,
    private readonly aiInfra: AiInfraService,
  ) {}

  async chat(
    businessId: string,
    message: string,
    onTextDelta?: (text: string) => void,
  ): Promise<AssistantChatResult> {
    const messages: AnthropicMessage[] = [{ role: 'user', content: message }];
    const toolCallLog: { name: string; input: unknown; output: unknown }[] = [];
    let finalText = '';

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      await this.aiInfra.checkGuardrails(businessId);

      const stream = await this.claude.streamMessage({
        system: SYSTEM_PROMPT,
        messages,
        tools: toAnthropicTools(),
      });
      const result = await collectAnthropicStream(stream, onTextDelta);

      const toolUseBlocks = result.content.filter((b) => b.type === 'tool_use');
      const turnToolCalls: { name: string; input: unknown }[] =
        toolUseBlocks.map((b) => ({
          name: b.name!,
          input: b.input,
        }));

      if (turnToolCalls.length === 0) {
        await this.aiInfra.recordUsage(
          businessId,
          AI_CALL_KIND,
          result,
          toolCallLog,
        );
        finalText = result.content.find((b) => b.type === 'text')?.text ?? '';
        break;
      }

      messages.push({ role: 'assistant', content: result.content });

      const toolResultBlocks: AnthropicContentBlock[] = [];
      for (const block of toolUseBlocks) {
        const output = await this.executeTool(
          businessId,
          block.name!,
          block.input ?? {},
        );
        toolCallLog.push({ name: block.name!, input: block.input, output });
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(output),
        });
      }
      messages.push({ role: 'user', content: toolResultBlocks });

      await this.aiInfra.recordUsage(
        businessId,
        AI_CALL_KIND,
        result,
        turnToolCalls,
      );
    }

    return { text: finalText, toolCalls: toolCallLog };
  }

  private async executeTool(
    businessId: string,
    name: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const tool = findAssistantTool(name);
    if (!tool) {
      return { error: `Unknown tool: ${name}` };
    }
    try {
      return await tool.execute(
        { businessId, tenantPrisma: this.tenantPrisma },
        input,
      );
    } catch (error) {
      this.logger.error(`Tool "${name}" failed: ${(error as Error).message}`);
      return { error: 'Tool execution failed' };
    }
  }

  listTools() {
    return ASSISTANT_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
    }));
  }
}
