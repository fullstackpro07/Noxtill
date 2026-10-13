import { createHash, randomUUID } from 'crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { AiInfraService } from '../ai/ai-infra.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  RollbackVoiceAiAgentDto,
  SaveVoiceAiAgentDraftDto,
  VOICE_AI_AGENT_TEMPLATES,
  VOICE_AI_AGENT_TOOLS,
} from './dto/voice-ai-agent.dto';
import { VOICE_ERROR_CODES } from './voice.constants';

type AgentConfig = {
  agentName: string;
  template: string;
  purpose: string;
  voiceStyle: string;
  instructions: string;
  escalationGuidance: string;
  languages: string[];
  toolPermissions?: string[];
  knowledgeSourceIds?: string[];
  maxTokensPerResponse?: number;
};

const VALID_TEMPLATES = new Set<string>(VOICE_AI_AGENT_TEMPLATES);

@Injectable()
export class VoiceAiAgentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly aiInfra: AiInfraService,
  ) {}

  async list(businessId: string) {
    const agents = await this.tenantPrisma.client.voiceAiAgent.findMany({
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
              },
            },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });
    const knowledgeSources =
      await this.tenantPrisma.client.voiceKnowledgeEntry.findMany({
        where: { businessId, active: true },
        select: { id: true, title: true, kind: true },
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        take: 100,
      });

    return {
      templates: VOICE_AI_AGENT_TEMPLATES,
      tools: VOICE_AI_AGENT_TOOLS,
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
          'Each published agent version carries a server-enforced allowlist for booking, messages, transfers and ending calls; knowledge retrieval is restricted to selected active business sources and each AI response has a token ceiling.',
        liveRouting:
          'Published versions are pinned to new inbound calls. If no fixed transfer number is configured, an AI transfer can reserve a fresh available human staff profile with phone capacity; a classified caller topic prefers an exact matching skill tag, with capacity-based fallback when none match. Browser softphone is not configured.',
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

  async testDraft(
    businessId: string,
    actorUserId: string,
    agentId: string,
    scenario: string,
  ) {
    const agent = await this.getAgent(businessId, agentId);
    if (!agent.currentDraftVersionId) {
      throw new AppException(
        VOICE_ERROR_CODES.AI_AGENT_DRAFT_REQUIRED,
        'Save a draft before testing this agent.',
        HttpStatus.CONFLICT,
      );
    }
    const version =
      await this.tenantPrisma.client.voiceAiAgentVersion.findFirst({
        where: {
          id: agent.currentDraftVersionId,
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
        'Quality Analyst is an offline template only; offline analysis is not implemented in this slice.',
        HttpStatus.CONFLICT,
      );
    }

    const config = version.config as unknown as AgentConfig;
    let response: string | null = null;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const result = await this.aiInfra.createMessage(
        businessId,
        'voice_entry',
        {
          system: this.systemPrompt(agent.name, agent.template, config),
          messages: [
            {
              role: 'user',
              content: `Sandbox scenario (not a live call): ${this.cleanText(scenario, 1000)}`,
            },
          ],
          maxTokens: config.maxTokensPerResponse ?? 320,
          temperature: 0.2,
        },
      );
      response = result.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('\n')
        .trim()
        .slice(0, 2000);
      inputTokens = result.inputTokens;
      outputTokens = result.outputTokens;
      if (!response) {
        errorCode = 'AI_EMPTY_RESPONSE';
        errorMessage =
          'The AI provider returned no text for this sandbox test.';
      }
    } catch (error) {
      const safe = this.safeAiError(error);
      errorCode = safe.code;
      errorMessage = safe.message;
    }

    const passed = Boolean(response && !errorCode);
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
        errorCode,
        inputTokens,
        outputTokens,
      },
    });
    return {
      id: testRun.id,
      version: version.version,
      passed,
      response,
      errorCode,
      errorMessage,
      inputTokens,
      outputTokens,
      createdAt: testRun.createdAt.toISOString(),
    };
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
        'Quality Analyst is an offline template only; offline analysis is not implemented in this slice.',
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
    const knowledgeSourceIds = [...new Set(dto.knowledgeSourceIds ?? [])];
    if (knowledgeSourceIds.length > 0) {
      const matchingSources =
        await this.tenantPrisma.client.voiceKnowledgeEntry.count({
          where: { businessId, active: true, id: { in: knowledgeSourceIds } },
        });
      if (matchingSources !== knowledgeSourceIds.length) {
        throw new AppException(
          VOICE_ERROR_CODES.AI_AGENT_KNOWLEDGE_SOURCE_INVALID,
          'Choose active knowledge sources that belong to this business.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    return {
      agentName: this.cleanText(dto.name, 120),
      template: dto.template,
      purpose: this.cleanText(dto.purpose, 240),
      voiceStyle: this.cleanText(dto.voiceStyle, 160),
      instructions: this.cleanText(dto.instructions, 2000),
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
          (dto.toolPermissions ?? [...VOICE_AI_AGENT_TOOLS]).filter((tool) =>
            (VOICE_AI_AGENT_TOOLS as readonly string[]).includes(tool),
          ),
        ),
      ],
      knowledgeSourceIds,
      maxTokensPerResponse: dto.maxTokensPerResponse ?? 320,
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
      escalationGuidance: config.escalationGuidance,
      languages: [...config.languages].sort(),
      toolPermissions: [...(config.toolPermissions ?? [])].sort(),
      knowledgeSourceIds: [...(config.knowledgeSourceIds ?? [])].sort(),
      maxTokensPerResponse: config.maxTokensPerResponse ?? 320,
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  private systemPrompt(
    name: string,
    template: string,
    config: AgentConfig,
  ): string {
    return [
      `You are ${config.agentName || name}, a ${(config.template || template).replaceAll('_', ' ')} voice agent for a real business.`,
      `Purpose: ${config.purpose}`,
      `Voice style: ${config.voiceStyle}`,
      config.languages.length
        ? `Languages: ${config.languages.join(', ')}`
        : '',
      config.instructions ? `Owner instructions: ${config.instructions}` : '',
      config.escalationGuidance
        ? `Escalation guidance: ${config.escalationGuidance}`
        : '',
      `Allowed live actions: ${(config.toolPermissions ?? [...VOICE_AI_AGENT_TOOLS]).join(', ') || 'none'}. Do not claim an action outside this allowlist.`,
      `Maximum response tokens: ${config.maxTokensPerResponse ?? 320}.`,
      'Sandbox only: do not claim to place a real call, make a booking, send a message, or change business data. Do not invent business facts. Demonstrate a short spoken response to the supplied scenario.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private safeAiError(error: unknown): { code: string; message: string } {
    if (error instanceof AppException) {
      const body = error.getResponse();
      if (typeof body === 'object' && body !== null) {
        const record = body as Record<string, unknown>;
        return {
          code:
            typeof record.code === 'string'
              ? record.code
              : 'AI_REQUEST_REJECTED',
          message:
            typeof record.message === 'string'
              ? record.message
              : 'AI request was refused by a business guardrail.',
        };
      }
    }
    return {
      code: 'AI_PROVIDER_REQUEST_FAILED',
      message:
        'The AI provider could not complete this test. Check provider configuration, model access, and available credit.',
    };
  }
}
