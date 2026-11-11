import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../filters/app.exception';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service';
import { resolvePolicies } from '../policies/policies.service';
import type { PolicyKey } from '../policies/policies.constants';
import {
  SPECIALIST_AGENT_REGISTRY,
  type SpecialistAgentPersistedKey,
} from './specialist-agent-registry';
import {
  normalizeSpecialistAgentToolInput,
  normalizeSpecialistAgentToolOutput,
  specialistAgentToolInputSchema,
  specialistAgentToolVersion,
  type SpecialistAgentToolContract,
} from './specialist-agent-tool-contract.util';
import {
  specialistAgentToolCallUpsertArgs,
  type CompletedSpecialistAgentToolCallStatus,
  type RecordSpecialistAgentToolCallInput,
} from './specialist-agent-tool-call.util';
import { recordSpecialistAgentToolEvent } from './specialist-agent-run-events.util';

export interface RegisteredSpecialistAgentTool extends SpecialistAgentToolContract {
  riskClass: string;
  executable: boolean;
  exposedToReadOnlyAssistant?: boolean;
  approvalSupported?: boolean;
  approvalActionType?: string;
  maxOutputBytes?: number;
  screen?: string;
}

export interface SpecialistAgentToolExecutionContext {
  agentKey: SpecialistAgentPersistedKey;
  moduleId: string;
  businessId: string;
  actorUserId: string | null;
  runId: string;
  correlationId: string;
  round?: number;
  sequence: number;
}

export interface SpecialistAgentToolHandlerResult {
  output: unknown;
  status: CompletedSpecialistAgentToolCallStatus;
  summary?: string | null;
  outputResourceType?: string | null;
  outputResourceId?: string | null;
  errorCode?: string | null;
}

export interface SpecialistAgentToolGatewayResult {
  tool: RegisteredSpecialistAgentTool;
  output: unknown;
  status: CompletedSpecialistAgentToolCallStatus;
  summary: string | null;
  outputResourceType: string | null;
  outputResourceId: string | null;
}

const AGENT_TOOL_BUDGET_POLICY = {
  inventory_intelligence: 'agents.inventoryMaxToolCallsPerRun',
  financial_intelligence: 'agents.financeMaxToolCallsPerRun',
  customer_intelligence: 'agents.customerMaxToolCallsPerRun',
  seo_autopilot: 'agents.seoMaxToolCallsPerRun',
  autonomous_commerce: 'agents.commerceMaxToolCallsPerRun',
} as const satisfies Record<SpecialistAgentPersistedKey, PolicyKey>;

export type SpecialistAgentToolHandler = (
  context: SpecialistAgentToolExecutionContext,
  tool: RegisteredSpecialistAgentTool,
  input: Record<string, string>,
) => Promise<SpecialistAgentToolHandlerResult>;

type RegisteredAgent = {
  moduleId: string;
  tools: Map<string, RegisteredSpecialistAgentTool>;
  handler: SpecialistAgentToolHandler;
};

type ExecuteSpecialistAgentToolInput = SpecialistAgentToolExecutionContext & {
  toolKey: string;
  input: unknown;
  mode: 'read_only' | 'approved_action';
  approvalId?: string;
  authorize: () => Promise<void>;
};

@Injectable()
export class SpecialistAgentToolGatewayService {
  private readonly agents = new Map<
    SpecialistAgentPersistedKey,
    RegisteredAgent
  >();

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  registerAgentTools(
    agentKey: SpecialistAgentPersistedKey,
    moduleId: string,
    tools: readonly RegisteredSpecialistAgentTool[],
    handler: SpecialistAgentToolHandler,
  ): void {
    const definition = SPECIALIST_AGENT_REGISTRY.find(
      (agent) => agent.agentKey === agentKey,
    );
    if (!definition || definition.moduleId !== moduleId || !handler) {
      throw new AppException(
        'SPECIALIST_AGENT_TOOL_REGISTRATION_INVALID',
        'The registered tool provider does not match a configured specialist agent.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const registered = new Map<string, RegisteredSpecialistAgentTool>();
    for (const tool of tools) {
      specialistAgentToolVersion(tool);
      specialistAgentToolInputSchema(tool);
      if (
        !/^[a-z][a-z0-9_]{0,127}$/.test(tool.key) ||
        !tool.label.trim() ||
        !tool.description.trim() ||
        typeof tool.executable !== 'boolean' ||
        registered.has(tool.key)
      ) {
        throw new AppException(
          'SPECIALIST_AGENT_TOOL_REGISTRATION_INVALID',
          `The tool registration for ${tool.key || 'unknown'} is invalid or duplicated.`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      if (
        tool.exposedToReadOnlyAssistant === true &&
        (tool.riskClass !== 'READ_ONLY' || !tool.executable)
      ) {
        throw new AppException(
          'SPECIALIST_AGENT_TOOL_REGISTRATION_INVALID',
          `The read-only tool ${tool.key} must be executable and classified READ_ONLY.`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      if (tool.approvalSupported && tool.riskClass === 'READ_ONLY') {
        throw new AppException(
          'SPECIALIST_AGENT_TOOL_REGISTRATION_INVALID',
          `The read-only tool ${tool.key} cannot require write approval.`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      if (
        tool.approvalActionType !== undefined &&
        !/^[a-z][a-z0-9_]{0,63}$/.test(tool.approvalActionType)
      ) {
        throw new AppException(
          'SPECIALIST_AGENT_TOOL_REGISTRATION_INVALID',
          `The approved action type for ${tool.key} is invalid.`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      if (
        tool.maxOutputBytes !== undefined &&
        (!Number.isSafeInteger(tool.maxOutputBytes) ||
          tool.maxOutputBytes < 1 ||
          tool.maxOutputBytes > 1_048_576)
      ) {
        throw new AppException(
          'SPECIALIST_AGENT_TOOL_REGISTRATION_INVALID',
          `The output size limit for ${tool.key} is invalid.`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      registered.set(tool.key, tool);
    }

    if (this.agents.has(agentKey)) {
      throw new AppException(
        'SPECIALIST_AGENT_TOOL_REGISTRATION_DUPLICATE',
        `Tools for ${definition.label} have already been registered.`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    this.agents.set(agentKey, { moduleId, tools: registered, handler });
  }

  toolForAgent(
    agentKey: SpecialistAgentPersistedKey,
    toolKey: string,
  ): RegisteredSpecialistAgentTool | null {
    return this.agents.get(agentKey)?.tools.get(toolKey) ?? null;
  }

  toolsForAgent(
    agentKey: SpecialistAgentPersistedKey,
    filter: (tool: RegisteredSpecialistAgentTool) => boolean = () => true,
  ): RegisteredSpecialistAgentTool[] {
    return [...(this.agents.get(agentKey)?.tools.values() ?? [])].filter(
      filter,
    );
  }

  schemasForAgent(
    agentKey: SpecialistAgentPersistedKey,
    filter: (tool: RegisteredSpecialistAgentTool) => boolean = () => true,
  ) {
    return this.toolsForAgent(agentKey, filter).map((tool) => ({
      name: tool.key,
      description: tool.description,
      input_schema: specialistAgentToolInputSchema(tool),
    }));
  }

  async execute(
    input: ExecuteSpecialistAgentToolInput,
  ): Promise<SpecialistAgentToolGatewayResult> {
    const registeredAgent = this.agents.get(input.agentKey);
    const tool = registeredAgent?.tools.get(input.toolKey);
    const definition = SPECIALIST_AGENT_REGISTRY.find(
      (agent) => agent.agentKey === input.agentKey,
    );
    if (
      !definition ||
      definition.moduleId !== input.moduleId ||
      !registeredAgent ||
      registeredAgent.moduleId !== definition.moduleId ||
      !Number.isSafeInteger(input.sequence) ||
      input.sequence < 1 ||
      !Number.isSafeInteger(input.round ?? 1) ||
      (input.round ?? 1) < 1 ||
      !tool ||
      !tool.executable ||
      (input.mode === 'read_only' &&
        (tool.riskClass !== 'READ_ONLY' ||
          tool.exposedToReadOnlyAssistant !== true)) ||
      (input.mode === 'approved_action' &&
        (!tool.approvalSupported || !input.approvalId?.trim()))
    ) {
      await this.record({
        ...this.recordContext(input),
        toolKey: tool?.key ?? 'unregistered_tool',
        toolVersion: tool ? specialistAgentToolVersion(tool) : 1,
        status: 'blocked',
        input: { validation: 'blocked' },
        durationMs: 0,
        errorCode: 'SPECIALIST_AGENT_TOOL_NOT_ALLOWED',
      });
      throw new AppException(
        'SPECIALIST_AGENT_TOOL_NOT_ALLOWED',
        'This tool is not registered for the current agent, or it is not permitted for this operation.',
        HttpStatus.FORBIDDEN,
      );
    }

    const startedAt = Date.now();
    let normalizedInput: Record<string, string>;
    try {
      normalizedInput = normalizeSpecialistAgentToolInput(tool, input.input, {
        errorCode: 'SPECIALIST_AGENT_TOOL_INPUT_INVALID',
      });
    } catch (error) {
      await this.record({
        ...this.recordContext(input),
        toolKey: tool.key,
        toolVersion: specialistAgentToolVersion(tool),
        status: 'failed',
        input: { validation: 'rejected' },
        durationMs: this.duration(startedAt),
        errorCode: 'SPECIALIST_AGENT_TOOL_INPUT_INVALID',
      });
      throw error;
    }

    const reservation = await this.reserveToolCallSlot(
      input,
      tool,
      normalizedInput,
    );
    if (!reservation.allowed) {
      throw new AppException(
        'SPECIALIST_AGENT_TOOL_CALL_LIMIT_REACHED',
        `The specialist agent tool-call limit (${reservation.limit}) has been reached for this run.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let handlerResult: SpecialistAgentToolHandlerResult;
    try {
      if (input.mode === 'approved_action') {
        await this.assertApprovedAction(input, tool);
      }
      await input.authorize();
      handlerResult = await registeredAgent.handler(
        input,
        tool,
        normalizedInput,
      );
    } catch (error) {
      await this.record({
        ...this.recordContext(input),
        toolKey: tool.key,
        toolVersion: specialistAgentToolVersion(tool),
        status: error instanceof AppException ? 'refused' : 'failed',
        input: normalizedInput,
        durationMs: this.duration(startedAt),
        errorCode: this.safeErrorCode(error),
      });
      throw error;
    }

    let output: unknown;
    try {
      output = normalizeSpecialistAgentToolOutput(tool, handlerResult.output, {
        errorCode: 'SPECIALIST_AGENT_TOOL_OUTPUT_INVALID',
        maxOutputBytes: tool.maxOutputBytes,
      });
    } catch (error) {
      await this.record({
        ...this.recordContext(input),
        toolKey: tool.key,
        toolVersion: specialistAgentToolVersion(tool),
        status: 'failed',
        input: normalizedInput,
        outputResourceType: handlerResult.outputResourceType,
        outputResourceId: handlerResult.outputResourceId,
        durationMs: this.duration(startedAt),
        errorCode: 'SPECIALIST_AGENT_TOOL_OUTPUT_INVALID',
      });
      throw error;
    }

    await this.record({
      ...this.recordContext(input),
      toolKey: tool.key,
      toolVersion: specialistAgentToolVersion(tool),
      status: handlerResult.status,
      input: normalizedInput,
      outputResourceType: handlerResult.outputResourceType,
      outputResourceId: handlerResult.outputResourceId,
      durationMs: this.duration(startedAt),
      errorCode: handlerResult.errorCode,
    });
    return {
      tool,
      output,
      status: handlerResult.status,
      summary:
        typeof handlerResult.summary === 'string'
          ? handlerResult.summary.slice(0, 2_000)
          : null,
      outputResourceType: handlerResult.outputResourceType ?? null,
      outputResourceId: handlerResult.outputResourceId ?? null,
    };
  }

  async record(input: RecordSpecialistAgentToolCallInput): Promise<void> {
    await this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.specialistAgentToolCall.upsert(
        specialistAgentToolCallUpsertArgs(input),
      );
      await recordSpecialistAgentToolEvent(tx, input);
    });
  }

  private async reserveToolCallSlot(
    input: ExecuteSpecialistAgentToolInput,
    tool: RegisteredSpecialistAgentTool,
    normalizedInput: Record<string, string>,
  ): Promise<{ allowed: boolean; limit: number }> {
    return this.tenantPrisma.client.$transaction(async (tx) => {
      const lockedRuns = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM specialist_agent_runs
        WHERE business_id = ${input.businessId} AND id = ${input.runId}
        FOR UPDATE
      `;
      if (lockedRuns.length === 0) {
        throw new AppException(
          'SPECIALIST_RUN_NOT_FOUND',
          'The specialist run is not available in this business.',
          HttpStatus.NOT_FOUND,
        );
      }

      const business = await tx.business.findUnique({
        where: { id: input.businessId },
        select: { policies: true },
      });
      const policies = resolvePolicies(business);
      const limit =
        policies.num(AGENT_TOOL_BUDGET_POLICY[input.agentKey]) ??
        policies.num('agents.maxToolCallsPerRun') ??
        20;
      const round = input.round ?? 1;
      const priorToolCalls = await tx.specialistAgentToolCall.count({
        where: {
          businessId: input.businessId,
          runId: input.runId,
          agentKey: input.agentKey,
          NOT: { AND: [{ round }, { sequence: input.sequence }] },
        },
      });
      const allowed = priorToolCalls < limit;
      const toolCall = {
        ...this.recordContext(input),
        actorUserId: input.actorUserId,
        toolKey: tool.key,
        toolVersion: specialistAgentToolVersion(tool),
        status: allowed ? 'running' : 'blocked',
        input: allowed ? normalizedInput : { validation: 'call_limit' },
        durationMs: allowed ? null : 0,
        errorCode: allowed ? null : 'SPECIALIST_AGENT_TOOL_CALL_LIMIT_REACHED',
        finishedAt: allowed ? null : new Date(),
      } satisfies RecordSpecialistAgentToolCallInput;
      await tx.specialistAgentToolCall.upsert(
        specialistAgentToolCallUpsertArgs(toolCall),
      );
      await recordSpecialistAgentToolEvent(tx, toolCall);
      return { allowed, limit };
    });
  }

  private recordContext(input: SpecialistAgentToolExecutionContext) {
    return {
      businessId: input.businessId,
      runId: input.runId,
      agentKey: input.agentKey,
      moduleId: input.moduleId,
      actorUserId: input.actorUserId,
      round: input.round,
      sequence: input.sequence,
      correlationId: input.correlationId,
    };
  }

  private duration(startedAt: number): number {
    return Math.min(Math.max(0, Date.now() - startedAt), 2_147_483_647);
  }

  private safeErrorCode(error: unknown): string {
    if (error instanceof AppException) {
      const response = error.getResponse();
      if (
        typeof response === 'object' &&
        response !== null &&
        'code' in response &&
        typeof response.code === 'string' &&
        /^[A-Z0-9_]{1,64}$/.test(response.code)
      ) {
        return response.code;
      }
    }
    return 'SPECIALIST_AGENT_TOOL_FAILED';
  }

  private async assertApprovedAction(
    input: ExecuteSpecialistAgentToolInput,
    tool: RegisteredSpecialistAgentTool,
  ): Promise<void> {
    const approval =
      await this.tenantPrisma.client.specialistAgentAction.findFirst({
        where: {
          id: input.approvalId,
          businessId: input.businessId,
          runId: input.runId,
          agentKey: input.agentKey,
          moduleId: input.moduleId,
          actionType: tool.approvalActionType ?? tool.key,
          state: 'approved',
          approvedAt: { not: null },
          approvedByUserId: { not: null },
        },
        select: { id: true },
      });
    if (!approval) {
      throw new AppException(
        'SPECIALIST_AGENT_APPROVAL_REQUIRED',
        'A matching owner-approved action is required before this tool can run.',
        HttpStatus.FORBIDDEN,
      );
    }
  }
}
