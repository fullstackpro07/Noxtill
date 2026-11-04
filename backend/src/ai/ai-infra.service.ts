import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import {
  ClaudeClient,
  CreateMessageParams,
  CreateMessageResult,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
} from './claude.client';
import {
  AI_ERROR_CODES,
  estimateHaikuCostUsd,
  HAIKU_INPUT_COST_PER_TOKEN,
  HAIKU_OUTPUT_COST_PER_TOKEN,
  IMAGE_GENERATION_COST_USD,
  KIND_TO_FEATURE,
  RATE_LIMIT_WINDOW_MS,
} from './ai-infra.constants';
import { SPECIALIST_AGENT_BUDGETS } from './specialist-agent-budgets.constants';
import { Prisma } from '@prisma/client';
import type { PolicyKey } from '../common/policies/policies.constants';
import { resolvePolicies } from '../common/policies/policies.service';
import { describeAiProviderFailure } from './ai-provider-error.util';

/**
 * Reserve a conservative maximum cost before a specialist request starts. UTF-8 bytes of the
 * complete serialized conversation (including tool-use/tool-result blocks) and tool schemas
 * bound input size; the fixed allowance covers message framing. This keeps read-only tool loops
 * inside the same specialist budget instead of bypassing it or rejecting their second turn.
 */
function specialistRequestReservation(params: CreateMessageParams): {
  maximumCostUsd: number;
  inputBytes: number;
} {
  if (params.model && params.model !== DEFAULT_MODEL) {
    throw new AppException(
      'SPECIALIST_AGENT_MODEL_UNSUPPORTED_FOR_BUDGET',
      'Specialist AI budgets currently support the configured default model only.',
      HttpStatus.BAD_REQUEST,
    );
  }
  let serializedInput: string;
  try {
    serializedInput = JSON.stringify({
      system: params.system ?? '',
      messages: params.messages,
      tools: params.tools ?? [],
    });
  } catch {
    throw new AppException(
      'SPECIALIST_AGENT_INPUT_SIZE_UNAVAILABLE',
      'This specialist request could not be measured safely and was not sent to the AI provider.',
      HttpStatus.BAD_REQUEST,
    );
  }
  const inputBytes = Buffer.byteLength(serializedInput, 'utf8');
  const inputTokenUpperBound = inputBytes + 256;
  const maxOutputTokens = params.maxTokens ?? DEFAULT_MAX_TOKENS;
  return {
    maximumCostUsd: Number(
      (
        inputTokenUpperBound * HAIKU_INPUT_COST_PER_TOKEN +
        maxOutputTokens * HAIKU_OUTPUT_COST_PER_TOKEN
      ).toFixed(6),
    ),
    inputBytes,
  };
}

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
    private readonly config: ConfigService,
  ) {}

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

    const providerStartedAt = Date.now();
    let response: Awaited<
      ReturnType<typeof axios.post<{ data: { url: string }[] }>>
    >;
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
      await this.logProviderFailure(
        businessId,
        'generate_image',
        Math.max(0, Date.now() - providerStartedAt),
        undefined,
        undefined,
        describeAiProviderFailure(error).code,
      ).catch(() => undefined);
      throw error;
    }

    await this.prisma.aiCallLog.create({
      data: {
        businessId,
        kind: 'generate_image',
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: IMAGE_GENERATION_COST_USD,
        providerLatencyMs: Math.max(0, Date.now() - providerStartedAt),
        providerCallSucceeded: true,
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
    specialistAgentRunId?: string,
  ): Promise<CreateMessageResult> {
    if (params.model && params.model !== DEFAULT_MODEL) {
      throw new AppException(
        'AI_MODEL_COST_UNSUPPORTED',
        'This AI integration only supports its configured Claude model so usage and budgets remain accurately estimated.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.checkGuardrails(businessId, kind);
    let specialistRequestId: string | undefined;
    if (
      !specialistAgentRunId &&
      Object.values(SPECIALIST_AGENT_BUDGETS).some(
        (agentLimit) => agentLimit.kind === kind,
      )
    ) {
      throw new AppException(
        'SPECIALIST_AGENT_RUN_REQUIRED',
        'Specialist AI requests must be attached to their persisted run.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (specialistAgentRunId) {
      const run = businessId
        ? await this.prisma.specialistAgentRun.findFirst({
            where: { id: specialistAgentRunId, businessId },
            select: {
              id: true,
              agentKey: true,
              agentVersion: true,
              agentConfigVersion: true,
              moduleId: true,
            },
          })
        : null;
      if (!run) {
        throw new AppException(
          'SPECIALIST_AGENT_RUN_NOT_FOUND',
          'AI usage can only be attached to a specialist run in the same business.',
          HttpStatus.NOT_FOUND,
        );
      }
      const agentLimit = SPECIALIST_AGENT_BUDGETS[run.agentKey];
      if (!agentLimit) {
        throw new AppException(
          'SPECIALIST_AGENT_KEY_UNSUPPORTED',
          'AI usage is not enabled for this specialist agent type.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (kind !== agentLimit.kind) {
        throw new AppException(
          'SPECIALIST_AGENT_KIND_MISMATCH',
          'The AI request type does not match its specialist agent run.',
          HttpStatus.BAD_REQUEST,
        );
      }
      const requestReservation = specialistRequestReservation(params);
      try {
        specialistRequestId = await this.reserveSpecialistAgentRequest(
          businessId!,
          specialistAgentRunId,
          run.agentKey,
          agentLimit,
          requestReservation.maximumCostUsd,
          params.maxTokens ?? DEFAULT_MAX_TOKENS,
          requestReservation.inputBytes,
        );
      } catch (error) {
        const limitCode = this.specialistBudgetLimitCode(error);
        if (limitCode) {
          await this.recordSpecialistBudgetLimitEvent({
            businessId: businessId!,
            runId: run.id,
            agentKey: run.agentKey,
            moduleId: run.moduleId,
            agentVersion: run.agentVersion,
            agentConfigVersion: run.agentConfigVersion,
            limitCode,
          });
        }
        throw error;
      }
    }
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
    let result: CreateMessageResult;
    const providerStartedAt = Date.now();
    try {
      result = await this.claude.createMessage(params);
    } catch (error) {
      await this.logProviderFailure(
        businessId,
        kind,
        Math.max(0, Date.now() - providerStartedAt),
        voiceAgentVersionId,
        specialistAgentRunId,
        describeAiProviderFailure(error).code,
      ).catch(() => undefined);
      if (specialistRequestId) {
        await this.prisma.specialistAgentAiRequest
          .update({
            where: { id: specialistRequestId },
            data: { state: 'provider_failed', finishedAt: new Date() },
          })
          .catch(() => undefined);
      }
      throw error;
    }
    await this.recordUsage(
      businessId,
      kind,
      result,
      toolCalls,
      voiceAgentVersionId,
      specialistAgentRunId,
      Math.max(0, Date.now() - providerStartedAt),
    );
    if (specialistRequestId) {
      await this.prisma.specialistAgentAiRequest.update({
        where: { id: specialistRequestId },
        data: { state: 'provider_completed', finishedAt: new Date() },
      });
    }
    return result;
  }

  /**
   * Reserve the per-run and monthly request slots in a serialized business-scoped transaction.
   * Reservations count even if a provider call fails or the process exits before it can be finalized.
   */
  private async reserveSpecialistAgentRequest(
    businessId: string,
    runId: string,
    agentKey: string,
    agentLimit: {
      policy: PolicyKey;
      spendPolicy: PolicyKey;
      label: string;
      kind: string;
    },
    reservedCostUsd: number,
    requestedMaxOutputTokens: number,
    requestedInputBytes: number,
  ): Promise<string> {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM businesses WHERE id = ${businessId} FOR UPDATE
      `;
      const business = await tx.business.findUnique({
        where: { id: businessId },
        select: { policies: true },
      });
      if (!business) {
        throw new AppException(
          'SPECIALIST_AGENT_BUSINESS_NOT_FOUND',
          'The business for this agent request could not be found.',
          HttpStatus.NOT_FOUND,
        );
      }

      const policies = resolvePolicies(business);
      const maxOutputTokensPerRequest = policies.num(
        'agents.specialistMaxOutputTokensPerRequest',
      );
      if (
        maxOutputTokensPerRequest !== null &&
        requestedMaxOutputTokens > maxOutputTokensPerRequest
      ) {
        throw new AppException(
          'SPECIALIST_AGENT_OUTPUT_TOKEN_LIMIT_REACHED',
          `This specialist request asks for ${requestedMaxOutputTokens} output tokens, above the configured limit (${maxOutputTokensPerRequest}). Lower the request or raise the limit in Settings → AI & Governance.`,
          HttpStatus.FORBIDDEN,
        );
      }
      const maxInputBytesPerRequest = policies.num(
        'agents.specialistMaxInputBytesPerRequest',
      );
      if (
        maxInputBytesPerRequest !== null &&
        requestedInputBytes > maxInputBytesPerRequest
      ) {
        throw new AppException(
          'SPECIALIST_AGENT_INPUT_SIZE_LIMIT_REACHED',
          `This specialist request contains ${requestedInputBytes.toLocaleString('en-US')} serialized input bytes, above the configured limit (${maxInputBytesPerRequest.toLocaleString('en-US')}). Reduce the request or raise the limit in Settings → AI & Governance.`,
          HttpStatus.FORBIDDEN,
        );
      }
      const perRunLimit = policies.num(
        'agents.specialistMaxProviderRequestsPerRun',
      );
      const requestsThisRun = await tx.specialistAgentAiRequest.count({
        where: { businessId, runId },
      });
      if (perRunLimit !== null && requestsThisRun >= perRunLimit) {
        throw new AppException(
          'SPECIALIST_AGENT_RUN_REQUEST_LIMIT_REACHED',
          `This specialist run has reached its AI provider request limit (${perRunLimit}). Start a new review or raise the limit in Settings → AI & Governance.`,
          HttpStatus.FORBIDDEN,
        );
      }

      const limit = policies.num(agentLimit.policy);
      const used = await tx.specialistAgentAiRequest.count({
        where: {
          businessId,
          agentKey,
          createdAt: { gte: monthStart },
        },
      });
      if (limit !== null && used >= limit) {
        throw new AppException(
          'SPECIALIST_AGENT_MONTHLY_REQUEST_LIMIT_REACHED',
          `${agentLimit.label} has reached its monthly AI request limit (${limit}). Raise it in Settings → AI & Governance or wait until the next UTC month.`,
          HttpStatus.FORBIDDEN,
        );
      }

      const spendLimit = policies.num(agentLimit.spendPolicy);
      if (spendLimit !== null) {
        const [logged, outstanding] = await Promise.all([
          tx.aiCallLog.aggregate({
            where: {
              businessId,
              kind: agentLimit.kind,
              createdAt: { gte: monthStart },
            },
            _sum: { inputTokens: true, outputTokens: true },
          }),
          tx.specialistAgentAiRequest.aggregate({
            where: {
              businessId,
              agentKey,
              createdAt: { gte: monthStart },
              state: { in: ['reserved', 'provider_failed'] },
            },
            _sum: { reservedCostUsd: true },
          }),
        ]);
        const estimatedUsedUsd =
          estimateHaikuCostUsd(
            Number(logged._sum.inputTokens ?? 0),
            Number(logged._sum.outputTokens ?? 0),
          ) + Number(outstanding._sum.reservedCostUsd ?? 0);
        if (estimatedUsedUsd + reservedCostUsd > spendLimit + 1e-9) {
          throw new AppException(
            'SPECIALIST_AGENT_MONTHLY_BUDGET_REACHED',
            `${agentLimit.label} would exceed its monthly estimated AI spend budget ($${spendLimit.toFixed(2)}). Raise it in Settings → AI & Governance or wait until the next UTC month.`,
            HttpStatus.FORBIDDEN,
          );
        }
      }

      const reservation = await tx.specialistAgentAiRequest.create({
        data: {
          businessId,
          runId,
          agentKey,
          state: 'reserved',
          reservedCostUsd,
        },
        select: { id: true },
      });
      return reservation.id;
    });
  }

  /**
   * Store one redacted, durable budget event per agent and UTC month. It is written after the
   * reservation transaction rolls back, so the denial evidence survives the typed refusal.
   */
  private specialistBudgetLimitCode(error: unknown): string | null {
    if (!(error instanceof AppException)) return null;
    const response = error.getResponse();
    if (!response || typeof response !== 'object' || !('code' in response))
      return null;
    const code = response.code;
    return typeof code === 'string' &&
      [
        'SPECIALIST_AGENT_RUN_REQUEST_LIMIT_REACHED',
        'SPECIALIST_AGENT_MONTHLY_REQUEST_LIMIT_REACHED',
        'SPECIALIST_AGENT_MONTHLY_BUDGET_REACHED',
      ].includes(code)
      ? code
      : null;
  }

  private async recordSpecialistBudgetLimitEvent(input: {
    businessId: string;
    runId: string;
    agentKey: string;
    moduleId: string;
    agentVersion: string;
    agentConfigVersion: number | null;
    limitCode: string;
  }): Promise<void> {
    const occurredAt = new Date();
    const month = `${occurredAt.getUTCFullYear()}-${String(
      occurredAt.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    const eventId = randomUUID();
    const budgetScopeId = `${input.agentKey}:${input.limitCode}:${month}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM businesses WHERE id = ${input.businessId} FOR UPDATE
      `;
      const existing = await tx.auditLog.findFirst({
        where: {
          businessId: input.businessId,
          action: 'agent.budget.limit_reached',
          entity: 'SpecialistAgentBudget',
          entityId: budgetScopeId,
        },
        select: { id: true },
      });
      if (existing) return;

      await tx.auditLog.create({
        data: {
          id: eventId,
          businessId: input.businessId,
          action: 'agent.budget.limit_reached',
          entity: 'SpecialistAgentBudget',
          entityId: budgetScopeId,
          createdAt: occurredAt,
          after: {
            event_id: eventId,
            event_name: 'agent.budget.limit_reached',
            occurred_at: occurredAt.toISOString(),
            source_module: input.moduleId,
            entity_id: input.runId,
            entity_version:
              input.agentConfigVersion === null
                ? input.agentVersion
                : String(input.agentConfigVersion),
            schema_version: 1,
            correlation_id: input.runId,
            agent_key: input.agentKey,
            limit_code: input.limitCode,
          },
        },
      });
    });
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
    specialistAgentRunId?: string,
    providerLatencyMs?: number,
  ): Promise<void> {
    await this.logCall(
      businessId,
      kind,
      result,
      toolCalls,
      voiceAgentVersionId,
      specialistAgentRunId,
      providerLatencyMs,
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
    specialistAgentRunId?: string,
    providerLatencyMs?: number,
  ): Promise<void> {
    const cost = estimateHaikuCostUsd(result.inputTokens, result.outputTokens);

    const log = await this.prisma.aiCallLog.create({
      data: {
        businessId,
        kind,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        estimatedCostUsd: cost,
        toolCalls: toolCalls as Prisma.InputJsonValue,
        voiceAgentVersionId,
        specialistAgentRunId,
        providerLatencyMs,
        providerCallSucceeded: true,
      },
    });
    if (businessId && kind === 'voice_entry') {
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

  private async logProviderFailure(
    businessId: string | undefined,
    kind: string,
    providerLatencyMs: number,
    voiceAgentVersionId?: string,
    specialistAgentRunId?: string,
    providerFailureCode?: string,
  ): Promise<void> {
    await this.prisma.aiCallLog.create({
      data: {
        businessId,
        kind,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
        providerLatencyMs,
        providerCallSucceeded: false,
        providerFailureCode,
        voiceAgentVersionId,
        specialistAgentRunId,
      },
    });
  }
}
