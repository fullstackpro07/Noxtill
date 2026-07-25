import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  ClaudeClient,
  CreateMessageParams,
  CreateMessageResult,
} from './claude.client';
import {
  AI_ERROR_CODES,
  HAIKU_INPUT_COST_PER_TOKEN,
  HAIKU_OUTPUT_COST_PER_TOKEN,
  RATE_LIMIT_WINDOW_MS,
} from './ai-infra.constants';
import { Prisma } from '../../generated/prisma';

/**
 * Shared AI infra (BE-075) — every AI feature in the product (what-if,
 * branch-advisor, review AI-draft, business-type mapping, RAG help,
 * assistant chat) goes through here rather than calling ClaudeClient
 * directly, so rate limiting, the monthly cost cap, and call logging are
 * enforced exactly once, in exactly one place.
 *
 * `businessId` is optional: BusinessTypesService's AI-map runs pre-signup
 * (no business exists yet), so there's nothing to rate-limit or cap against
 * — those calls are simply logged with a null businessId.
 */
@Injectable()
export class AiInfraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeClient,
  ) {}

  async complete(
    businessId: string | undefined,
    prompt: string,
    temperature = 0,
  ): Promise<string> {
    const result = await this.createMessage(businessId, 'complete', {
      messages: [{ role: 'user', content: prompt }],
      temperature,
    });
    const text = result.content.find((block) => block.type === 'text')?.text;
    return text ?? '';
  }

  /** Runs the same guardrails as `complete`, but exposes the full response (content blocks, tool_use, etc). */
  async createMessage(
    businessId: string | undefined,
    kind: string,
    params: CreateMessageParams,
    toolCalls?: unknown,
  ): Promise<CreateMessageResult> {
    await this.checkGuardrails(businessId);
    const result = await this.claude.createMessage(params);
    await this.recordUsage(businessId, kind, result, toolCalls);
    return result;
  }

  /**
   * Exposed separately (not folded into `createMessage`) for AssistantService's
   * streamed tool-use loop (BE-074), which calls `ClaudeClient.streamMessage`
   * directly and reconstructs its own CreateMessageResult from the SSE
   * stream — it still needs the exact same rate-limit/cost-cap/logging path.
   */
  async checkGuardrails(businessId: string | undefined): Promise<void> {
    if (!businessId) return;
    await this.enforceRateLimit(businessId);
    await this.enforceCostCap(businessId);
  }

  async recordUsage(
    businessId: string | undefined,
    kind: string,
    result: CreateMessageResult,
    toolCalls?: unknown,
  ): Promise<void> {
    await this.logCall(businessId, kind, result, toolCalls);
  }

  private async enforceRateLimit(businessId: string): Promise<void> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const recentCalls = await this.prisma.aiCallLog.count({
      where: { businessId, createdAt: { gte: since } },
    });
    if (recentCalls >= business.aiRateLimitPerMinute) {
      throw new AppException(
        AI_ERROR_CODES.RATE_LIMITED,
        'Too many AI requests — please wait a moment and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async enforceCostCap(businessId: string): Promise<void> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const agg = await this.prisma.aiCallLog.aggregate({
      where: { businessId, createdAt: { gte: monthStart } },
      _sum: { estimatedCostUsd: true },
    });
    const spent = Number(agg._sum.estimatedCostUsd ?? 0);
    if (spent >= Number(business.aiMonthlyCostCapUsd)) {
      throw new AppException(
        AI_ERROR_CODES.COST_CAP_EXCEEDED,
        'This business has reached its monthly AI usage cap.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async logCall(
    businessId: string | undefined,
    kind: string,
    result: CreateMessageResult,
    toolCalls?: unknown,
  ): Promise<void> {
    const cost =
      result.inputTokens * HAIKU_INPUT_COST_PER_TOKEN +
      result.outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN;

    await this.prisma.aiCallLog.create({
      data: {
        businessId,
        kind,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: cost,
        toolCalls: toolCalls as Prisma.InputJsonValue,
      },
    });
  }
}
