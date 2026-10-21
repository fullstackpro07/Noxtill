import { createHash, randomUUID } from 'crypto';
import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AiInfraService } from '../ai/ai-infra.service';
import { describeAiProviderFailure } from '../ai/ai-provider-error.util';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  RollbackVoiceAiAgentDto,
  SaveVoiceAiAgentDraftDto,
  VOICE_AI_AGENT_TEMPLATES,
  VOICE_AI_AGENT_TOOLS,
  VOICE_AI_TEST_INTENTS,
  VOICE_REALTIME_VOICES,
} from './dto/voice-ai-agent.dto';
import { VOICE_ERROR_CODES } from './voice.constants';
import type { VoiceAgentControls } from './voice-agent-controls.util';
import { VoiceRealtimeSandboxService } from './voice-realtime-sandbox.service';
import {
  snapshotKnowledge,
  type VoiceKnowledgeSnapshot,
} from './voice-knowledge-snapshot.util';
import {
  VOICE_AGENT_AUTHORITY_POLICY,
  voicePromptConfiguration,
  voicePromptData,
} from './voice-prompt-policy.util';
import {
  buildSafetyReviewPrompt,
  parseSafetyReview,
  type SafetyReview,
} from './voice-safety-review.util';

type AgentConfig = VoiceAgentControls & {
  agentName: string;
  template: string;
  purpose: string;
  voiceStyle: string;
  instructions: string;
  exclusions?: string[];
  dialogue?: {
    greeting?: string;
    disclosures?: string[];
    requiredQuestions?: string[];
    clarificationPrompt?: string;
    edgeCases?: string[];
  };
  realtimeVoice?: string;
  escalationGuidance: string;
  languages: string[];
  toolPermissions?: string[];
  knowledgeSourceIds?: string[];
  knowledgeSnapshots?: VoiceKnowledgeSnapshot[];
  assignedOwnerBusinessUserId?: string | null;
  maxTokensPerResponse?: number;
  monthlyBudgetUsd?: number | null;
};

type AgentTestResult = {
  id: string;
  version: number;
  passed: boolean;
  evaluationStatus: 'not_evaluated' | 'passed' | 'failed';
  assertionFailures: string[];
  expectedIntent: string | null;
  actualIntent: string | null;
  response: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
};

type AgentScenarioChecks = {
  mustInclude?: string[];
  mustNotInclude?: string[];
  expectedIntent?: (typeof VOICE_AI_TEST_INTENTS)[number];
};

const VALID_TEMPLATES = new Set<string>(VOICE_AI_AGENT_TEMPLATES);

@Injectable()
export class VoiceAiAgentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly aiInfra: AiInfraService,
    @Optional() private readonly realtimeSandbox?: VoiceRealtimeSandboxService,
  ) {}

  async list(businessId: string) {
    const [agents, businessScope, internalOwners] = await Promise.all([
      this.tenantPrisma.client.voiceAiAgent.findMany({
        where: { businessId },
        include: {
          versions: {
            orderBy: { version: 'desc' },
            take: 20,
            include: {
              testRuns: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                  id: true,
                  passed: true,
                  response: true,
                  errorCode: true,
                  errorMessage: true,
                  createdAt: true,
                  inputTokens: true,
                  outputTokens: true,
                  expectedIntent: true,
                  actualIntent: true,
                },
              },
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
      }),
      this.tenantPrisma.client.business.findUnique({
        where: { id: businessId },
        select: { id: true, name: true, parentId: true },
      }),
      this.tenantPrisma.client.businessUser.findMany({
        where: { businessId, active: true },
        select: {
          id: true,
          role: true,
          user: { select: { name: true } },
          voiceAgentProfile: { select: { id: true, active: true } },
        },
        orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
      }),
    ]);
    const knowledgeSources =
      await this.tenantPrisma.client.voiceKnowledgeEntry.findMany({
        where: { businessId, active: true },
        select: { id: true, title: true, kind: true },
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        take: 100,
      });
    const versionIds = agents.flatMap((agent) =>
      agent.versions.map((version) => version.id),
    );
    const monthStart = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
    );
    const spendRows = versionIds.length
      ? await this.tenantPrisma.client.aiCallLog.groupBy({
          by: ['voiceAgentVersionId'],
          where: {
            businessId,
            voiceAgentVersionId: { in: versionIds },
            createdAt: { gte: monthStart },
          },
          _sum: { estimatedCostUsd: true },
        })
      : [];
    const spendByVersion = new Map(
      spendRows.map((row) => [
        row.voiceAgentVersionId,
        Number(row._sum.estimatedCostUsd ?? 0),
      ]),
    );

    return {
      templates: VOICE_AI_AGENT_TEMPLATES,
      tools: VOICE_AI_AGENT_TOOLS,
      realtimeVoices: VOICE_REALTIME_VOICES,
      businessScope: businessScope
        ? {
            id: businessScope.id,
            name: businessScope.name,
            isBranch: businessScope.parentId !== null,
          }
        : null,
      internalOwners: internalOwners.map((owner) => ({
        id: owner.id,
        name: owner.user.name,
        role: owner.role,
        hasActiveVoiceProfile: Boolean(owner.voiceAgentProfile?.active),
      })),
      knowledgeSources,
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        template: agent.template,
        status: agent.status,
        currentDraftVersionId: agent.currentDraftVersionId,
        publishedVersionId: agent.publishedVersionId,
        versions: agent.versions.map((version) => ({
          id: version.id,
          version: version.version,
          config: version.config as unknown as AgentConfig,
          monthlySpendUsd: spendByVersion.get(version.id) ?? 0,
          checksum: version.checksum,
          publishedAt: version.publishedAt?.toISOString() ?? null,
          approvedAt: version.approvedAt?.toISOString() ?? null,
          approvedByUserId: version.approvedByUserId,
          createdAt: version.createdAt.toISOString(),
          latestTest: version.testRuns[0]
            ? {
                ...version.testRuns[0],
                createdAt: version.testRuns[0].createdAt.toISOString(),
              }
            : null,
        })),
      })),
      limitations: {
        tools:
          'Published versions carry a server-enforced tool allowlist. Live audio supports service and slot lookup, minimal caller matching, verified booking changes, support tickets and unsent message drafts. Booking and customer writes require caller keypad confirmation. Knowledge sources, availability, pilot allocation, concurrency, duration and tool limits are pinned per version.',
        liveRouting:
          'Published versions are pinned to new inbound calls. If no fixed transfer number is configured, an AI transfer can reserve a fresh available human staff profile with phone capacity; a classified caller topic prefers an exact matching skill tag, with capacity-based fallback when none match. Browser-phone readiness is shown in Agent Workspace.',
      },
    };
  }

  async create(
    businessId: string,
    actorUserId: string,
    dto: SaveVoiceAiAgentDraftDto,
  ) {
    const name = this.cleanText(dto.name, 120);
    const config = await this.normalizeConfig(businessId, dto);
    this.assertTemplate(dto.template);

    const existing = await this.tenantPrisma.client.voiceAiAgent.findFirst({
      where: { businessId, name },
      select: { id: true },
    });
    if (existing) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_NAME_TAKEN,
        'An AI agent with this name already exists.',
        HttpStatus.CONFLICT,
      );
    }

    const agentId = randomUUID();
    const versionId = randomUUID();
    const agent = await this.tenantPrisma.client.voiceAiAgent.create({
      data: {
        id: agentId,
        businessId,
        name,
        template: dto.template,
        status: 'draft',
        currentDraftVersionId: versionId,
        createdByUserId: actorUserId,
        versions: {
          create: {
            id: versionId,
            businessId,
            version: 1,
            config: config as unknown as Prisma.InputJsonValue,
            checksum: this.checksum(config),
            createdByUserId: actorUserId,
          },
        },
      },
    });

    await this.audit.log({
      entity: 'VoiceAiAgent',
      entityId: agent.id,
      action: 'voice.ai_agent_created',
      after: { name, template: dto.template, version: 1 },
    });
    return { id: agent.id, name: agent.name, status: agent.status, version: 1 };
  }

  async saveDraft(
    businessId: string,
    actorUserId: string,
    agentId: string,
    dto: SaveVoiceAiAgentDraftDto,
  ) {
    const agent = await this.getAgent(businessId, agentId);
    if (agent.template !== dto.template) this.assertTemplate(dto.template);
    const name = this.cleanText(dto.name, 120);
    const conflict = await this.tenantPrisma.client.voiceAiAgent.findFirst({
      where: { businessId, name, id: { not: agentId } },
      select: { id: true },
    });
    if (conflict) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_NAME_TAKEN,
        'An AI agent with this name already exists.',
        HttpStatus.CONFLICT,
      );
    }

    const config = await this.normalizeConfig(businessId, dto);
    const versionId = randomUUID();
    const version = await this.tenantPrisma.client.$transaction(async (tx) => {
      const latest = await tx.voiceAiAgentVersion.findFirst({
        where: { businessId, agentId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const nextVersion = (latest?.version ?? 0) + 1;
      await tx.voiceAiAgentVersion.create({
        data: {
          id: versionId,
          businessId,
          agentId,
          version: nextVersion,
          config: config as unknown as Prisma.InputJsonValue,
          checksum: this.checksum(config),
          createdByUserId: actorUserId,
        },
      });
      const updated = await tx.voiceAiAgent.updateMany({
        where: { id: agentId, businessId },
        data: {
          name,
          template: dto.template,
          currentDraftVersionId: versionId,
          status: agent.status === 'active' ? 'active' : 'draft',
        },
      });
      if (updated.count !== 1) throw this.notFound();
      return nextVersion;
    });
    await this.audit.log({
      entity: 'VoiceAiAgentVersion',
      entityId: versionId,
      action: 'voice.ai_agent_draft_saved',
      after: { agentId, version, checksum: this.checksum(config) },
    });
    return { id: versionId, version, checksum: this.checksum(config) };
  }

  async previewVoice(
    businessId: string,
    actorUserId: string,
    agentId: string,
    voice: string,
  ) {
    const agent = await this.getAgent(businessId, agentId);
    const versionId = agent.currentDraftVersionId ?? agent.publishedVersionId;
    if (!versionId)
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_DRAFT_REQUIRED,
        'Save or publish an AI agent version before previewing its voice.',
        HttpStatus.CONFLICT,
      );
    const version =
      await this.tenantPrisma.client.voiceAiAgentVersion.findFirst({
        where: { id: versionId, businessId, agentId },
        select: { config: true },
      });
    if (!version) throw this.notFound();
    if (!this.realtimeSandbox)
      throw new AppException(
        'VOICE_REALTIME_NOT_CONFIGURED',
        'OpenAI Realtime voice preview is not available on the server.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    const config = version.config as unknown as AgentConfig;
    return this.realtimeSandbox.previewVoice(
      businessId,
      actorUserId,
      versionId,
      voice,
      config.monthlyBudgetUsd,
    );
  }

  async testDraft(
    businessId: string,
    actorUserId: string,
    agentId: string,
    scenario: string,
    expectedVersionId?: string,
    checks?: AgentScenarioChecks,
  ): Promise<AgentTestResult> {
    const agent = await this.getAgent(businessId, agentId);
    const versionId = expectedVersionId ?? agent.currentDraftVersionId;
    if (!versionId) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_DRAFT_REQUIRED,
        'Save a draft before testing this agent.',
        HttpStatus.CONFLICT,
      );
    }
    const version =
      await this.tenantPrisma.client.voiceAiAgentVersion.findFirst({
        where: {
          id: versionId,
          businessId,
          agentId,
        },
      });
    if (!version) throw this.notFound();
    if (
      (version.config as unknown as AgentConfig).template === 'quality_analyst'
    ) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_TEMPLATE_UNAVAILABLE,
        'Quality Analyst does not answer live calls. Use Call Quality to run evidence-based review suggestions on a recorded call.',
        HttpStatus.CONFLICT,
      );
    }

    const config = version.config as unknown as AgentConfig;
    let response: string | null = null;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;
    let actualIntent: (typeof VOICE_AI_TEST_INTENTS)[number] | null = null;
    let outcomeFormatInvalid = false;
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const result =
        config.runtimeMode === 'realtime'
          ? await this.testRealtime(
              businessId,
              version.id,
              agent.name,
              agent.template,
              config,
              scenario,
              Boolean(checks?.expectedIntent),
            )
          : await this.aiInfra.createMessage(
              businessId,
              'voice_entry',
              {
                system: [
                  this.systemPrompt(agent.name, agent.template, config),
                  checks?.expectedIntent ? this.outcomeTestInstruction() : '',
                ]
                  .filter(Boolean)
                  .join('\n'),
                messages: [
                  {
                    role: 'user',
                    content: voicePromptData('Sandbox caller scenario', {
                      liveCall: false,
                      text: this.cleanText(scenario, 1000),
                    }),
                  },
                ],
                maxTokens: config.maxTokensPerResponse ?? 320,
                temperature: 0.2,
              },
              undefined,
              version.id,
            );
      response = result.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n')
        .trim()
        .slice(0, 2000);
      if (response && checks?.expectedIntent) {
        try {
          const parsed = JSON.parse(response) as {
            reply?: unknown;
            intent?: unknown;
          };
          if (
            typeof parsed.reply !== 'string' ||
            typeof parsed.intent !== 'string' ||
            !(VOICE_AI_TEST_INTENTS as readonly string[]).includes(
              parsed.intent,
            )
          ) {
            outcomeFormatInvalid = true;
          } else {
            response = parsed.reply.trim().slice(0, 2000);
            actualIntent =
              parsed.intent as (typeof VOICE_AI_TEST_INTENTS)[number];
          }
        } catch {
          outcomeFormatInvalid = true;
        }
      }
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      if (!response) {
        errorCode = 'AI_EMPTY_RESPONSE';
        errorMessage =
          'The AI provider returned no text for this sandbox test.';
      }
    } catch (error) {
      const safe = describeAiProviderFailure(error);
      errorCode = safe.code;
      errorMessage = safe.message;
    }

    const assertionFailures: string[] = [];
    if (outcomeFormatInvalid) {
      assertionFailures.push(
        'Expected a JSON reply with an allowed self-reported intent.',
      );
    }
    if (
      checks?.expectedIntent &&
      actualIntent &&
      actualIntent !== checks.expectedIntent
    ) {
      assertionFailures.push(
        `Expected outcome: ${checks.expectedIntent}; model reported: ${actualIntent}`,
      );
    }
    const mustInclude = (checks?.mustInclude ?? [])
      .map((phrase) => this.cleanText(phrase, 120))
      .filter(Boolean);
    const mustNotInclude = (checks?.mustNotInclude ?? [])
      .map((phrase) => this.cleanText(phrase, 120))
      .filter(Boolean);
    if (response) {
      const normalizedResponse = response.toLocaleLowerCase();
      for (const phrase of mustInclude) {
        if (!normalizedResponse.includes(phrase.toLocaleLowerCase())) {
          assertionFailures.push(`Required phrase not found: ${phrase}`);
        }
      }
      for (const phrase of mustNotInclude) {
        if (normalizedResponse.includes(phrase.toLocaleLowerCase())) {
          assertionFailures.push(`Forbidden phrase found: ${phrase}`);
        }
      }
    }
    if (assertionFailures.length && !errorCode) {
      errorCode = 'AI_SCENARIO_ASSERTION_FAILED';
      errorMessage = assertionFailures.join('; ').slice(0, 500);
    }
    const passed = Boolean(response && !errorCode);
    const evaluationStatus =
      mustInclude.length || mustNotInclude.length || checks?.expectedIntent
        ? passed
          ? 'passed'
          : 'failed'
        : 'not_evaluated';
    const previousTest =
      await this.tenantPrisma.client.voiceAiAgentTestRun.findFirst({
        where: { businessId, versionId: version.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
    const now = Date.now();
    const createdAt = new Date(
      previousTest && previousTest.createdAt.getTime() >= now
        ? previousTest.createdAt.getTime() + 1
        : now,
    );
    const testRun = await this.tenantPrisma.client.voiceAiAgentTestRun.create({
      data: {
        businessId,
        versionId: version.id,
        scenario: this.cleanText(scenario, 1000),
        response,
        expectedIntent: checks?.expectedIntent ?? null,
        actualIntent,
        passed,
        errorCode,
        errorMessage,
        inputTokens,
        outputTokens,
        createdByUserId: actorUserId,
        createdAt,
      },
    });
    await this.audit.log({
      entity: 'VoiceAiAgentTestRun',
      entityId: testRun.id,
      action: 'voice.ai_agent_tested',
      after: {
        agentId,
        version: version.version,
        passed,
        evaluationStatus,
        requiredPhraseCount: mustInclude.length,
        forbiddenPhraseCount: mustNotInclude.length,
        expectedIntent: checks?.expectedIntent ?? null,
        actualIntent,
        assertionFailureCount: assertionFailures.length,
        errorCode,
        inputTokens,
        outputTokens,
      },
    });
    return {
      id: testRun.id,
      version: version.version,
      passed,
      evaluationStatus,
      assertionFailures,
      expectedIntent: checks?.expectedIntent ?? null,
      actualIntent,
      response,
      errorCode,
      errorMessage,
      inputTokens,
      outputTokens,
      createdAt: testRun.createdAt.toISOString(),
    };
  }

  async testScenarioSuite(
    businessId: string,
    actorUserId: string,
    agentId: string,
    scenarios: string[],
    checks?: AgentScenarioChecks[],
    safetyReview = false,
  ) {
    const normalized = [...new Set(scenarios.map((value) => value.trim()))];
    if (
      normalized.length < 2 ||
      normalized.length > 8 ||
      normalized.some((value) => value.length < 3 || value.length > 1000) ||
      (checks !== undefined && checks.length !== normalized.length) ||
      (checks ?? []).some((check) => {
        const phrases = [
          ...(check.mustInclude ?? []),
          ...(check.mustNotInclude ?? []),
        ];
        return (
          (check.mustInclude?.length ?? 0) > 8 ||
          (check.mustNotInclude?.length ?? 0) > 8 ||
          phrases.some(
            (phrase) =>
              typeof phrase !== 'string' ||
              !phrase.trim() ||
              phrase.trim().length > 120,
          ) ||
          (check.expectedIntent !== undefined &&
            !(VOICE_AI_TEST_INTENTS as readonly string[]).includes(
              check.expectedIntent,
            ))
        );
      })
    ) {
      throw new AppException(
        'VOICE_AI_AGENT_SCENARIO_SUITE_INVALID',
        'Provide 2–8 distinct scenarios, each between 3 and 1000 characters.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const agent = await this.getAgent(businessId, agentId);
    if (!agent.currentDraftVersionId) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_DRAFT_REQUIRED,
        'Save a draft before testing this agent.',
        HttpStatus.CONFLICT,
      );
    }
    const versionId = agent.currentDraftVersionId;

    const results: AgentTestResult[] = [];
    for (const scenario of normalized) {
      const result = await this.testDraft(
        businessId,
        actorUserId,
        agentId,
        scenario,
        versionId,
        checks?.[results.length],
      );
      results.push(result);
      // A provider/config/budget failure is shared across the suite; do not
      // make more requests that are likely to fail or consume further budget.
      if (
        result.errorCode &&
        result.errorCode !== 'AI_SCENARIO_ASSERTION_FAILED'
      )
        break;
    }
    const reviews: SafetyReview[] = [];
    if (safetyReview) {
      for (const [index, result] of results.entries()) {
        reviews.push(
          result.response
            ? await this.reviewSafety(
                businessId,
                normalized[index],
                result.response,
              )
            : { verdict: 'not_run', reason: 'No reply to review.' },
        );
      }
    }
    const answered = results.filter(
      (result) => result.response !== null,
    ).length;
    const evaluated = results.filter(
      (result) => result.evaluationStatus !== 'not_evaluated',
    );
    const assertionPassed = evaluated.filter(
      (result) => result.evaluationStatus === 'passed',
    ).length;
    await this.audit.log({
      entity: 'VoiceAiAgent',
      entityId: agentId,
      action: 'voice.ai_agent_scenario_suite_tested',
      after: {
        requestedScenarioCount: normalized.length,
        scenarioCount: results.length,
        stoppedEarly: results.length < normalized.length,
        nonEmptyResponses: answered,
        evaluatedScenarioCount: evaluated.length,
        assertionPassedCount: assertionPassed,
        assertionFailedCount: evaluated.length - assertionPassed,
        version: results[0]?.version ?? null,
        testRunIds: results.map((result) => result.id),
        safetyReview: safetyReview
          ? {
              pass: reviews.filter((r) => r.verdict === 'pass').length,
              fail: reviews.filter((r) => r.verdict === 'fail').length,
              uncertainOrNotRun: reviews.filter(
                (r) => r.verdict === 'uncertain' || r.verdict === 'not_run',
              ).length,
            }
          : null,
      },
    });
    return {
      version: results[0]?.version ?? null,
      requestedScenarioCount: normalized.length,
      scenarioCount: results.length,
      stoppedEarly: results.length < normalized.length,
      nonEmptyResponses: answered,
      evaluatedScenarioCount: evaluated.length,
      assertionPassedCount: assertionPassed,
      assertionFailedCount: evaluated.length - assertionPassed,
      results: results.map((result, index) => ({
        ...result,
        safetyReview: safetyReview ? reviews[index] : null,
      })),
    };
  }

  /** Independent-model review of one reply; provider failure is reported as not_run, never pass. */
  private async reviewSafety(
    businessId: string,
    scenario: string,
    reply: string,
  ): Promise<SafetyReview> {
    try {
      const raw = await this.aiInfra.complete(
        businessId,
        buildSafetyReviewPrompt(scenario, reply),
        0,
        'voice_safety_review',
        300,
      );
      return parseSafetyReview(raw);
    } catch {
      return {
        verdict: 'not_run',
        reason: 'The safety reviewer could not be reached.',
      };
    }
  }

  private testRealtime(
    businessId: string,
    versionId: string,
    name: string,
    template: string,
    config: AgentConfig,
    scenario: string,
    requestOutcome: boolean,
  ) {
    if (!this.realtimeSandbox)
      throw new AppException(
        'VOICE_REALTIME_NOT_CONFIGURED',
        'OpenAI Realtime sandbox is not configured.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    return this.realtimeSandbox.test(
      businessId,
      versionId,
      [
        this.systemPrompt(name, template, config),
        requestOutcome ? this.outcomeTestInstruction() : '',
      ]
        .filter(Boolean)
        .join('\n'),
      this.cleanText(scenario, 1000),
      config.maxTokensPerResponse ?? 320,
      config.monthlyBudgetUsd,
    );
  }

  private outcomeTestInstruction(): string {
    return [
      'Sandbox evaluation output requirement: do not call tools or perform any action.',
      'Return exactly one JSON object and no markdown with keys "reply" and "intent".',
      'The intent must be one of: continue, book, message, transfer, end.',
      'Choose the next intended outcome for the supplied scenario. This is a self-reported test label only; no action is being executed.',
    ].join(' ');
  }

  async publish(
    businessId: string,
    actorUserId: string,
    actorRole: Role,
    agentId: string,
  ) {
    this.assertOwner(actorRole);
    const agent = await this.getAgent(businessId, agentId);
    if (agent.template === 'quality_analyst') {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_TEMPLATE_UNAVAILABLE,
        'Quality Analyst is an offline template only; live call publishing is not available.',
        HttpStatus.CONFLICT,
      );
    }
    if (!agent.currentDraftVersionId) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_DRAFT_REQUIRED,
        'Save a draft before publishing this agent.',
        HttpStatus.CONFLICT,
      );
    }
    const version =
      await this.tenantPrisma.client.voiceAiAgentVersion.findFirst({
        where: { id: agent.currentDraftVersionId, businessId, agentId },
        include: {
          testRuns: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { passed: true },
          },
        },
      });
    if (!version) throw this.notFound();
    if (
      (version.config as unknown as AgentConfig).template === 'quality_analyst'
    ) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_TEMPLATE_UNAVAILABLE,
        'Quality Analyst does not answer live calls. Use Call Quality to run evidence-based review suggestions on a recorded call.',
        HttpStatus.CONFLICT,
      );
    }
    if (version.testRuns.length === 0 || !version.testRuns[0].passed) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_TEST_REQUIRED,
        'The latest sandbox test on the current draft must pass before publishing.',
        HttpStatus.CONFLICT,
      );
    }
    if (!version.approvedAt || !version.approvedByUserId) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_APPROVAL_REQUIRED,
        'The current tested draft must be explicitly approved before it can be published.',
        HttpStatus.CONFLICT,
      );
    }

    await this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.voiceAiAgent.updateMany({
        where: { businessId, status: 'active', id: { not: agentId } },
        data: { status: 'paused' },
      });
      await tx.voiceAiAgentVersion.update({
        where: { id: version.id },
        data: { publishedAt: version.publishedAt ?? new Date() },
      });
      const published = await tx.voiceAiAgent.updateMany({
        where: {
          id: agentId,
          businessId,
          currentDraftVersionId: version.id,
        },
        data: { publishedVersionId: version.id, status: 'active' },
      });
      if (published.count !== 1) {
        throw new AppException(
          VOICE_ERROR_CODES.AI_AGENT_DRAFT_CHANGED,
          'The draft changed while publishing. Reload and test the latest draft.',
          HttpStatus.CONFLICT,
        );
      }
    });
    await this.audit.log({
      entity: 'VoiceAiAgent',
      entityId: agentId,
      action: 'voice.ai_agent_published',
      before: {
        publishedVersionId: agent.publishedVersionId,
        status: agent.status,
      },
      after: {
        publishedVersionId: version.id,
        version: version.version,
        actorUserId,
      },
    });
    return {
      id: agentId,
      status: 'active',
      publishedVersionId: version.id,
      version: version.version,
    };
  }

  async approve(
    businessId: string,
    actorUserId: string,
    actorRole: Role,
    agentId: string,
  ) {
    this.assertOwner(actorRole);
    const agent = await this.getAgent(businessId, agentId);
    if (!agent.currentDraftVersionId) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_DRAFT_REQUIRED,
        'Save a draft before approving this agent.',
        HttpStatus.CONFLICT,
      );
    }
    const version =
      await this.tenantPrisma.client.voiceAiAgentVersion.findFirst({
        where: { id: agent.currentDraftVersionId, businessId, agentId },
        include: {
          testRuns: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { passed: true },
          },
        },
      });
    if (!version) throw this.notFound();
    if (version.testRuns.length === 0 || !version.testRuns[0].passed) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_TEST_REQUIRED,
        'The latest sandbox test on the current draft must pass before approval.',
        HttpStatus.CONFLICT,
      );
    }
    const approvedAt = version.approvedAt ?? new Date();
    await this.tenantPrisma.client.voiceAiAgentVersion.updateMany({
      where: { id: version.id, businessId, agentId },
      data: { approvedAt, approvedByUserId: actorUserId },
    });
    await this.audit.log({
      entity: 'VoiceAiAgentVersion',
      entityId: version.id,
      action: 'voice.ai_agent_approved',
      after: { agentId, version: version.version, actorUserId },
    });
    return {
      id: version.id,
      version: version.version,
      approvedAt: approvedAt.toISOString(),
      approvedByUserId: actorUserId,
    };
  }

  async rollback(
    businessId: string,
    actorUserId: string,
    actorRole: Role,
    agentId: string,
    dto: RollbackVoiceAiAgentDto,
  ) {
    this.assertOwner(actorRole);
    const agent = await this.getAgent(businessId, agentId);
    const target = await this.tenantPrisma.client.voiceAiAgentVersion.findFirst(
      {
        where: {
          id: dto.versionId,
          businessId,
          agentId,
          publishedAt: { not: null },
        },
        select: { id: true, version: true, config: true },
      },
    );
    if (!target) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_VERSION_NOT_PUBLISHED,
        'Choose a previously published version of this agent.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      (target.config as unknown as AgentConfig).template === 'quality_analyst'
    ) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_TEMPLATE_UNAVAILABLE,
        'Quality Analyst is an offline template only; live call publishing is not available.',
        HttpStatus.CONFLICT,
      );
    }
    await this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.voiceAiAgent.updateMany({
        where: { businessId, status: 'active', id: { not: agentId } },
        data: { status: 'paused' },
      });
      const restored = await tx.voiceAiAgent.updateMany({
        where: { id: agentId, businessId },
        data: { publishedVersionId: target.id, status: 'active' },
      });
      if (restored.count !== 1) throw this.notFound();
    });
    await this.audit.log({
      entity: 'VoiceAiAgent',
      entityId: agentId,
      action: 'voice.ai_agent_rolled_back',
      before: { publishedVersionId: agent.publishedVersionId },
      after: {
        publishedVersionId: target.id,
        version: target.version,
        reason: this.cleanText(dto.reason, 500),
        actorUserId,
      },
    });
    return {
      id: agentId,
      status: 'active',
      publishedVersionId: target.id,
      version: target.version,
    };
  }

  async pause(businessId: string, actorUserId: string, agentId: string) {
    const agent = await this.getAgent(businessId, agentId);
    await this.tenantPrisma.client.voiceAiAgent.update({
      where: { id: agentId },
      data: { status: 'paused' },
    });
    await this.audit.log({
      entity: 'VoiceAiAgent',
      entityId: agentId,
      action: 'voice.ai_agent_paused',
      before: {
        status: agent.status,
        publishedVersionId: agent.publishedVersionId,
      },
      after: { status: 'paused', actorUserId },
    });
    return { id: agentId, status: 'paused' };
  }

  private async getAgent(businessId: string, id: string) {
    const agent = await this.tenantPrisma.client.voiceAiAgent.findFirst({
      where: { id, businessId },
    });
    if (!agent) throw this.notFound();
    return agent;
  }

  private notFound() {
    return new AppException(
      VOICE_ERROR_CODES.AI_AGENT_NOT_FOUND,
      'AI agent was not found in this business.',
      HttpStatus.NOT_FOUND,
    );
  }

  private assertTemplate(template: string) {
    if (!VALID_TEMPLATES.has(template)) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_TEMPLATE_INVALID,
        'Choose a supported AI agent template.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private assertOwner(role: Role) {
    if (role !== Role.owner) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_OWNER_REQUIRED,
        'Only the business owner can approve, publish or roll back a live AI agent.',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async normalizeConfig(
    businessId: string,
    dto: SaveVoiceAiAgentDraftDto,
  ): Promise<AgentConfig> {
    const business = await this.tenantPrisma.client.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    const timeZone = dto.timeZone?.trim() || business?.timezone || 'UTC';
    try {
      new Intl.DateTimeFormat('en', { timeZone }).format();
    } catch {
      throw new AppException(
        'VOICE_AGENT_TIMEZONE_INVALID',
        'Choose a valid IANA time zone.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      dto.weeklyHours?.some((h) => h.opens >= h.closes) ||
      dto.holidays?.some(
        (date) =>
          Number.isNaN(Date.parse(date)) ||
          new Date(date).toISOString().slice(0, 10) !== date,
      )
    ) {
      throw new AppException(
        'VOICE_AGENT_HOURS_INVALID',
        'Use valid holiday dates and same-day opening ranges whose end is after their start.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      dto.realtimeVoice &&
      !(VOICE_REALTIME_VOICES as readonly string[]).includes(dto.realtimeVoice)
    ) {
      throw new AppException(
        'VOICE_AGENT_REALTIME_VOICE_INVALID',
        'Choose a supported realtime voice.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const knowledgeSourceIds = [...new Set(dto.knowledgeSourceIds ?? [])];
    const assignedOwnerBusinessUserId =
      dto.assignedOwnerBusinessUserId?.trim() || null;
    if (assignedOwnerBusinessUserId) {
      const owner = await this.tenantPrisma.client.businessUser.findFirst({
        where: {
          id: assignedOwnerBusinessUserId,
          businessId,
          active: true,
        },
        select: { id: true },
      });
      if (!owner) {
        throw new AppException(
          'VOICE_AGENT_OWNER_INVALID',
          'Choose an active internal owner from this business branch.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const matchingSources = knowledgeSourceIds.length
      ? await this.tenantPrisma.client.voiceKnowledgeEntry.findMany({
          where: { businessId, active: true, id: { in: knowledgeSourceIds } },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            title: true,
            kind: true,
            content: true,
            updatedAt: true,
          },
        })
      : [];
    if (matchingSources.length !== knowledgeSourceIds.length) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_KNOWLEDGE_SOURCE_INVALID,
        'Choose active knowledge sources that belong to this business.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return {
      agentName: this.cleanText(dto.name, 120),
      template: dto.template,
      purpose: this.cleanText(dto.purpose, 240),
      voiceStyle: this.cleanText(dto.voiceStyle, 160),
      instructions: this.cleanText(dto.instructions, 2000),
      exclusions: [
        ...new Set(
          (dto.exclusions ?? [])
            .map((item) => this.cleanText(item, 240))
            .filter(Boolean),
        ),
      ],
      dialogue: {
        greeting: dto.dialogue?.greeting
          ? this.cleanText(dto.dialogue.greeting, 400)
          : '',
        disclosures: [
          ...new Set(
            (dto.dialogue?.disclosures ?? [])
              .map((item) => this.cleanText(item, 300))
              .filter(Boolean),
          ),
        ],
        requiredQuestions: [
          ...new Set(
            (dto.dialogue?.requiredQuestions ?? [])
              .map((item) => this.cleanText(item, 300))
              .filter(Boolean),
          ),
        ],
        clarificationPrompt: dto.dialogue?.clarificationPrompt
          ? this.cleanText(dto.dialogue.clarificationPrompt, 400)
          : '',
        edgeCases: [
          ...new Set(
            (dto.dialogue?.edgeCases ?? [])
              .map((item) => this.cleanText(item, 300))
              .filter(Boolean),
          ),
        ],
      },
      realtimeVoice: (VOICE_REALTIME_VOICES as readonly string[]).includes(
        dto.realtimeVoice ?? '',
      )
        ? dto.realtimeVoice
        : 'marin',
      escalationGuidance: this.cleanText(dto.escalationGuidance, 500),
      languages: [
        ...new Set(
          (dto.languages ?? [])
            .map((value) => this.cleanText(value, 40))
            .filter(Boolean),
        ),
      ],
      toolPermissions: [
        ...new Set(
          (
            dto.toolPermissions ?? ['book', 'message', 'transfer', 'end']
          ).filter((tool) =>
            (VOICE_AI_AGENT_TOOLS as readonly string[]).includes(tool),
          ),
        ),
      ],
      knowledgeSourceIds,
      knowledgeSnapshots: matchingSources.map(snapshotKnowledge),
      assignedOwnerBusinessUserId,
      maxTokensPerResponse: dto.maxTokensPerResponse ?? 320,
      monthlyBudgetUsd: dto.monthlyBudgetUsd ?? null,
      runtimeMode: dto.runtimeMode ?? 'recorded_turns',
      inboundEnabled: dto.inboundEnabled ?? true,
      outboundEnabled: dto.outboundEnabled ?? true,
      timeZone,
      weeklyHours: (dto.weeklyHours ?? []).map((h) => ({
        day: h.day,
        opens: h.opens,
        closes: h.closes,
      })),
      holidays: [...new Set(dto.holidays ?? [])].sort(),
      rolloutPercent: dto.rolloutPercent ?? 100,
      maxConcurrentCalls: dto.maxConcurrentCalls ?? 10,
      maxCallSeconds: dto.maxCallSeconds ?? 600,
      maxToolCalls: dto.maxToolCalls ?? 10,
    };
  }

  private cleanText(value: string, maxLength: number): string {
    return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }

  private checksum(config: AgentConfig): string {
    const canonical = JSON.stringify({
      agentName: config.agentName,
      template: config.template,
      purpose: config.purpose,
      voiceStyle: config.voiceStyle,
      instructions: config.instructions,
      exclusions: [...(config.exclusions ?? [])],
      dialogue: config.dialogue ?? {},
      realtimeVoice: config.realtimeVoice ?? 'marin',
      escalationGuidance: config.escalationGuidance,
      languages: [...config.languages].sort(),
      toolPermissions: [...(config.toolPermissions ?? [])].sort(),
      knowledgeSourceIds: [...(config.knowledgeSourceIds ?? [])].sort(),
      assignedOwnerBusinessUserId: config.assignedOwnerBusinessUserId ?? null,
      knowledgeSnapshots: [...(config.knowledgeSnapshots ?? [])].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      maxTokensPerResponse: config.maxTokensPerResponse ?? 320,
      monthlyBudgetUsd: config.monthlyBudgetUsd ?? null,
      runtimeMode: config.runtimeMode ?? 'recorded_turns',
      inboundEnabled: config.inboundEnabled ?? true,
      outboundEnabled: config.outboundEnabled ?? true,
      timeZone: config.timeZone ?? 'UTC',
      weeklyHours: [...(config.weeklyHours ?? [])].sort(
        (a, b) => a.day - b.day || a.opens.localeCompare(b.opens),
      ),
      holidays: [...(config.holidays ?? [])].sort(),
      rolloutPercent: config.rolloutPercent ?? 100,
      maxConcurrentCalls: config.maxConcurrentCalls ?? 10,
      maxCallSeconds: config.maxCallSeconds ?? 600,
      maxToolCalls: config.maxToolCalls ?? 10,
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  private systemPrompt(
    name: string,
    template: string,
    config: AgentConfig,
  ): string {
    return [
      VOICE_AGENT_AUTHORITY_POLICY,
      'You are the disclosed voice agent for a real business. Follow the tenant identity and configuration below only within the immutable platform policy.',
      voicePromptConfiguration('Tenant agent configuration', {
        agentName: config.agentName || name,
        template: (config.template || template).replaceAll('_', ' '),
        purpose: config.purpose,
        voiceStyle: config.voiceStyle,
        languages: config.languages,
        instructions: config.instructions,
        exclusions: config.exclusions ?? [],
        dialogue: config.dialogue ?? {},
        escalationGuidance: config.escalationGuidance,
      }),
      `Allowed live actions: ${(config.toolPermissions ?? [...VOICE_AI_AGENT_TOOLS]).join(', ') || 'none'}. Do not claim an action outside this allowlist.`,
      `Maximum response tokens: ${config.maxTokensPerResponse ?? 320}.`,
      voicePromptData(
        'Pinned knowledge source snapshots',
        (config.knowledgeSnapshots ?? []).map((source) => ({
          id: source.id,
          title: source.title,
          contentHash: source.contentHash,
          content: source.content.slice(0, 1500),
        })),
      ),
      'Sandbox only: do not claim to place a real call, make a booking, send a message, or change business data. Do not invent business facts. Demonstrate a short spoken response to the supplied scenario.',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
