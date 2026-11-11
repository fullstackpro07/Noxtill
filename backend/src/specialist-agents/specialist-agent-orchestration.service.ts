import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { createHash, randomUUID } from 'node:crypto';
import { CommerceSpecialistAgentService } from '../commerce/commerce-specialist-agent.service';
import { resolvePolicies } from '../common/policies/policies.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  createOrReuseSpecialistAgentRun,
  specialistAgentIdempotencyHash,
} from '../common/agents/specialist-agent-run-idempotency.util';
import {
  recordSpecialistAgentRunCreatedEvent,
  recordSpecialistAgentRunTerminalEvent,
  SpecialistAgentTerminalStatus,
} from '../common/agents/specialist-agent-run-events.util';
import { InventoryIntelligenceService } from '../inventory/inventory-intelligence.service';
import { SeoSpecialistAgentService } from '../seo-workspace/seo-specialist-agent.service';
import { FinancialIntelligenceService } from '../profit/financial-intelligence.service';
import { CustomerIntelligenceService } from '../customers/customer-intelligence.service';
import { PrismaService } from '../prisma/prisma.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import {
  SPECIALIST_AGENT_ORCHESTRATOR,
  SPECIALIST_AGENT_REGISTRY,
} from '../common/agents/specialist-agent-registry';
import {
  SPECIALIST_AGENT_ORCHESTRATION_BACKOFF_MS,
  SPECIALIST_AGENT_ORCHESTRATION_JOB_ATTEMPTS,
  SPECIALIST_AGENT_ORCHESTRATION_QUEUE,
} from './specialist-agent-orchestration.constants';

const ORCHESTRATOR_AGENT_KEY = SPECIALIST_AGENT_ORCHESTRATOR.agentKey;
const ORCHESTRATOR_VERSION = '1.0.0';
const SPECIALISTS = SPECIALIST_AGENT_REGISTRY;

type SpecialistKey = (typeof SPECIALISTS)[number]['agentKey'];
export type SpecialistAgentOrchestrationJobData = {
  businessId: string;
  parentRunId: string;
  actorUserId: string;
  mode: 'run' | 'retry';
  retryKeyHash?: string;
};

type RetryMarker = {
  keyHash: string;
  actorUserId?: string;
  retriedAt?: string;
};

export type OrchestrationChildStatus =
  'completed' | 'partially_succeeded' | 'failed' | 'running' | 'skipped';

export type SpecialistOrchestrationChild = {
  agentKey: SpecialistKey;
  moduleId: string;
  name: string;
  status: OrchestrationChildStatus;
  runId: string | null;
  reasonCode: string | null;
};

const CHILD_STATE_EVENT_NAMES: Record<OrchestrationChildStatus, string> = {
  running: 'agent.run.child_started',
  completed: 'agent.run.child_completed',
  partially_succeeded: 'agent.run.child_partial',
  failed: 'agent.run.child_failed',
  skipped: 'agent.run.child_skipped',
};

type OrchestrationOutput = {
  summary: string;
  correlationId: string;
  children: SpecialistOrchestrationChild[];
  completedCount: number;
  partialCount: number;
  failedCount: number;
  skippedCount: number;
  runningCount: number;
  observedAt: string;
  execution: 'sequential_read_only';
  aiProviderCalls: 0;
};

function readPersistedChildren(
  output: Prisma.JsonValue,
): SpecialistOrchestrationChild[] {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return [];
  const raw = output.children;
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(SPECIALISTS.map((agent) => agent.agentKey));
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const child = entry;
    const validStatuses: OrchestrationChildStatus[] = [
      'completed',
      'partially_succeeded',
      'failed',
      'running',
      'skipped',
    ];
    if (
      typeof child.agentKey !== 'string' ||
      !allowed.has(child.agentKey) ||
      typeof child.moduleId !== 'string' ||
      typeof child.name !== 'string' ||
      typeof child.status !== 'string' ||
      !validStatuses.some((status) => status === child.status) ||
      (child.runId !== null && typeof child.runId !== 'string') ||
      (child.reasonCode !== null && typeof child.reasonCode !== 'string')
    ) {
      return [];
    }
    return [child as unknown as SpecialistOrchestrationChild];
  });
}

function normalizedErrorCode(error: unknown): string {
  if (error instanceof AppException) {
    const response = error.getResponse();
    if (response && typeof response === 'object' && 'code' in response) {
      const code = (response as { code?: unknown }).code;
      if (typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code))
        return code;
    }
  }
  return 'SPECIALIST_RUN_FAILED';
}

function hasOrchestrationRetryKey(
  inputRefs: Prisma.JsonValue,
  keyHash: string,
) {
  if (!Array.isArray(inputRefs)) return false;
  return inputRefs.some(
    (entry) =>
      entry !== null &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      entry.source === 'specialist_orchestration_retry' &&
      entry.keyHash === keyHash,
  );
}

function latestRetryMarker(inputRefs: Prisma.JsonValue): RetryMarker | null {
  if (!Array.isArray(inputRefs)) return null;
  const markers = inputRefs.filter(
    (entry): entry is Prisma.JsonObject =>
      entry !== null &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      entry.source === 'specialist_orchestration_retry' &&
      typeof entry.keyHash === 'string' &&
      /^[a-f0-9]{64}$/.test(entry.keyHash),
  );
  const marker = markers[markers.length - 1];
  return marker
    ? {
        keyHash: marker.keyHash as string,
        actorUserId:
          typeof marker.actorUserId === 'string'
            ? marker.actorUserId
            : undefined,
        retriedAt:
          typeof marker.retriedAt === 'string' ? marker.retriedAt : undefined,
      }
    : null;
}

@Injectable()
export class SpecialistAgentOrchestrationService {
  private readonly logger = new Logger(
    SpecialistAgentOrchestrationService.name,
  );

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly inventory: InventoryIntelligenceService,
    private readonly finance: FinancialIntelligenceService,
    private readonly customers: CustomerIntelligenceService,
    private readonly seo: SeoSpecialistAgentService,
    private readonly commerce: CommerceSpecialistAgentService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
    @InjectQueue(SPECIALIST_AGENT_ORCHESTRATION_QUEUE)
    private readonly queue: Queue<SpecialistAgentOrchestrationJobData>,
  ) {}

  private async recordLifecycleEvent(input: {
    tx: Prisma.TransactionClient;
    businessId: string;
    runId: string;
    eventName: string;
    dedupeKey: string;
    actorUserId: string | null;
    occurredAt: Date;
    payload: Prisma.InputJsonObject;
  }) {
    await input.tx.specialistAgentRunEvent.createMany({
      data: [
        {
          id: randomUUID(),
          dedupeKey: createHash('sha256')
            .update(
              `${input.businessId}:${input.runId}:${input.eventName}:${input.dedupeKey}`,
            )
            .digest('hex'),
          businessId: input.businessId,
          runId: input.runId,
          eventName: input.eventName,
          occurredAt: input.occurredAt,
          sourceModule: 'shared',
          entityId: input.runId,
          entityVersion: ORCHESTRATOR_VERSION,
          schemaVersion: 1,
          correlationId: input.runId,
          actorUserId: input.actorUserId,
          payload: input.payload,
        },
      ],
      skipDuplicates: true,
    });
  }

  private async finishRunWithTerminalEvent(input: {
    runId: string;
    businessId: string;
    agentKey: string;
    expectedStatuses: string[];
    status: SpecialistAgentTerminalStatus;
    occurredAt: Date;
    data: Prisma.SpecialistAgentRunUpdateManyMutationInput;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<
        Array<{ output: Prisma.JsonValue }>
      >(Prisma.sql`
        SELECT output
        FROM specialist_agent_runs
        WHERE id = ${input.runId}
          AND business_id = ${input.businessId}
          AND agent_key = ${input.agentKey}
          AND status IN (${Prisma.join(input.expectedStatuses)})
        FOR UPDATE
      `);
      if (lockedRows.length === 0) return false;
      const run = await tx.specialistAgentRun.findFirst({
        where: {
          id: input.runId,
          businessId: input.businessId,
          agentKey: input.agentKey,
          status: { in: input.expectedStatuses },
        },
        select: {
          id: true,
          businessId: true,
          agentKey: true,
          agentVersion: true,
          agentConfigVersion: true,
          moduleId: true,
          triggerType: true,
          initiatedByUserId: true,
          createdAt: true,
          output: true,
        },
      });
      if (!run) return false;

      const updated = await tx.specialistAgentRun.updateMany({
        where: {
          id: run.id,
          businessId: input.businessId,
          agentKey: input.agentKey,
          status: { in: input.expectedStatuses },
        },
        data: { ...input.data, status: input.status },
      });
      if (updated.count !== 1) return false;

      await recordSpecialistAgentRunTerminalEvent(
        tx,
        run,
        input.status,
        input.occurredAt,
      );
      if (
        input.agentKey === ORCHESTRATOR_AGENT_KEY &&
        input.data.output !== undefined
      ) {
        await this.recordChildStateEvents(
          tx,
          input.businessId,
          input.runId,
          run.output,
          input.data.output as Prisma.JsonValue,
          input.occurredAt,
        );
      }
      return true;
    });
  }

  private async recordChildStateEvents(
    tx: Prisma.TransactionClient,
    businessId: string,
    parentRunId: string,
    previousOutput: Prisma.JsonValue,
    nextOutput: Prisma.JsonValue,
    occurredAt: Date,
  ) {
    const previousByAgent = new Map(
      readPersistedChildren(previousOutput).map((child) => [
        child.agentKey,
        child,
      ]),
    );
    const events = readPersistedChildren(nextOutput).flatMap((child) => {
      const previous = previousByAgent.get(child.agentKey);
      if (
        previous?.status === child.status &&
        previous.runId === child.runId &&
        previous.reasonCode === child.reasonCode
      ) {
        return [];
      }
      const eventName = CHILD_STATE_EVENT_NAMES[child.status];
      const reasonCode =
        child.reasonCode && /^[A-Z0-9_]{1,64}$/.test(child.reasonCode)
          ? child.reasonCode
          : null;
      const transitionKey = createHash('sha256')
        .update(
          [
            businessId,
            parentRunId,
            child.agentKey,
            previous?.status ?? 'not_started',
            child.status,
            child.runId ?? 'no_child_run',
            reasonCode ?? 'no_reason',
            occurredAt.toISOString(),
          ].join(':'),
        )
        .digest('hex');
      return [
        {
          id: randomUUID(),
          dedupeKey: transitionKey,
          businessId,
          runId: parentRunId,
          eventName,
          occurredAt,
          sourceModule: 'shared',
          entityId: parentRunId,
          entityVersion: ORCHESTRATOR_VERSION,
          schemaVersion: 1,
          correlationId: parentRunId,
          actorUserId: null,
          payload: {
            agentKey: child.agentKey,
            moduleId: child.moduleId,
            fromStatus: previous?.status ?? null,
            status: child.status,
            reasonCode,
          },
        },
      ];
    });
    if (events.length === 0) return;
    await tx.specialistAgentRunEvent.createMany({
      data: events,
      skipDuplicates: true,
    });
  }

  async listRuns(businessId: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const rows = await this.tenantPrisma.client.specialistAgentRun.findMany({
      where: { businessId: scopedBusinessId, agentKey: ORCHESTRATOR_AGENT_KEY },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: {
        id: true,
        status: true,
        createdAt: true,
        finishedAt: true,
        output: true,
        errorCode: true,
      },
    });
    return {
      scope: 'current_business' as const,
      runs: rows.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: row.createdAt,
        finishedAt: row.finishedAt,
        errorCode: row.errorCode,
        result: this.outputForClient(row.output, row.id),
      })),
    };
  }

  async run(businessId: string, actorUserId: string, idempotencyKey?: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    if (!idempotencyKey) {
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_IDEMPOTENCY_REQUIRED',
        'A fresh Idempotency-Key is required to start a cross-agent review.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const business = await this.tenantPrisma.client.business.findFirst({
      where: { id: scopedBusinessId },
      select: { policies: true },
    });
    if (!business) {
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_BUSINESS_NOT_FOUND',
        'The current business could not be found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const policies = resolvePolicies(business);
    const enabledAgentKeys: SpecialistKey[] = [];
    for (const agent of SPECIALISTS) {
      if (
        !policies.bool(agent.enabledPolicy) ||
        (agent.agentKey === 'autonomous_commerce' &&
          (policies.num('commerce.autonomyLevel') ?? 0) <= 0) ||
        !(await this.agentPolicy.isModuleEnabledForBusiness(
          scopedBusinessId,
          agent.policyAgentKey,
        ))
      ) {
        continue;
      }
      enabledAgentKeys.push(agent.agentKey);
    }
    const startedAt = new Date();
    const reservation = await createOrReuseSpecialistAgentRun(
      (data) =>
        this.tenantPrisma.client.$transaction(async (tx) => {
          const run = await tx.specialistAgentRun.create({ data });
          await recordSpecialistAgentRunCreatedEvent(tx, run);
          return run;
        }),
      (keyBusinessId, agentKey, idempotencyKeyHash) =>
        this.tenantPrisma.client.specialistAgentRun.findFirst({
          where: { businessId: keyBusinessId, agentKey, idempotencyKeyHash },
        }),
      {
        businessId: scopedBusinessId,
        agentKey: ORCHESTRATOR_AGENT_KEY,
        agentVersion: ORCHESTRATOR_VERSION,
        moduleId: 'shared',
        triggerType: 'manual',
        status: 'running',
        initiatedByUserId: actorUserId,
        inputRefs: [
          {
            source: 'enabled_specialist_agent_policies',
            scope: 'current_business',
            agentKeys: enabledAgentKeys,
          },
        ],
        output: {
          summary:
            'Cross-agent review queued. No specialist data has been read yet.',
          observedAt: startedAt.toISOString(),
          execution: 'sequential_read_only',
          children: [],
          completedCount: 0,
          partialCount: 0,
          failedCount: 0,
          skippedCount: 0,
          runningCount: 0,
          aiProviderCalls: 0,
        },
        policyResult: {
          autonomyLevel: 'L0',
          riskTier: 'low',
          readOnly: true,
          invokesAiProvider: false,
          executesActions: false,
          requiresOwner: true,
        },
      },
      idempotencyKey,
      { businessId: scopedBusinessId, enabledAgentKeys },
    );

    const parentRun = reservation.run;
    if (reservation.reused && parentRun.status !== 'running') {
      return this.responseFromRun(parentRun);
    }
    const retry = latestRetryMarker(parentRun.inputRefs);
    const job: SpecialistAgentOrchestrationJobData = retry
      ? {
          businessId: scopedBusinessId,
          parentRunId: parentRun.id,
          actorUserId: retry.actorUserId ?? actorUserId,
          mode: 'retry',
          retryKeyHash: retry.keyHash,
        }
      : {
          businessId: scopedBusinessId,
          parentRunId: parentRun.id,
          actorUserId,
          mode: 'run',
        };
    await this.enqueueOrFail(job);
    const current = reservation.reused
      ? await this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
          where: {
            id: parentRun.id,
            businessId: scopedBusinessId,
            agentKey: ORCHESTRATOR_AGENT_KEY,
          },
        })
      : parentRun;
    return { ...this.responseFromRun(current), reused: reservation.reused };
  }

  async processQueuedRun(
    job: SpecialistAgentOrchestrationJobData,
    attemptNumber = 0,
  ) {
    const scopedBusinessId = this.scopedBusinessId(job.businessId);
    if (scopedBusinessId !== job.businessId) {
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_TENANT_MISMATCH',
        'The queued specialist review does not match the active business context.',
        HttpStatus.FORBIDDEN,
      );
    }
    const parent = await this.tenantPrisma.client.specialistAgentRun.findFirst({
      where: {
        id: job.parentRunId,
        businessId: scopedBusinessId,
        agentKey: ORCHESTRATOR_AGENT_KEY,
        status: { in: ['running', 'cancel_requested'] },
      },
    });
    if (!parent) return;

    if (parent.status === 'cancel_requested') {
      await this.finishCancelled(
        parent.id,
        scopedBusinessId,
        readPersistedChildren(parent.output),
      );
      return;
    }

    // The parent row is persisted before queue.add so a crash between those operations is
    // recoverable. Record actual worker pickup separately from that enqueue-side row creation,
    // and only once across BullMQ retries/recovery. Run duration should start when work starts.
    const workerStartedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.specialistAgentRun.updateMany({
        where: {
          id: parent.id,
          businessId: scopedBusinessId,
          agentKey: ORCHESTRATOR_AGENT_KEY,
          status: 'running',
          workerStartedAt: null,
        },
        data: { workerStartedAt, startedAt: workerStartedAt },
      });
      if (claim.count === 1) {
        await this.recordLifecycleEvent({
          tx,
          businessId: scopedBusinessId,
          runId: parent.id,
          eventName: 'agent.run.worker_started',
          dedupeKey: 'first_worker_pickup',
          actorUserId: null,
          occurredAt: workerStartedAt,
          payload: { agentKey: ORCHESTRATOR_AGENT_KEY, mode: job.mode },
        });
      }
      return claim;
    });

    const business = await this.tenantPrisma.client.business.findFirst({
      where: { id: scopedBusinessId },
      select: { policies: true },
    });
    if (!business) {
      await this.finishQueueFailure(job, 'BUSINESS_NOT_FOUND');
      return;
    }
    if (job.mode === 'retry') {
      if (
        !job.retryKeyHash ||
        !hasOrchestrationRetryKey(parent.inputRefs, job.retryKeyHash)
      ) {
        await this.finishQueueFailure(job, 'RETRY_MARKER_NOT_FOUND');
        return;
      }
      await this.processRetryChildren(parent, job, attemptNumber);
      return;
    }

    await this.processInitialChildren(parent, job, attemptNumber);
  }

  /**
   * Re-enqueues durable parent rows left in `running` if a process stopped after the database
   * commit but before `queue.add`, or if a worker exhausted/recovered a stalled job.
   */
  async recoverPendingRuns() {
    let afterId: string | undefined;
    let scanned = 0;
    let enqueued = 0;
    for (;;) {
      const rows = await this.prisma.specialistAgentRun.findMany({
        where: {
          agentKey: ORCHESTRATOR_AGENT_KEY,
          status: { in: ['running', 'cancel_requested'] },
          ...(afterId ? { id: { gt: afterId } } : {}),
        },
        orderBy: { id: 'asc' },
        take: 100,
        select: {
          id: true,
          businessId: true,
          initiatedByUserId: true,
          inputRefs: true,
          status: true,
        },
      });
      if (rows.length === 0) break;
      afterId = rows[rows.length - 1].id;
      scanned += rows.length;
      for (const row of rows) {
        if (!row.initiatedByUserId) {
          const finishedAt = new Date();
          const cancelled = row.status === 'cancel_requested';
          await this.finishRunWithTerminalEvent({
            runId: row.id,
            businessId: row.businessId,
            agentKey: ORCHESTRATOR_AGENT_KEY,
            expectedStatuses: [row.status],
            status: cancelled ? 'cancelled' : 'failed',
            occurredAt: finishedAt,
            data: {
              finishedAt,
              errorCode: cancelled
                ? 'SPECIALIST_ORCHESTRATION_CANCELLED'
                : 'SPECIALIST_ORCHESTRATION_ACTOR_MISSING',
            },
          });
          continue;
        }
        const retry = latestRetryMarker(row.inputRefs);
        const job: SpecialistAgentOrchestrationJobData = retry
          ? {
              businessId: row.businessId,
              parentRunId: row.id,
              actorUserId: retry.actorUserId ?? row.initiatedByUserId,
              mode: 'retry',
              retryKeyHash: retry.keyHash,
            }
          : {
              businessId: row.businessId,
              parentRunId: row.id,
              actorUserId: row.initiatedByUserId,
              mode: 'run',
            };
        try {
          await this.addJob(job);
          enqueued += 1;
        } catch (error) {
          this.logger.warn(
            `Could not recover specialist orchestration ${row.id}: ${(error as Error).message}`,
          );
        }
      }
      if (rows.length < 100) break;
    }
    return { scanned, enqueued };
  }

  async markQueueFailure(
    job: SpecialistAgentOrchestrationJobData,
    error: unknown,
    attemptNumber = 0,
  ) {
    this.logger.error(
      `Specialist orchestration ${job.parentRunId} exhausted queue retries: ${(error as Error)?.message ?? 'unknown worker error'}`,
    );
    await this.finishQueueFailure(
      job,
      'SPECIALIST_ORCHESTRATION_WORKER_FAILED',
      attemptNumber,
    );
  }

  async cancelRun(businessId: string, runId: string, actorUserId?: string) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const parent = await this.tenantPrisma.client.specialistAgentRun.findFirst({
      where: {
        id: runId,
        businessId: scopedBusinessId,
        agentKey: ORCHESTRATOR_AGENT_KEY,
      },
    });
    if (!parent) {
      await this.auditCrossTenantProbe(
        scopedBusinessId,
        runId,
        'cancel',
        actorUserId,
      );
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_NOT_FOUND',
        'This cross-agent review is not available in the current business.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (parent.status === 'cancel_requested' || parent.status === 'cancelled') {
      return { ...this.responseFromRun(parent), reused: true };
    }
    if (parent.status !== 'running') {
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_NOT_RUNNING',
        'Only a running cross-agent review can be stopped.',
        HttpStatus.CONFLICT,
      );
    }

    const output = this.outputForClient(parent.output, parent.id);
    const request = await this.prisma.$transaction(async (tx) => {
      const update = await tx.specialistAgentRun.updateMany({
        where: {
          id: parent.id,
          businessId: scopedBusinessId,
          agentKey: ORCHESTRATOR_AGENT_KEY,
          status: 'running',
        },
        data: {
          status: 'cancel_requested',
          errorCode: 'SPECIALIST_ORCHESTRATION_CANCEL_REQUESTED',
          output: {
            ...output,
            summary:
              'Stop requested by the owner. Any review already in progress will finish, and no later specialist review will start.',
            cancelRequestedAt: new Date().toISOString(),
          },
        },
      });
      if (update.count === 1) {
        await this.recordLifecycleEvent({
          tx,
          businessId: scopedBusinessId,
          runId: parent.id,
          eventName: 'agent.run.cancel_requested',
          dedupeKey: 'owner_cancel_request',
          actorUserId: actorUserId ?? null,
          occurredAt: new Date(),
          payload: {
            agentKey: ORCHESTRATOR_AGENT_KEY,
            status: 'cancel_requested',
          },
        });
      }
      return update;
    });
    if (request.count !== 1) {
      const latest =
        await this.tenantPrisma.client.specialistAgentRun.findFirst({
          where: {
            id: parent.id,
            businessId: scopedBusinessId,
            agentKey: ORCHESTRATOR_AGENT_KEY,
          },
        });
      if (
        latest?.status === 'cancel_requested' ||
        latest?.status === 'cancelled'
      ) {
        return { ...this.responseFromRun(latest), reused: true };
      }
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_CANCEL_CONFLICT',
        'This cross-agent review changed before the stop request was saved. Refresh its status and try again if it is still running.',
        HttpStatus.CONFLICT,
      );
    }

    const updated =
      await this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
        where: {
          id: parent.id,
          businessId: scopedBusinessId,
          agentKey: ORCHESTRATOR_AGENT_KEY,
        },
      });
    return { ...this.responseFromRun(updated), reused: false };
  }

  async retryFailed(
    businessId: string,
    actorUserId: string,
    runId: string,
    idempotencyKey?: string,
  ) {
    const scopedBusinessId = this.scopedBusinessId(businessId);
    const key = idempotencyKey?.trim();
    if (!key) {
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_IDEMPOTENCY_REQUIRED',
        'A fresh Idempotency-Key is required to retry failed specialist reviews.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (key.length < 8 || key.length > 200 || /[^\x21-\x7e]/.test(key)) {
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_IDEMPOTENCY_INVALID',
        'Idempotency-Key must contain 8–200 printable ASCII characters with no spaces.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const keyHash = specialistAgentIdempotencyHash(key);
    const parent = await this.tenantPrisma.client.specialistAgentRun.findFirst({
      where: {
        id: runId,
        businessId: scopedBusinessId,
        agentKey: ORCHESTRATOR_AGENT_KEY,
      },
    });
    if (!parent) {
      await this.auditCrossTenantProbe(
        scopedBusinessId,
        runId,
        'retry_failed',
        actorUserId,
      );
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_NOT_FOUND',
        'This cross-agent review is not available in the current business.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (hasOrchestrationRetryKey(parent.inputRefs, keyHash)) {
      if (parent.status === 'running') {
        await this.enqueueOrFail({
          businessId: scopedBusinessId,
          parentRunId: parent.id,
          actorUserId,
          mode: 'retry',
          retryKeyHash: keyHash,
        });
      }
      return { ...this.responseFromRun(parent), reused: true };
    }
    if (parent.status === 'running' || parent.status === 'cancel_requested') {
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_ALREADY_RUNNING',
        'This cross-agent review is still running. Refresh its status before retrying.',
        HttpStatus.CONFLICT,
      );
    }

    const persistedChildren = readPersistedChildren(parent.output);
    const failedChildren = persistedChildren.filter(
      (child) => child.status === 'failed',
    );
    if (failedChildren.length === 0) {
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_NO_FAILED_CHILDREN',
        'This cross-agent review has no failed specialist reviews to retry.',
        HttpStatus.CONFLICT,
      );
    }

    const business = await this.tenantPrisma.client.business.findFirst({
      where: { id: scopedBusinessId },
      select: { id: true },
    });
    if (!business) {
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_BUSINESS_NOT_FOUND',
        'The current business could not be found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const marker = {
      source: 'specialist_orchestration_retry',
      keyHash,
      actorUserId,
      retriedAt: new Date().toISOString(),
    } satisfies Prisma.InputJsonObject;
    const claim = await this.prisma.$transaction(async (tx) => {
      const update = await tx.specialistAgentRun.updateMany({
        where: {
          id: parent.id,
          businessId: scopedBusinessId,
          agentKey: ORCHESTRATOR_AGENT_KEY,
          status: parent.status,
        },
        data: {
          status: 'running',
          finishedAt: null,
          errorCode: null,
          inputRefs: [
            ...(Array.isArray(parent.inputRefs) ? parent.inputRefs : []),
            marker,
          ] as Prisma.InputJsonArray,
          output: {
            ...(parent.output &&
            typeof parent.output === 'object' &&
            !Array.isArray(parent.output)
              ? parent.output
              : {}),
            summary:
              'Retry queued. Failed specialist reviews have not started yet.',
            observedAt: new Date().toISOString(),
          },
        },
      });
      if (update.count === 1) {
        await this.recordLifecycleEvent({
          tx,
          businessId: scopedBusinessId,
          runId: parent.id,
          eventName: 'agent.run.retry_queued',
          dedupeKey: keyHash,
          actorUserId,
          occurredAt: new Date(),
          payload: {
            agentKey: ORCHESTRATOR_AGENT_KEY,
            status: 'running',
            retriedChildren: failedChildren.length,
          },
        });
      }
      return update;
    });
    if (claim.count !== 1) {
      const latest =
        await this.tenantPrisma.client.specialistAgentRun.findFirst({
          where: {
            id: parent.id,
            businessId: scopedBusinessId,
            agentKey: ORCHESTRATOR_AGENT_KEY,
          },
        });
      if (latest && hasOrchestrationRetryKey(latest.inputRefs, keyHash)) {
        if (latest.status === 'running') {
          await this.enqueueOrFail({
            businessId: scopedBusinessId,
            parentRunId: latest.id,
            actorUserId,
            mode: 'retry',
            retryKeyHash: keyHash,
          });
        }
        return { ...this.responseFromRun(latest), reused: true };
      }
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_RETRY_CONFLICT',
        'This cross-agent review changed while the retry was being started. Refresh and review its current state.',
        HttpStatus.CONFLICT,
      );
    }

    await this.enqueueOrFail({
      businessId: scopedBusinessId,
      parentRunId: parent.id,
      actorUserId,
      mode: 'retry',
      retryKeyHash: keyHash,
    });
    const queued =
      await this.tenantPrisma.client.specialistAgentRun.findFirstOrThrow({
        where: {
          id: parent.id,
          businessId: scopedBusinessId,
          agentKey: ORCHESTRATOR_AGENT_KEY,
        },
      });
    return { ...this.responseFromRun(queued), reused: false };
  }

  private async processInitialChildren(
    parent: { id: string; businessId: string; output: Prisma.JsonValue },
    job: SpecialistAgentOrchestrationJobData,
    attemptNumber: number,
  ) {
    const childrenByAgent = new Map<
      SpecialistKey,
      SpecialistOrchestrationChild
    >(
      readPersistedChildren(parent.output).map((child) => [
        child.agentKey,
        child,
      ]),
    );

    for (const agent of SPECIALISTS) {
      if (await this.isCancellationRequested(parent.id, job.businessId)) {
        await this.finishCancelled(parent.id, job.businessId, [
          ...childrenByAgent.values(),
        ]);
        return;
      }
      const previousChild = childrenByAgent.get(agent.agentKey);
      if (previousChild && previousChild.status !== 'running') {
        continue;
      }
      const baseKey = `${parent.id}:${agent.agentKey}`;
      const candidateKeys = this.keysThroughAttempt(baseKey, attemptNumber);
      const existingChildRun =
        previousChild?.status === 'running'
          ? await this.findChildByKeys(
              job.businessId,
              agent.agentKey,
              candidateKeys,
            )
          : null;
      if (previousChild?.status === 'running' && existingChildRun) {
        const reconciled = await this.reconcileInterruptedChild(
          job.businessId,
          agent.agentKey,
          { ...previousChild, runId: existingChildRun.id },
          candidateKeys,
        );
        if (reconciled) {
          childrenByAgent.set(agent.agentKey, reconciled);
          await this.saveProgress(parent.id, job.businessId, [
            ...childrenByAgent.values(),
          ]);
          continue;
        }
      }

      const enabledState = await this.agentEnabledState(job.businessId, agent);
      if (!enabledState.enabled) {
        childrenByAgent.set(agent.agentKey, {
          agentKey: agent.agentKey,
          moduleId: agent.moduleId,
          name: agent.name,
          status: 'skipped',
          runId: existingChildRun?.id ?? previousChild?.runId ?? null,
          reasonCode: enabledState.reasonCode,
        });
        await this.saveProgress(parent.id, job.businessId, [
          ...childrenByAgent.values(),
        ]);
        continue;
      }

      const idempotencyKey =
        existingChildRun?.status === 'running'
          ? `${baseKey}:recovery:${attemptNumber + 1}`
          : baseKey;
      childrenByAgent.set(agent.agentKey, {
        agentKey: agent.agentKey,
        moduleId: agent.moduleId,
        name: agent.name,
        status: 'running',
        runId: previousChild?.runId ?? null,
        reasonCode: null,
      });
      const admitted = await this.saveProgress(parent.id, job.businessId, [
        ...childrenByAgent.values(),
      ]);
      if (!admitted) {
        childrenByAgent.set(agent.agentKey, {
          ...childrenByAgent.get(agent.agentKey)!,
          status: 'skipped',
          runId: previousChild?.runId ?? null,
          reasonCode: 'CANCELLED_BEFORE_REVIEW_STARTED',
        });
        await this.finishCancelled(parent.id, job.businessId, [
          ...childrenByAgent.values(),
        ]);
        return;
      }
      try {
        const childRun = await this.runChild(
          agent.agentKey,
          job.businessId,
          job.actorUserId,
          idempotencyKey,
          parent.id,
        );
        childrenByAgent.set(agent.agentKey, {
          agentKey: agent.agentKey,
          moduleId: agent.moduleId,
          name: agent.name,
          status: this.childStatus(childRun.status),
          runId: childRun.id,
          reasonCode:
            childRun.status === 'failed'
              ? (childRun.errorCode ?? 'SPECIALIST_RUN_FAILED')
              : null,
        });
      } catch (error) {
        const priorChildRun = await this.findChildByKeys(
          job.businessId,
          agent.agentKey,
          [idempotencyKey],
        );
        const disabledReason = this.disabledReasonFor(error);
        childrenByAgent.set(agent.agentKey, {
          agentKey: agent.agentKey,
          moduleId: agent.moduleId,
          name: agent.name,
          status: disabledReason ? 'skipped' : 'failed',
          runId: priorChildRun?.id ?? previousChild?.runId ?? null,
          reasonCode: disabledReason ?? normalizedErrorCode(error),
        });
      }
      await this.saveProgress(parent.id, job.businessId, [
        ...childrenByAgent.values(),
      ]);
    }
    await this.finishFromChildren(parent.id, job.businessId, [
      ...childrenByAgent.values(),
    ]);
  }

  private async processRetryChildren(
    parent: { id: string; businessId: string; output: Prisma.JsonValue },
    job: SpecialistAgentOrchestrationJobData,
    attemptNumber: number,
  ) {
    const keyHash = job.retryKeyHash!;
    const childrenByAgent = new Map<
      SpecialistKey,
      SpecialistOrchestrationChild
    >(
      readPersistedChildren(parent.output).map((child) => [
        child.agentKey,
        child,
      ]),
    );
    for (const agent of SPECIALISTS) {
      if (await this.isCancellationRequested(parent.id, job.businessId)) {
        await this.finishCancelled(parent.id, job.businessId, [
          ...childrenByAgent.values(),
        ]);
        return;
      }
      const previousChild = childrenByAgent.get(agent.agentKey);
      if (
        !previousChild ||
        (previousChild.status !== 'failed' &&
          previousChild.status !== 'running')
      ) {
        continue;
      }
      const baseKey = `${parent.id}:retry:${keyHash}:${agent.agentKey}`;
      const candidateKeys = this.keysThroughAttempt(baseKey, attemptNumber);
      const existingRetryRun = await this.findChildByKeys(
        job.businessId,
        agent.agentKey,
        candidateKeys,
      );
      if (existingRetryRun) {
        const reconciled = await this.reconcileInterruptedChild(
          job.businessId,
          agent.agentKey,
          { ...previousChild, status: 'running', runId: existingRetryRun.id },
          candidateKeys,
        );
        if (reconciled) {
          childrenByAgent.set(agent.agentKey, reconciled);
          await this.saveProgress(parent.id, job.businessId, [
            ...childrenByAgent.values(),
          ]);
          continue;
        }
      }
      const enabledState = await this.agentEnabledState(job.businessId, agent);
      if (!enabledState.enabled) {
        childrenByAgent.set(agent.agentKey, {
          ...previousChild,
          status: 'skipped',
          reasonCode: enabledState.reasonCode,
        });
        await this.saveProgress(parent.id, job.businessId, [
          ...childrenByAgent.values(),
        ]);
        continue;
      }
      const idempotencyKey =
        existingRetryRun?.status === 'running'
          ? `${baseKey}:recovery:${attemptNumber + 1}`
          : baseKey;
      childrenByAgent.set(agent.agentKey, {
        ...previousChild,
        status: 'running',
        reasonCode: null,
      });
      const admitted = await this.saveProgress(parent.id, job.businessId, [
        ...childrenByAgent.values(),
      ]);
      if (!admitted) {
        childrenByAgent.set(agent.agentKey, {
          ...previousChild,
          status: 'skipped',
          reasonCode: 'CANCELLED_BEFORE_REVIEW_STARTED',
        });
        await this.finishCancelled(parent.id, job.businessId, [
          ...childrenByAgent.values(),
        ]);
        return;
      }
      try {
        const childRun = await this.runChild(
          agent.agentKey,
          job.businessId,
          job.actorUserId,
          idempotencyKey,
          parent.id,
        );
        childrenByAgent.set(agent.agentKey, {
          ...previousChild,
          status: this.childStatus(childRun.status),
          runId: childRun.id,
          reasonCode:
            childRun.status === 'failed'
              ? (childRun.errorCode ?? 'SPECIALIST_RUN_FAILED')
              : null,
        });
      } catch (error) {
        const priorChildRun = await this.findChildByKeys(
          job.businessId,
          agent.agentKey,
          [idempotencyKey],
        );
        const disabledReason = this.disabledReasonFor(error);
        childrenByAgent.set(agent.agentKey, {
          ...previousChild,
          status: disabledReason ? 'skipped' : 'failed',
          runId: priorChildRun?.id ?? previousChild.runId,
          reasonCode: disabledReason ?? normalizedErrorCode(error),
        });
      }
      await this.saveProgress(parent.id, job.businessId, [
        ...childrenByAgent.values(),
      ]);
    }
    await this.finishFromChildren(parent.id, job.businessId, [
      ...childrenByAgent.values(),
    ]);
  }

  private async findChildByKeys(
    businessId: string,
    agentKey: SpecialistKey,
    keys: string[],
  ) {
    const hashes = keys.map(specialistAgentIdempotencyHash);
    return this.tenantPrisma.client.specialistAgentRun.findFirst({
      where: {
        businessId,
        agentKey,
        idempotencyKeyHash: { in: hashes },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        status: true,
        errorCode: true,
        startedAt: true,
      },
    });
  }

  private async agentEnabledState(
    businessId: string,
    agent: (typeof SPECIALISTS)[number],
  ): Promise<
    { enabled: true; reasonCode: null } | { enabled: false; reasonCode: string }
  > {
    const business = await this.tenantPrisma.client.business.findFirst({
      where: { id: businessId },
      select: { policies: true },
    });
    if (!business) {
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_BUSINESS_NOT_FOUND',
        'The current business could not be found while preparing the next specialist review.',
        HttpStatus.NOT_FOUND,
      );
    }
    const policies = resolvePolicies(business);
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        businessId,
        agent.policyAgentKey,
      ))
    ) {
      return { enabled: false, reasonCode: 'MODULE_DISABLED' };
    }
    if (!policies.bool(agent.enabledPolicy)) {
      return { enabled: false, reasonCode: 'AGENT_DISABLED' };
    }
    if (
      agent.agentKey === 'autonomous_commerce' &&
      (policies.num('commerce.autonomyLevel') ?? 0) <= 0
    ) {
      return {
        enabled: false,
        reasonCode: 'COMMERCE_AUTONOMY_DISABLED',
      };
    }
    return { enabled: true, reasonCode: null };
  }

  private disabledReasonFor(error: unknown): string | null {
    if (!(error instanceof AppException)) return null;
    const response = error.getResponse();
    if (!response || typeof response !== 'object' || !('code' in response))
      return null;
    const code = (response as { code?: unknown }).code;
    if (code === 'SPECIALIST_AGENT_DISABLED') return 'AGENT_DISABLED';
    if (code === 'BUSINESS_MODULE_DISABLED') return 'MODULE_DISABLED';
    if (code === 'COMMERCE_AGENT_DISABLED') return 'COMMERCE_AUTONOMY_DISABLED';
    return null;
  }

  private keysThroughAttempt(baseKey: string, attemptNumber: number) {
    return [
      baseKey,
      ...Array.from(
        { length: Math.max(0, attemptNumber) },
        (_, index) => `${baseKey}:recovery:${index + 1}`,
      ),
    ];
  }

  private async reconcileInterruptedChild(
    businessId: string,
    agentKey: SpecialistKey,
    child: SpecialistOrchestrationChild,
    candidateKeys: string[],
  ): Promise<SpecialistOrchestrationChild | null> {
    const persisted = child.runId
      ? await this.tenantPrisma.client.specialistAgentRun.findFirst({
          where: {
            id: child.runId,
            businessId,
            agentKey,
          },
          select: {
            id: true,
            status: true,
            errorCode: true,
            startedAt: true,
          },
        })
      : await this.findChildByKeys(businessId, agentKey, candidateKeys);
    if (!persisted) return null;
    if (persisted.status === 'running') {
      const finishedAt = new Date();
      await this.finishRunWithTerminalEvent({
        runId: persisted.id,
        businessId,
        agentKey,
        expectedStatuses: ['running'],
        status: 'failed',
        occurredAt: finishedAt,
        data: {
          finishedAt,
          errorCode: 'SPECIALIST_ORCHESTRATION_WORK_INTERRUPTED',
          errorMessage:
            'The orchestration worker restarted before this read-only review finished. It will be retried with a new idempotency key.',
        },
      });
      return null;
    }
    return {
      ...child,
      status: this.childStatus(persisted.status),
      runId: persisted.id,
      reasonCode:
        persisted.status === 'failed'
          ? (persisted.errorCode ?? 'SPECIALIST_RUN_FAILED')
          : null,
    };
  }

  private async finishFromChildren(
    runId: string,
    businessId: string,
    children: SpecialistOrchestrationChild[],
  ) {
    const parent = await this.tenantPrisma.client.specialistAgentRun.findFirst({
      where: {
        id: runId,
        businessId,
        agentKey: ORCHESTRATOR_AGENT_KEY,
      },
      select: { status: true },
    });
    if (parent?.status === 'cancel_requested') {
      await this.finishCancelled(runId, businessId, children);
      return;
    }
    const orderedChildren = SPECIALISTS.map((agent) =>
      children.find((child) => child.agentKey === agent.agentKey),
    ).filter((child): child is SpecialistOrchestrationChild => Boolean(child));
    const result = this.buildOutput(orderedChildren, new Date(), runId);
    const parentStatus =
      result.runningCount > 0
        ? 'running'
        : result.failedCount > 0 || result.partialCount > 0
          ? result.completedCount > 0 || result.partialCount > 0
            ? 'partially_succeeded'
            : 'failed'
          : 'completed';
    if (parentStatus === 'running') {
      await this.tenantPrisma.client.specialistAgentRun.updateMany({
        where: {
          id: runId,
          businessId,
          agentKey: ORCHESTRATOR_AGENT_KEY,
          status: 'running',
        },
        data: {
          status: parentStatus,
          output: result,
          finishedAt: null,
          errorCode: null,
        },
      });
    } else {
      const finishedAt = new Date();
      await this.finishRunWithTerminalEvent({
        runId,
        businessId,
        agentKey: ORCHESTRATOR_AGENT_KEY,
        expectedStatuses: ['running'],
        status: parentStatus,
        occurredAt: finishedAt,
        data: {
          output: result,
          finishedAt,
          errorCode:
            parentStatus === 'failed'
              ? 'SPECIALIST_ORCHESTRATION_CHILD_FAILURES'
              : null,
        },
      });
    }
  }

  private async isCancellationRequested(runId: string, businessId: string) {
    const parent = await this.tenantPrisma.client.specialistAgentRun.findFirst({
      where: {
        id: runId,
        businessId,
        agentKey: ORCHESTRATOR_AGENT_KEY,
      },
      select: { status: true },
    });
    return parent?.status === 'cancel_requested';
  }

  private async finishCancelled(
    runId: string,
    businessId: string,
    children: SpecialistOrchestrationChild[],
  ) {
    const childrenByAgent = new Map(
      children.map((child) => [child.agentKey, child]),
    );
    for (const agent of SPECIALISTS) {
      const existing = childrenByAgent.get(agent.agentKey);
      if (existing && existing.status !== 'running') continue;
      childrenByAgent.set(agent.agentKey, {
        agentKey: agent.agentKey,
        moduleId: agent.moduleId,
        name: agent.name,
        status: 'skipped',
        runId: existing?.runId ?? null,
        reasonCode: 'CANCELLED_BY_OWNER',
      });
    }
    const result = this.buildOutput(
      SPECIALISTS.map((agent) => childrenByAgent.get(agent.agentKey)!),
      new Date(),
      runId,
    );
    const finishedAt = new Date();
    await this.finishRunWithTerminalEvent({
      runId,
      businessId,
      agentKey: ORCHESTRATOR_AGENT_KEY,
      expectedStatuses: ['cancel_requested'],
      status: 'cancelled',
      occurredAt: finishedAt,
      data: {
        output: {
          ...result,
          summary: `Stopped by the owner. ${result.completedCount} specialist review(s) completed, ${result.failedCount} failed and ${result.skippedCount} did not start. Any started review finished read-only.`,
        },
        finishedAt,
        errorCode: 'SPECIALIST_ORCHESTRATION_CANCELLED',
      },
    });
  }

  private async enqueueOrFail(job: SpecialistAgentOrchestrationJobData) {
    try {
      await this.addJob(job);
    } catch {
      await this.finishQueueFailure(
        job,
        'SPECIALIST_ORCHESTRATION_QUEUE_UNAVAILABLE',
      );
      throw new AppException(
        'SPECIALIST_ORCHESTRATION_QUEUE_UNAVAILABLE',
        'The cross-agent review was saved but could not be queued. Refresh history and try again when background processing is available.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private addJob(job: SpecialistAgentOrchestrationJobData) {
    const jobId =
      job.mode === 'retry'
        ? `specialist-orchestration-${job.parentRunId}-retry-${job.retryKeyHash}`
        : `specialist-orchestration-${job.parentRunId}-initial`;
    return this.queue.add('run', job, {
      jobId,
      attempts: SPECIALIST_AGENT_ORCHESTRATION_JOB_ATTEMPTS,
      backoff: {
        type: 'exponential',
        delay: SPECIALIST_AGENT_ORCHESTRATION_BACKOFF_MS,
      },
      removeOnComplete: true,
      removeOnFail: 500,
    });
  }

  private async finishQueueFailure(
    job: SpecialistAgentOrchestrationJobData,
    errorCode: string,
    attemptNumber = 0,
  ) {
    const parent = await this.prisma.specialistAgentRun.findFirst({
      where: {
        id: job.parentRunId,
        businessId: job.businessId,
        agentKey: ORCHESTRATOR_AGENT_KEY,
        status: { in: ['running', 'cancel_requested'] },
      },
      select: { output: true, status: true },
    });
    if (!parent) return;
    if (parent.status === 'cancel_requested') {
      await this.finishCancelled(
        job.parentRunId,
        job.businessId,
        readPersistedChildren(parent.output),
      );
      return;
    }
    const childrenByAgent = new Map<
      SpecialistKey,
      SpecialistOrchestrationChild
    >(
      readPersistedChildren(parent.output).map((child) => [
        child.agentKey,
        child,
      ]),
    );
    for (const agent of SPECIALISTS) {
      const previousChild = childrenByAgent.get(agent.agentKey);
      if (
        previousChild &&
        ['completed', 'partially_succeeded', 'skipped', 'failed'].includes(
          previousChild.status,
        )
      ) {
        continue;
      }
      const baseKey =
        job.mode === 'retry'
          ? `${job.parentRunId}:retry:${job.retryKeyHash}:${agent.agentKey}`
          : `${job.parentRunId}:${agent.agentKey}`;
      const child = await this.prisma.specialistAgentRun.findFirst({
        where: {
          businessId: job.businessId,
          agentKey: agent.agentKey,
          idempotencyKeyHash: {
            in: this.keysThroughAttempt(baseKey, attemptNumber + 1).map(
              specialistAgentIdempotencyHash,
            ),
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, status: true, errorCode: true, startedAt: true },
      });
      if (child?.status === 'running') {
        const finishedAt = new Date();
        await this.finishRunWithTerminalEvent({
          runId: child.id,
          businessId: job.businessId,
          agentKey: agent.agentKey,
          expectedStatuses: ['running'],
          status: 'failed',
          occurredAt: finishedAt,
          data: {
            finishedAt,
            errorCode,
          },
        });
      }
      childrenByAgent.set(agent.agentKey, {
        agentKey: agent.agentKey,
        moduleId: agent.moduleId,
        name: agent.name,
        status: 'failed',
        runId: child?.id ?? previousChild?.runId ?? null,
        reasonCode: errorCode,
      });
    }
    const result = this.buildOutput(
      SPECIALISTS.map((agent) => childrenByAgent.get(agent.agentKey)!),
      new Date(),
      job.parentRunId,
    );
    const finishedAt = new Date();
    const terminalStatus =
      result.completedCount || result.partialCount
        ? 'partially_succeeded'
        : 'failed';
    await this.finishRunWithTerminalEvent({
      runId: job.parentRunId,
      businessId: job.businessId,
      agentKey: ORCHESTRATOR_AGENT_KEY,
      expectedStatuses: ['running'],
      status: terminalStatus,
      occurredAt: finishedAt,
      data: {
        output: result,
        finishedAt,
        errorCode,
      },
    });
  }

  private async runChild(
    agentKey: SpecialistKey,
    businessId: string,
    actorUserId: string,
    idempotencyKey: string,
    parentRunId: string,
  ) {
    const options = {
      triggerType: 'manual' as const,
      includeAiSummary: false,
      parentRunId,
    };
    switch (agentKey) {
      case 'inventory_intelligence':
        return this.inventory.run(
          businessId,
          actorUserId,
          idempotencyKey,
          options,
        );
      case 'financial_intelligence':
        return this.finance.run(
          businessId,
          actorUserId,
          { month: new Date().toISOString().slice(0, 7), period: 'month' },
          idempotencyKey,
          options,
        );
      case 'customer_intelligence': {
        return this.customers.run(
          businessId,
          actorUserId,
          'current_business',
          idempotencyKey,
          businessId,
          options,
        );
      }
      case 'seo_autopilot':
        return this.seo.run(businessId, actorUserId, idempotencyKey, options);
      case 'autonomous_commerce':
        return this.commerce.run(
          businessId,
          actorUserId,
          idempotencyKey,
          options,
        );
    }
  }

  private async saveProgress(
    runId: string,
    businessId: string,
    children: SpecialistOrchestrationChild[],
  ) {
    const observedAt = new Date();
    const output = this.buildOutput(children, observedAt, runId);
    return this.prisma.$transaction(async (tx) => {
      const lockedRows = await tx.$queryRaw<
        Array<{ output: Prisma.JsonValue }>
      >(Prisma.sql`
        SELECT output
        FROM specialist_agent_runs
        WHERE id = ${runId}
          AND business_id = ${businessId}
          AND agent_key = ${ORCHESTRATOR_AGENT_KEY}
          AND status = 'running'
        FOR UPDATE
      `);
      if (lockedRows.length === 0) return false;
      const updated = await tx.specialistAgentRun.updateMany({
        where: {
          id: runId,
          businessId,
          agentKey: ORCHESTRATOR_AGENT_KEY,
          // This write is also the admission decision for a child review. If the owner won the
          // race and changed the parent to cancel_requested, no later specialist may start.
          status: 'running',
        },
        data: { output },
      });
      if (updated.count !== 1) return false;
      await this.recordChildStateEvents(
        tx,
        businessId,
        runId,
        lockedRows[0].output,
        output,
        observedAt,
      );
      return true;
    });
  }

  private buildOutput(
    children: SpecialistOrchestrationChild[],
    observedAt: Date,
    correlationId: string,
  ): OrchestrationOutput {
    const completedCount = children.filter(
      (child) => child.status === 'completed',
    ).length;
    const partialCount = children.filter(
      (child) => child.status === 'partially_succeeded',
    ).length;
    const failedCount = children.filter(
      (child) => child.status === 'failed',
    ).length;
    const skippedCount = children.filter(
      (child) => child.status === 'skipped',
    ).length;
    const runningCount = children.filter(
      (child) => child.status === 'running',
    ).length;
    return {
      summary: `${completedCount} specialist review(s) completed, ${partialCount} partially succeeded, ${failedCount} failed, ${skippedCount} skipped${runningCount ? ` and ${runningCount} remain running` : ''}. Reviews are read-only and no AI provider was called.`,
      correlationId,
      children,
      completedCount,
      partialCount,
      failedCount,
      skippedCount,
      runningCount,
      observedAt: observedAt.toISOString(),
      execution: 'sequential_read_only',
      aiProviderCalls: 0,
    };
  }

  private childStatus(status: string): OrchestrationChildStatus {
    if (status === 'completed') return 'completed';
    if (status === 'partially_succeeded') return 'partially_succeeded';
    if (status === 'failed') return 'failed';
    return 'running';
  }

  private outputForClient(
    output: Prisma.JsonValue,
    runId: string,
  ): OrchestrationOutput | null {
    if (!output || typeof output !== 'object' || Array.isArray(output))
      return null;
    const json = output;
    if (
      typeof json.summary !== 'string' ||
      typeof json.observedAt !== 'string' ||
      !Array.isArray(json.children)
    )
      return null;
    const observedAt = new Date(json.observedAt);
    if (!Number.isFinite(observedAt.getTime())) return null;
    const children = readPersistedChildren(output);
    const correlationId =
      typeof json.correlationId === 'string' ? json.correlationId : runId;
    const built = this.buildOutput(children, observedAt, correlationId);
    return {
      ...built,
      summary: typeof json.summary === 'string' ? json.summary : built.summary,
    };
  }

  private responseFromRun(run: {
    id: string;
    status: string;
    createdAt: Date;
    finishedAt: Date | null;
    output: Prisma.JsonValue;
    errorCode: string | null;
  }) {
    return {
      id: run.id,
      status: run.status,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
      errorCode: run.errorCode,
      result: this.outputForClient(run.output, run.id),
      reused: true,
    };
  }

  private scopedBusinessId(businessId: string) {
    return this.cls.get<string>(CLS_KEY_BUSINESS_ID) ?? businessId;
  }

  /**
   * Record only confirmed cross-business object probes. The response remains the same as for a
   * missing ID, and the tenant-local audit event does not reveal the owning business.
   */
  private async auditCrossTenantProbe(
    requestingBusinessId: string,
    runId: string,
    operation: 'cancel' | 'retry_failed',
    actorUserId?: string,
  ) {
    const foreignRun = await this.prisma.specialistAgentRun.findFirst({
      where: {
        id: runId,
        businessId: { not: requestingBusinessId },
        agentKey: ORCHESTRATOR_AGENT_KEY,
      },
      select: { id: true },
    });
    if (!foreignRun) return;

    await this.tenantPrisma.client.auditLog.create({
      data: {
        businessId: requestingBusinessId,
        actorUserId: actorUserId ?? null,
        action: 'specialist_agent.orchestration_cross_tenant_access_denied',
        entity: 'SpecialistAgentRun',
        entityId: runId,
        after: { operation, denied: true },
      },
    });
  }
}
