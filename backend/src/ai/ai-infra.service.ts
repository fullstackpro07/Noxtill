import { HttpStatus, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { CreditsService, Reservation } from '../usage/credits.service';
import {
  BAND_CREDITS,
  bandForTokens,
  KIND_TO_OPERATION,
  VOICE_TEXT_KINDS,
} from '../usage/usage.constants';
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
  IMAGE_GENERATION_COST_USD,
  KIND_TO_FEATURE,
  RATE_LIMIT_WINDOW_MS,
} from './ai-infra.constants';
import { Prisma } from '@prisma/client';

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
  private readonly logger = new Logger(AiInfraService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeClient,
    private readonly config: ConfigService,
    /** Usage & Limits AI credits. Optional only so unit specs can construct this without it. */
    @Optional() private readonly credits?: CreditsService,
  ) {}

  /**
   * Reserves the operation's nominal credits before the model is called (spec §4.7–4.8). Returns
   * null when nothing is owed: no business (pre-signup), or a kind billed on its own meter (live
   * call turns → voice minutes, digitizer scans → pages). Throws a 402 limit error with remedies
   * when the balance can't cover it, so the provider is never called.
   */
  async reserveCredits(
    businessId: string | undefined,
    kind: string,
    voiceAgentVersionId?: string,
  ): Promise<Reservation | null> {
    if (!businessId || !this.credits || voiceAgentVersionId) return null;
    let op = KIND_TO_OPERATION[kind];
    if (op === undefined) {
      this.logger.warn(
        `AI kind "${kind}" has no credit operation; billing as a generic request`,
      );
      op = KIND_TO_OPERATION.complete;
    }
    if (op === null) return null;
    return this.credits.reserve({
      businessId,
      operationCode: op.code,
      band: op.band,
      idempotencyKey: `ai:${kind}:${randomUUID()}`,
    });
  }

  /** Commits the ACTUAL credits from the call's real token count (spec §4.8). */
  async commitCredits(
    reservation: Reservation | null | undefined,
    tokens: number | null,
  ): Promise<void> {
    if (!reservation || !this.credits) return;
    const actual =
      tokens == null
        ? reservation.reservedQty
        : BAND_CREDITS[bandForTokens(tokens)];
    await this.credits.commit(reservation.reservationId, actual);
  }

  /** A failed operation is never charged (spec §1.3). */
  async releaseCredits(
    reservation: Reservation | null | undefined,
    reason: string,
  ): Promise<void> {
    if (!reservation || !this.credits) return;
    await this.credits.release(reservation.reservationId, reason);
  }

  async complete(
    businessId: string | undefined,
    prompt: string,
    temperature = 0,
    kind = 'complete',
    maxTokens?: number,
    voiceBudget?: {
      voiceAgentVersionId: string;
      monthlyBudgetUsd?: number | null;
    },
  ): Promise<string> {
    if (businessId && voiceBudget?.monthlyBudgetUsd != null) {
      await this.enforceVoiceVersionBudget(
        businessId,
        voiceBudget.voiceAgentVersionId,
        voiceBudget.monthlyBudgetUsd,
      );
    }
    const result = await this.createMessage(
      businessId,
      kind,
      {
        messages: [{ role: 'user', content: prompt }],
        temperature,
        ...(maxTokens ? { maxTokens } : {}),
      },
      undefined,
      voiceBudget?.voiceAgentVersionId,
    );
    const text = result.content.find((block) => block.type === 'text')?.text;
    return text ?? '';
  }

  private async enforceVoiceVersionBudget(
    businessId: string,
    versionId: string,
    monthlyBudgetUsd: number,
  ): Promise<void> {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const usage = await this.prisma.aiCallLog.aggregate({
      where: {
        businessId,
        voiceAgentVersionId: versionId,
        createdAt: { gte: monthStart },
      },
      _sum: { estimatedCostUsd: true },
    });
    if (Number(usage._sum.estimatedCostUsd ?? 0) >= monthlyBudgetUsd) {
      throw new AppException(
        'VOICE_AI_VERSION_BUDGET_REACHED',
        'This AI agent version has reached its monthly call budget.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /**
   * AI Content Studio image generation (UPD-BE-048) — no image-generation capability existed
   * anywhere in this codebase before this ticket (confirmed by research); Claude/Anthropic has no
   * image-generation API, so this calls OpenAI's Images API instead, the one new external
   * provider this ticket introduces (`OPENAI_API_KEY`, disclosed placeholder). Runs through the
   * exact same rate-limit/cost-cap guardrails as `complete()`, just priced as a flat per-image
   * cost rather than per-token.
   */
  async generateImage(
    businessId: string | undefined,
    prompt: string,
  ): Promise<{ url: string }> {
    await this.checkGuardrails(businessId, 'generate_image');
    const reservation = await this.reserveCredits(businessId, 'generate_image');

    let response: { data: { data: { url: string }[] } };
    try {
      response = await axios.post<{ data: { url: string }[] }>(
        'https://api.openai.com/v1/images/generations',
        { prompt, n: 1, size: '1024x1024' },
        {
          headers: {
            Authorization: `Bearer ${this.config.get<string>('OPENAI_API_KEY') ?? ''}`,
          },
        },
      );
    } catch (error) {
      await this.releaseCredits(reservation, 'provider_error');
      throw error;
    }
    // A flat-priced image: the reserved amount is the actual amount.
    await this.commitCredits(reservation, null);

    await this.prisma.aiCallLog.create({
      data: {
        businessId,
        kind: 'generate_image',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: IMAGE_GENERATION_COST_USD,
      },
    });

    return { url: response.data.data[0].url };
  }

  /** Runs the same guardrails as `complete`, but exposes the full response (content blocks, tool_use, etc). */
  async createMessage(
    businessId: string | undefined,
    kind: string,
    params: CreateMessageParams,
    toolCalls?: unknown,
    voiceAgentVersionId?: string,
  ): Promise<CreateMessageResult> {
    await this.checkGuardrails(businessId, kind);
    if (businessId && voiceAgentVersionId) {
      const version = await this.prisma.voiceAiAgentVersion.findFirst({
        where: { id: voiceAgentVersionId, businessId },
        select: { config: true },
      });
      if (!version)
        throw new AppException(
          'VOICE_AI_VERSION_NOT_FOUND',
          'The AI agent version is not available in this business.',
          HttpStatus.NOT_FOUND,
        );
      const budget = (version.config as { monthlyBudgetUsd?: unknown })
        .monthlyBudgetUsd;
      if (typeof budget === 'number' && Number.isFinite(budget))
        await this.enforceVoiceVersionBudget(
          businessId,
          voiceAgentVersionId,
          budget,
        );
    }
    const reservation = await this.reserveCredits(
      businessId,
      kind,
      voiceAgentVersionId,
    );
    let result: CreateMessageResult;
    try {
      result = await this.claude.createMessage(params);
    } catch (error) {
      await this.releaseCredits(reservation, 'provider_error');
      throw error;
    }
    await this.recordUsage(
      businessId,
      kind,
      result,
      toolCalls,
      voiceAgentVersionId,
      reservation,
    );
    return result;
  }

  /**
   * Exposed separately (not folded into `createMessage`) for AssistantService's
   * streamed tool-use loop (BE-074), which calls `ClaudeClient.streamMessage`
   * directly and reconstructs its own CreateMessageResult from the SSE
   * stream — it still needs the exact same rate-limit/cost-cap/logging path.
   *
   * `kind` is optional and, when given, also enforced against AI Settings' per-feature toggle
   * (UPD-BE-115) — only for kinds that map to one of the named toggleable features
   * (`KIND_TO_FEATURE`); everything else (e.g. the bare `'complete'` default) has no toggle to
   * check and is always allowed through this gate.
   */
  async checkGuardrails(
    businessId: string | undefined,
    kind?: string,
  ): Promise<void> {
    if (!businessId) return;
    await this.enforceRateLimit(businessId);
    await this.enforceCostCap(businessId);
    if (kind) await this.enforceFeatureToggle(businessId, kind);
  }

  private async enforceFeatureToggle(
    businessId: string,
    kind: string,
  ): Promise<void> {
    const featureKey = KIND_TO_FEATURE[kind];
    if (!featureKey) return;

    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const toggles = (business.aiFeatureToggles ?? {}) as Record<
      string,
      boolean
    >;
    if (toggles[featureKey] === false) {
      throw new AppException(
        AI_ERROR_CODES.FEATURE_DISABLED,
        'This AI feature has been turned off in AI Settings.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  async recordUsage(
    businessId: string | undefined,
    kind: string,
    result: CreateMessageResult,
    toolCalls?: unknown,
    voiceAgentVersionId?: string,
    /** The credit reservation made for this call (see `reserveCredits`); committed at actual. */
    reservation?: Reservation | null,
  ): Promise<void> {
    await this.logCall(
      businessId,
      kind,
      result,
      toolCalls,
      voiceAgentVersionId,
    );
    await this.commitCredits(
      reservation,
      result.inputTokens + result.outputTokens,
    );
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
    voiceAgentVersionId?: string,
  ): Promise<void> {
    const cost =
      result.inputTokens * HAIKU_INPUT_COST_PER_TOKEN +
      result.outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN;

    const log = await this.prisma.aiCallLog.create({
      data: {
        businessId,
        kind,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: cost,
        toolCalls: toolCalls as Prisma.InputJsonValue,
        voiceAgentVersionId,
      },
    });
    if (businessId && VOICE_TEXT_KINDS.has(kind)) {
      await this.prisma.voiceUsageRecord.create({
        data: {
          businessId,
          eventKey: `anthropic:voice:${log.id}`,
          provider: 'anthropic',
          unit: 'voice_text_tokens',
          quantity: result.inputTokens + result.outputTokens,
          cost,
          currency: 'USD',
          state: 'estimated',
          evidence: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costBasis: 'haiku_default_list_price_estimate',
            voiceAgentVersionId: voiceAgentVersionId ?? null,
          },
        },
      });
    }
  }
}
