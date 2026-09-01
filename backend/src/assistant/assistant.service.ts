import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ClaudeClient,
  AnthropicContentBlock,
  AnthropicMessage,
} from '../ai/claude.client';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import { collectAnthropicStream } from '../ai/anthropic-stream.util';
import {
  ASSISTANT_TOOLS,
  findAssistantTool,
  toAnthropicTools,
} from './assistant-tools';
import { Prisma } from '@prisma/client';

const MAX_TOOL_ITERATIONS = 5;
const AI_CALL_KIND = 'assistant_chat';

const SYSTEM_PROMPT = [
  "You are Noxtill's in-product assistant for a small business owner.",
  'Use the provided tools to answer any question involving numbers, counts, or business data — ' +
    'NEVER state a number, count, or fact you did not get from a tool result. If no tool can answer ' +
    'the question, say so honestly rather than guessing.',
  'For "how do I" or product-usage questions (features, policies, definitions), use search_help_docs ' +
    'and cite the passage number(s) you used, e.g. "(see [1])". If search_help_docs finds nothing ' +
    'relevant, say so honestly instead of guessing how the product works.',
  'Keep answers short (2-4 sentences) and plain-language.',
].join(' ');

export interface AssistantChatResult {
  text: string;
  toolCalls: { name: string; input: unknown; output: unknown }[];
  conversationId: string;
}

const TITLE_MAX_LENGTH = 80;

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
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeClient,
    private readonly aiInfra: AiInfraService,
  ) {}

  async chat(
    businessId: string,
    userId: string,
    message: string,
    conversationId?: string,
    onTextDelta?: (text: string) => void,
  ): Promise<AssistantChatResult> {
    const priorMessages: AnthropicMessage[] = [];
    let conversation: { id: string };

    if (conversationId) {
      const existing =
        await this.tenantPrisma.client.assistantConversation.findUnique({
          where: { id: conversationId },
          include: { messages: { orderBy: { createdAt: 'asc' } } },
        });
      if (!existing || existing.businessId !== businessId) {
        throw new NotFoundException('Conversation not found');
      }
      conversation = existing;
      // Replays each past turn's final text only (not intermediate tool_use/tool_result blocks) —
      // see the model's doc comment: keeps context size bounded and matches what Chat History shows.
      for (const m of existing.messages) {
        priorMessages.push({ role: m.role, content: m.content });
      }
    } else {
      conversation =
        await this.tenantPrisma.client.assistantConversation.create({
          data: {
            businessId,
            userId,
            title: message.slice(0, TITLE_MAX_LENGTH),
          },
        });
    }

    const messages: AnthropicMessage[] = [
      ...priorMessages,
      { role: 'user', content: message },
    ];
    const toolCallLog: { name: string; input: unknown; output: unknown }[] = [];
    let finalText = '';

    // Persisted before the tool loop runs (not batched with the assistant's reply at the end) —
    // guarantees it sorts before the assistant's message even when both land in the same
    // millisecond, and means the question is on record even if the AI call below fails outright.
    await this.tenantPrisma.client.assistantMessage.create({
      data: { conversationId: conversation.id, role: 'user', content: message },
    });

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      await this.aiInfra.checkGuardrails(businessId, AI_CALL_KIND);

      let stream: NodeJS.ReadableStream;
      try {
        stream = await this.claude.streamMessage({
          system: SYSTEM_PROMPT,
          messages,
          tools: toAnthropicTools(),
        });
      } catch (error) {
        this.logger.error(
          `Assistant Claude call failed: ${(error as Error).message}`,
        );
        throw new AppException(
          'AI_UNAVAILABLE',
          'The AI assistant is not available right now — please try again later.',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
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

    await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.assistantMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: finalText,
          toolCalls:
            toolCallLog.length > 0
              ? (toolCallLog as unknown as Prisma.InputJsonValue)
              : undefined,
        },
      }),
      this.tenantPrisma.client.assistantConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      }),
    ]);

    return {
      text: finalText,
      toolCalls: toolCallLog,
      conversationId: conversation.id,
    };
  }

  async listConversations(businessId: string, userId: string) {
    const conversations =
      await this.tenantPrisma.client.assistantConversation.findMany({
        where: { businessId, userId },
        orderBy: { updatedAt: 'desc' },
        include: {
          messages: { where: { role: 'user' }, orderBy: { createdAt: 'asc' } },
        },
      });
    return conversations.map((c) => ({
      id: c.id,
      title:
        c.title ??
        c.messages[0]?.content.slice(0, TITLE_MAX_LENGTH) ??
        'Untitled',
      questionCount: c.messages.length,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  async getConversation(businessId: string, userId: string, id: string) {
    const conversation =
      await this.tenantPrisma.client.assistantConversation.findUnique({
        where: { id },
        include: { messages: { orderBy: { createdAt: 'asc' } } },
      });
    if (
      !conversation ||
      conversation.businessId !== businessId ||
      conversation.userId !== userId
    ) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  async deleteConversation(businessId: string, userId: string, id: string) {
    await this.getConversation(businessId, userId, id);
    await this.tenantPrisma.client.assistantConversation.delete({
      where: { id },
    });
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
        { businessId, tenantPrisma: this.tenantPrisma, prisma: this.prisma },
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
