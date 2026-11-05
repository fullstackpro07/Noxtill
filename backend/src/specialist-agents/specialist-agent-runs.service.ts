import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ListSpecialistAgentRunsDto } from './dto/list-specialist-agent-runs.dto';
import { ListSpecialistAgentRunEventsDto } from './dto/list-specialist-agent-run-events.dto';

const SPECIALIST_RUN_DETAIL_SELECT = {
  id: true,
  initiatedByUserId: true,
  agentKey: true,
  agentVersion: true,
  agentConfigVersion: true,
  moduleId: true,
  triggerType: true,
  status: true,
  errorCode: true,
  output: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
  _count: {
    select: {
      recommendations: true,
      evidence: true,
      actions: true,
      toolCalls: true,
    },
  },
} satisfies Prisma.SpecialistAgentRunSelect;

function isRunDetailsExpired(output: Prisma.JsonValue): boolean {
  return (
    output !== null &&
    typeof output === 'object' &&
    !Array.isArray(output) &&
    output.retentionStatus === 'expired'
  );
}

const TERMINAL_RUN_STATUSES = new Set([
  'completed',
  'partial',
  'partially_succeeded',
  'failed',
  'cancelled',
  'skipped',
]);

const TERMINAL_RUN_EVENT_NAMES: Record<string, string> = {
  completed: 'agent.run.completed',
  partial: 'agent.run.partial',
  partially_succeeded: 'agent.run.partial',
  failed: 'agent.run.failed',
  cancelled: 'agent.run.cancelled',
  skipped: 'agent.run.skipped',
};

const ACTION_STATE_EVENT_NAMES: Record<string, string> = {
  approval_required: 'agent.action.awaiting_approval',
  failed: 'agent.action.failed',
  partially_succeeded: 'agent.action.failed',
  verification_failed: 'agent.action.failed',
  verified: 'agent.action.verified',
};

function actionEventName(event: {
  eventType: string;
  toState: string | null;
}): string {
  if (event.eventType === 'proposal_updated') {
    return 'agent.action.proposal_updated';
  }
  return (
    (event.toState && ACTION_STATE_EVENT_NAMES[event.toState]) ??
    'agent.action.state_changed'
  );
}

function withoutInitiatingUser<T extends { initiatedByUserId: string | null }>(
  run: T,
): Omit<T, 'initiatedByUserId'> {
  const safeRun = { ...run };
  Reflect.deleteProperty(safeRun, 'initiatedByUserId');
  return safeRun;
}

@Injectable()
export class SpecialistAgentRunsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(businessId: string, query: ListSpecialistAgentRunsDto) {
    const limit = query.limit ?? 25;
    const where: Prisma.SpecialistAgentRunWhereInput = {
      businessId,
      ...(query.agentKey ? { agentKey: query.agentKey } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.cursor) {
      const cursor =
        await this.tenantPrisma.client.specialistAgentRun.findFirst({
          where: { ...where, id: query.cursor },
          select: { id: true },
        });
      if (!cursor) {
        throw new AppException(
          'SPECIALIST_RUN_CURSOR_INVALID',
          'The run cursor is no longer available in this business and filter scope. Refresh the list.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const rows = await this.tenantPrisma.client.specialistAgentRun.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: SPECIALIST_RUN_DETAIL_SELECT,
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map(({ _count, output, ...run }) => ({
        ...withoutInitiatingUser(run),
        relatedCounts: _count,
        detailsExpired: isRunDetailsExpired(output),
        outputRedacted: true as const,
        detailLocation: 'canonical_module' as const,
      })),
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
      pageSize: limit,
    };
  }

  async get(businessId: string, runId: string) {
    const run = await this.tenantPrisma.client.specialistAgentRun.findFirst({
      where: { businessId, id: runId },
      select: SPECIALIST_RUN_DETAIL_SELECT,
    });
    if (!run) {
      throw new AppException(
        'SPECIALIST_RUN_NOT_FOUND',
        'The specialist run is not available in this business.',
        HttpStatus.NOT_FOUND,
      );
    }

    const { _count, output, ...runDetails } = run;
    return {
      ...withoutInitiatingUser(runDetails),
      relatedCounts: _count,
      detailsExpired: isRunDetailsExpired(output),
      outputRedacted: true,
      detailLocation: 'canonical_module',
    };
  }

  async listEvents(
    businessId: string,
    runId: string,
    query: ListSpecialistAgentRunEventsDto = new ListSpecialistAgentRunEventsDto(),
  ) {
    const run = await this.tenantPrisma.client.specialistAgentRun.findFirst({
      where: { businessId, id: runId },
      select: SPECIALIST_RUN_DETAIL_SELECT,
    });
    if (!run) {
      throw new AppException(
        'SPECIALIST_RUN_NOT_FOUND',
        'The specialist run is not available in this business.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.materializeLifecycleEvents(businessId, [run]);
    const limit = query.limit ?? 25;
    const where: Prisma.SpecialistAgentRunEventWhereInput = {
      businessId,
      runId,
    };
    if (query.cursor) {
      const cursor =
        await this.tenantPrisma.client.specialistAgentRunEvent.findFirst({
          where: { ...where, id: query.cursor },
          select: { id: true },
        });
      if (!cursor) {
        throw new AppException(
          'SPECIALIST_RUN_EVENT_CURSOR_INVALID',
          'The event cursor is not available for this run. Refresh the timeline.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    const rows =
      await this.tenantPrisma.client.specialistAgentRunEvent.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          eventName: true,
          occurredAt: true,
          sourceModule: true,
          entityId: true,
          entityVersion: true,
          schemaVersion: true,
          correlationId: true,
          actorUserId: true,
          payload: true,
        },
      });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null;
    const events = page.reverse();
    return {
      runId,
      items: events.map(
        ({
          id,
          eventName,
          occurredAt,
          sourceModule,
          entityId,
          entityVersion,
          schemaVersion,
          correlationId,
          actorUserId,
          payload,
        }) => ({
          eventId: id,
          eventName,
          occurredAt,
          sourceModule,
          entityId,
          entityVersion,
          schemaVersion,
          correlationId,
          actorUserId,
          payload,
        }),
      ),
      eventHistoryNote:
        'New run-created and terminal outcome events are written in the same transaction as their run state. Older run-created events and terminal outcomes are materialized from saved timestamps when this timeline opens. Action events reflect saved state changes and proposal revisions. Cross-agent orchestration also records worker pickup, owner stop requests and retry queueing. Other intermediate run-state changes and non-action activity are not captured here.',
      nextCursor,
      hasMore,
      pageSize: limit,
      payloadValuesRedacted: true,
    };
  }

  private async materializeLifecycleEvents(
    businessId: string,
    runs: Array<{
      id: string;
      agentKey: string;
      agentVersion: string;
      agentConfigVersion: number | null;
      moduleId: string;
      triggerType: string;
      status: string;
      initiatedByUserId: string | null;
      startedAt: Date;
      finishedAt: Date | null;
      createdAt: Date;
    }>,
  ) {
    if (!runs.length) return;
    const events: Prisma.SpecialistAgentRunEventCreateManyInput[] = [];
    for (const run of runs) {
      const entityVersion =
        run.agentConfigVersion === null
          ? run.agentVersion
          : String(run.agentConfigVersion);
      const base = {
        businessId,
        runId: run.id,
        sourceModule: run.moduleId,
        entityId: run.id,
        entityVersion,
        schemaVersion: 1,
        correlationId: run.id,
        actorUserId: run.initiatedByUserId,
      };
      events.push({
        ...base,
        id: randomUUID(),
        dedupeKey: createHash('sha256')
          .update(`${businessId}:${run.id}:agent.run.created`)
          .digest('hex'),
        eventName: 'agent.run.created',
        occurredAt: run.createdAt,
        payload: {
          agentKey: run.agentKey,
          triggerType: run.triggerType,
        },
      });
      if (run.finishedAt && TERMINAL_RUN_STATUSES.has(run.status)) {
        const eventName = TERMINAL_RUN_EVENT_NAMES[run.status];
        events.push({
          ...base,
          id: randomUUID(),
          dedupeKey: createHash('sha256')
            .update(`${businessId}:${run.id}:${eventName}:${run.status}`)
            .digest('hex'),
          eventName,
          occurredAt: run.finishedAt,
          payload: {
            agentKey: run.agentKey,
            status: run.status,
            triggerType: run.triggerType,
          },
        });
      }
    }

    const actions =
      await this.tenantPrisma.client.specialistAgentAction.findMany({
        where: {
          businessId,
          runId: { in: runs.map((run) => run.id) },
        },
        select: {
          id: true,
          runId: true,
          moduleId: true,
          actionType: true,
          expectedVersion: true,
          correlationId: true,
          events: {
            orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }, { id: 'asc' }],
            select: {
              id: true,
              eventType: true,
              fromState: true,
              toState: true,
              actorUserId: true,
              createdAt: true,
            },
          },
        },
      });
    for (const action of actions) {
      for (const actionEvent of action.events) {
        const eventName = actionEventName(actionEvent);
        events.push({
          id: randomUUID(),
          dedupeKey: createHash('sha256')
            .update(
              `${businessId}:${action.runId}:${actionEvent.id}:${eventName}`,
            )
            .digest('hex'),
          businessId,
          runId: action.runId,
          eventName,
          occurredAt: actionEvent.createdAt,
          sourceModule: action.moduleId,
          entityId: action.id,
          entityVersion:
            action.expectedVersion === null
              ? null
              : String(action.expectedVersion),
          schemaVersion: 1,
          correlationId: action.correlationId,
          actorUserId: actionEvent.actorUserId,
          payload: {
            actionType: action.actionType,
            fromState: actionEvent.fromState,
            state: actionEvent.toState,
            eventType: actionEvent.eventType,
          },
        });
      }
    }

    await this.tenantPrisma.client.specialistAgentRunEvent.createMany({
      data: events,
      skipDuplicates: true,
    });
  }

  async listEvidence(businessId: string, runId: string, cursor?: string) {
    if (cursor && cursor.length > 191) {
      throw new AppException(
        'SPECIALIST_EVIDENCE_CURSOR_INVALID',
        'The evidence cursor is invalid. Refresh the evidence list.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const run = await this.tenantPrisma.client.specialistAgentRun.findFirst({
      where: { businessId, id: runId },
      select: { id: true },
    });
    if (!run) {
      throw new AppException(
        'SPECIALIST_RUN_NOT_FOUND',
        'The specialist run is not available in this business.',
        HttpStatus.NOT_FOUND,
      );
    }

    const where: Prisma.SpecialistAgentEvidenceWhereInput = {
      businessId,
      runId: run.id,
    };
    if (cursor) {
      const cursorRow =
        await this.tenantPrisma.client.specialistAgentEvidence.findFirst({
          where: { ...where, id: cursor },
          select: { id: true },
        });
      if (!cursorRow) {
        throw new AppException(
          'SPECIALIST_EVIDENCE_CURSOR_INVALID',
          'The evidence cursor is no longer available for this run. Refresh the evidence list.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const rows =
      await this.tenantPrisma.client.specialistAgentEvidence.findMany({
        where,
        orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
        take: 101,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          recommendationId: true,
          sourceType: true,
          resourceType: true,
          resourceId: true,
          fieldRefs: true,
          observedAt: true,
          fetchedAt: true,
          freshness: true,
        },
      });
    const hasMore = rows.length > 100;
    const items = hasMore ? rows.slice(0, 100) : rows;
    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
      pageSize: 100,
      observedValuesRedacted: true,
    };
  }

  async listToolCalls(businessId: string, runId: string) {
    const run = await this.tenantPrisma.client.specialistAgentRun.findFirst({
      where: { businessId, id: runId },
      select: { id: true },
    });
    if (!run) {
      throw new AppException(
        'SPECIALIST_RUN_NOT_FOUND',
        'The specialist run is not available in this business.',
        HttpStatus.NOT_FOUND,
      );
    }

    const rows =
      await this.tenantPrisma.client.specialistAgentToolCall.findMany({
        where: { businessId, runId: run.id },
        orderBy: [{ round: 'asc' }, { sequence: 'asc' }],
        take: 101,
        select: {
          id: true,
          agentKey: true,
          moduleId: true,
          toolKey: true,
          toolVersion: true,
          round: true,
          sequence: true,
          status: true,
          inputSha256: true,
          inputFields: true,
          outputResourceType: true,
          outputResourceId: true,
          durationMs: true,
          retryable: true,
          errorCode: true,
          correlationId: true,
          createdAt: true,
          finishedAt: true,
        },
      });
    const hasMore = rows.length > 100;
    return {
      items: hasMore ? rows.slice(0, 100) : rows,
      pageSize: 100,
      hasMore,
      inputValuesRedacted: true as const,
      outputValuesRedacted: true as const,
    };
  }
}
