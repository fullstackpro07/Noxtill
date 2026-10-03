import { HttpStatus, Injectable } from '@nestjs/common';
import { assertAutomationGovernance } from './automation-governance.util';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { AppException } from '../../common/filters/app.exception';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
  WorkflowSchedulePreviewDto,
} from './dto/create-workflow.dto';
import { RestoreWorkflowVersionDto } from './dto/restore-workflow-version.dto';
import { ListWorkflowRunsDto } from './dto/list-workflow-runs.dto';
import { WORKFLOW_ERROR_CODES } from './workflows.constants';
import {
  evaluateConditions,
  WorkflowCondition,
} from './workflow-condition.util';
import { buildTriggerContext } from './workflow-context.util';
import { mapActivityEventToTriggerKey } from './workflow-trigger-map.util';
import { validateWorkflowDefinition } from './workflow-definition.util';
import {
  nextCronOccurrence,
  validateScheduleConfiguration,
} from './workflow-schedule.util';
import { WorkflowAction } from './workflow-action.util';
import {
  mergeWorkflowMappedData,
  previewWorkflowDataMapping,
} from './workflow-data-mapper.util';
import {
  resolveWorkflowCustomFieldValue,
  resolveWorkflowMessageTemplate,
  workflowMessageTemplateFields,
} from './workflow-message-template.util';
import {
  Prisma,
  WorkflowConditionMode,
  WorkflowTriggerKey,
} from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import {
  validateWorkflowGraph,
  WorkflowGraph,
  workflowGraphActions,
  resolveWorkflowGraphPath,
} from './workflow-graph.util';
import { findWorkflowTemplate } from './workflow-template-catalog';

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/** Automations engine (UPD-BE-028) — authoring/CRUD half. Real dispatch lives in `WorkflowTriggerService`. */
@Injectable()
export class WorkflowsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  previewSchedule(dto: WorkflowSchedulePreviewDto) {
    const timezone = dto.scheduleTimezone?.trim() || 'UTC';
    const cronExpression = dto.scheduleCronExpression?.trim() || null;
    const validationError = validateScheduleConfiguration(
      dto.scheduleEveryMinutes,
      cronExpression,
      timezone,
    );
    if (validationError) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.INVALID_DEFINITION,
        validationError,
        HttpStatus.BAD_REQUEST,
      );
    }

    const generatedAt = new Date();
    const occurrences: Date[] = [];
    let cursor = generatedAt;
    for (let index = 0; index < 5; index += 1) {
      cursor = cronExpression
        ? nextCronOccurrence(cronExpression, timezone, cursor)
        : new Date(cursor.getTime() + dto.scheduleEveryMinutes! * 60 * 1000);
      occurrences.push(cursor);
    }
    return {
      mode: cronExpression ? ('cron' as const) : ('interval' as const),
      timezone,
      generatedAt,
      occurrences,
    };
  }

  async create(businessId: string, dto: CreateWorkflowDto) {
    const graph = dto.graph as unknown as WorkflowGraph | undefined;
    const conditions = graph ? [] : (dto.conditions ?? []);
    const conditionMode = dto.conditionMode ?? WorkflowConditionMode.all;
    const actions = graph ? workflowGraphActions(graph) : (dto.actions ?? []);
    if (graph) {
      this.validateGraph(
        graph,
        dto.triggerKey,
        dto.name,
        dto.scheduleEveryMinutes,
        dto.scheduleCronExpression,
        dto.scheduleTimezone,
      );
    } else {
      this.validateDefinition(
        dto.triggerKey,
        dto.name,
        conditions,
        actions,
        dto.scheduleEveryMinutes,
        dto.scheduleCronExpression,
        dto.scheduleTimezone,
      );
    }
    const conditionsJson = conditions as Prisma.InputJsonValue;
    const actionsJson = actions as Prisma.InputJsonValue;
    await this.assertSubWorkflowTargets(
      null,
      actions as unknown as WorkflowAction[],
    );

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const workflow = await tx.workflow.create({
        data: {
          businessId,
          name: dto.name,
          triggerKey: dto.triggerKey,
          scheduleEveryMinutes: dto.scheduleEveryMinutes ?? null,
          scheduleCronExpression: dto.scheduleCronExpression?.trim() || null,
          scheduleTimezone: dto.scheduleTimezone?.trim() || 'UTC',
          nextScheduleAt: null,
          conditions: conditionsJson,
          conditionMode,
          actions: actionsJson,
          ...(graph
            ? { graph: graph as unknown as Prisma.InputJsonValue }
            : {}),
          // New customer-facing automations must be tested before they are allowed to send.
          active: false,
        },
      });

      await tx.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          businessId,
          version: workflow.version,
          name: workflow.name,
          triggerKey: workflow.triggerKey,
          scheduleEveryMinutes: workflow.scheduleEveryMinutes,
          scheduleCronExpression: workflow.scheduleCronExpression,
          scheduleTimezone: workflow.scheduleTimezone,
          conditions: conditionsJson,
          conditionMode,
          actions: actionsJson,
          ...(graph
            ? { graph: graph as unknown as Prisma.InputJsonValue }
            : {}),
        },
      });

      return workflow;
    });
  }

  installTemplate(businessId: string, templateId: string, name?: string) {
    const template = findWorkflowTemplate(templateId);
    if (!template) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.TEMPLATE_NOT_FOUND,
        'Workflow template not found.',
        HttpStatus.NOT_FOUND,
      );
    }

    return this.create(businessId, {
      name: name === undefined ? template.name : name.trim(),
      triggerKey: template.triggerKey,
      conditions: [],
      conditionMode: WorkflowConditionMode.all,
      actions: structuredClone(template.actions),
    });
  }

  /** `successfulRunCount`/`lastFiredAt` are derived from real `WorkflowRun` rows.
   * A successful run means at least one action was accepted by SendGate; provider delivery is
   * tracked separately on the related Message record. `lastFiredAt` includes every run status. */
  async list(triggerKey?: WorkflowTriggerKey, includeArchived = false) {
    const workflows = await this.tenantPrisma.client.workflow.findMany({
      where: {
        triggerKey,
        archivedAt: includeArchived ? undefined : null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return Promise.all(
      workflows.map(async (workflow) => {
        const [successfulRunCount, lastRun] = await Promise.all([
          this.tenantPrisma.client.workflowRun.count({
            where: { workflowId: workflow.id, status: 'success' },
          }),
          this.tenantPrisma.client.workflowRun.findFirst({
            where: { workflowId: workflow.id },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { createdAt: true },
          }),
        ]);
        return {
          ...workflow,
          successfulRunCount,
          lastFiredAt: lastRun?.createdAt ?? null,
        };
      }),
    );
  }

  /**
   * Real Command Center counters. A successful run has at least one queued action; it does not
   * claim provider delivery. A skipped run may have failed conditions or had no eligible target.
   */
  async summary(businessId: string) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      totalWorkflows,
      activeWorkflows,
      successfulRuns,
      failedRuns,
      skippedRuns,
      runsLast7Days,
      latestRun,
    ] = await Promise.all([
      this.tenantPrisma.client.workflow.count({ where: { businessId } }),
      this.tenantPrisma.client.workflow.count({
        where: { businessId, active: true },
      }),
      this.tenantPrisma.client.workflowRun.count({
        where: { businessId, status: 'success' },
      }),
      this.tenantPrisma.client.workflowRun.count({
        where: { businessId, status: 'failed' },
      }),
      this.tenantPrisma.client.workflowRun.count({
        where: { businessId, status: 'skipped' },
      }),
      this.tenantPrisma.client.workflowRun.count({
        where: { businessId, createdAt: { gte: since } },
      }),
      this.tenantPrisma.client.workflowRun.findFirst({
        where: { businessId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true },
      }),
    ]);
    const completedRuns = successfulRuns + failedRuns;
    return {
      totalWorkflows,
      activeWorkflows,
      successfulRuns,
      failedRuns,
      skippedRuns,
      runsLast7Days,
      successRate:
        completedRuns === 0
          ? null
          : Math.round((successfulRuns / completedRuns) * 1000) / 10,
      lastRunAt: latestRun?.createdAt ?? null,
      unavailableMetrics: [
        {
          key: 'time_saved',
          reason:
            'Workflow runs do not record measured operator time, so time saved is not calculated.',
        },
        {
          key: 'revenue_attributed',
          reason:
            'Workflow-attributed revenue is not yet linked to canonical orders.',
        },
      ],
    };
  }

  async findOne(id: string) {
    const workflow = await this.tenantPrisma.client.workflow.findUnique({
      where: { id },
    });
    if (!workflow) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.NOT_FOUND,
        'Workflow not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return workflow;
  }

  async update(id: string, dto: UpdateWorkflowDto) {
    const current = await this.findOne(id);
    if (current.archivedAt) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.ARCHIVED,
        'Restore this workflow before editing or activating it.',
        HttpStatus.CONFLICT,
      );
    }
    const expectedVersion = dto.expectedVersion ?? current.version;
    const expectedUpdatedAt = dto.expectedUpdatedAt
      ? new Date(dto.expectedUpdatedAt)
      : current.updatedAt;
    if (
      expectedVersion !== current.version ||
      expectedUpdatedAt.getTime() !== current.updatedAt.getTime()
    ) {
      throw this.versionConflict();
    }
    const nextName = dto.name ?? current.name;
    const hasLegacyDefinition =
      dto.conditions !== undefined ||
      dto.actions !== undefined ||
      dto.conditionMode !== undefined;
    const nextGraphInput =
      dto.graph !== undefined
        ? dto.graph
        : current.graph && hasLegacyDefinition
          ? null
          : current.graph;
    const nextGraph = nextGraphInput
      ? (nextGraphInput as unknown as WorkflowGraph)
      : null;
    const nextConditions = nextGraph
      ? []
      : (dto.conditions ?? current.conditions);
    const nextActions = nextGraph
      ? workflowGraphActions(nextGraph)
      : (dto.actions ?? current.actions);
    const nextConditionMode = nextGraph
      ? current.conditionMode
      : (dto.conditionMode ?? current.conditionMode);
    const switchingToCron =
      dto.scheduleCronExpression !== undefined &&
      dto.scheduleCronExpression !== null;
    const switchingToInterval =
      dto.scheduleEveryMinutes !== undefined &&
      dto.scheduleEveryMinutes !== null;
    const nextScheduleEveryMinutes = switchingToCron
      ? null
      : dto.scheduleEveryMinutes === undefined
        ? current.scheduleEveryMinutes
        : dto.scheduleEveryMinutes;
    const nextScheduleCronExpression = switchingToInterval
      ? null
      : dto.scheduleCronExpression === undefined
        ? current.scheduleCronExpression
        : dto.scheduleCronExpression?.trim() || null;
    const nextScheduleTimezone =
      dto.scheduleTimezone === undefined
        ? current.scheduleTimezone
        : dto.scheduleTimezone.trim();
    const graphChanged = !isDeepStrictEqual(nextGraph, current.graph);
    const definitionChanged =
      (dto.name !== undefined && dto.name !== current.name) ||
      graphChanged ||
      (!nextGraph &&
        dto.conditions !== undefined &&
        !isDeepStrictEqual(dto.conditions, current.conditions)) ||
      (!nextGraph &&
        dto.conditionMode !== undefined &&
        dto.conditionMode !== current.conditionMode) ||
      (!nextGraph &&
        dto.actions !== undefined &&
        !isDeepStrictEqual(dto.actions, current.actions)) ||
      (nextGraph && !isDeepStrictEqual(nextActions, current.actions)) ||
      (dto.scheduleEveryMinutes !== undefined &&
        dto.scheduleEveryMinutes !== current.scheduleEveryMinutes) ||
      (dto.scheduleCronExpression !== undefined &&
        nextScheduleCronExpression !== current.scheduleCronExpression) ||
      (dto.scheduleTimezone !== undefined &&
        nextScheduleTimezone !== current.scheduleTimezone);
    if (definitionChanged) {
      if (nextGraph) {
        this.validateGraph(
          nextGraph,
          current.triggerKey,
          nextName,
          nextScheduleEveryMinutes,
          nextScheduleCronExpression,
          nextScheduleTimezone,
        );
      } else {
        this.validateDefinition(
          current.triggerKey,
          nextName,
          nextConditions,
          nextActions,
          nextScheduleEveryMinutes,
          nextScheduleCronExpression,
          nextScheduleTimezone,
        );
      }
    }

    const nextActive = dto.active ?? current.active;
    const scheduleConfigurationChanged =
      definitionChanged &&
      (nextScheduleEveryMinutes !== current.scheduleEveryMinutes ||
        nextScheduleCronExpression !== current.scheduleCronExpression ||
        nextScheduleTimezone !== current.scheduleTimezone);
    const shouldStartSchedule =
      current.triggerKey === WorkflowTriggerKey.scheduled &&
      nextActive &&
      ((dto.active === true && !current.active) ||
        scheduleConfigurationChanged ||
        current.nextScheduleAt === null);
    const scheduleStart = new Date();
    const nextScheduleAt =
      current.triggerKey !== WorkflowTriggerKey.scheduled || !nextActive
        ? null
        : shouldStartSchedule
          ? nextScheduleCronExpression
            ? nextCronOccurrence(
                nextScheduleCronExpression,
                nextScheduleTimezone,
                scheduleStart,
              )
            : new Date(
                scheduleStart.getTime() +
                  (nextScheduleEveryMinutes ?? 0) * 60 * 1000,
              )
          : undefined;

    await this.assertSubWorkflowTargets(
      id,
      nextActions as unknown as WorkflowAction[],
    );
    await assertAutomationGovernance(this.tenantPrisma.client, {
      businessId: current.businessId,
      workflowId: id,
      activating: nextActive && !current.active,
      activeAfter: nextActive,
      actions: nextActions as unknown as { type: string }[],
      graph: nextGraph,
    });

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const changed = await tx.workflow.updateMany({
        where: {
          id,
          version: expectedVersion,
          updatedAt: expectedUpdatedAt,
        },
        data: {
          name: dto.name,
          conditions:
            nextGraph || (graphChanged && !nextGraph)
              ? (nextConditions as Prisma.InputJsonValue)
              : dto.conditions !== undefined
                ? (dto.conditions as Prisma.InputJsonValue)
                : undefined,
          conditionMode:
            nextGraph || graphChanged ? nextConditionMode : dto.conditionMode,
          scheduleEveryMinutes:
            dto.scheduleEveryMinutes === undefined && !switchingToCron
              ? undefined
              : nextScheduleEveryMinutes,
          scheduleCronExpression:
            dto.scheduleCronExpression === undefined && !switchingToInterval
              ? undefined
              : nextScheduleCronExpression,
          scheduleTimezone:
            dto.scheduleTimezone === undefined
              ? undefined
              : nextScheduleTimezone,
          nextScheduleAt,
          actions:
            nextGraph || (graphChanged && !nextGraph)
              ? (nextActions as unknown as Prisma.InputJsonValue)
              : dto.actions !== undefined
                ? (dto.actions as Prisma.InputJsonValue)
                : undefined,
          ...(dto.graph !== undefined || (current.graph && hasLegacyDefinition)
            ? {
                graph: nextGraph
                  ? (nextGraph as unknown as Prisma.InputJsonValue)
                  : Prisma.DbNull,
              }
            : {}),
          active: dto.active,
          version: definitionChanged ? { increment: 1 } : undefined,
        },
      });
      if (changed.count !== 1) throw this.versionConflict();

      const updated = await tx.workflow.findUnique({ where: { id } });
      if (!updated) {
        throw new AppException(
          WORKFLOW_ERROR_CODES.NOT_FOUND,
          'Workflow not found',
          HttpStatus.NOT_FOUND,
        );
      }

      if (definitionChanged) {
        await tx.workflowVersion.create({
          data: {
            workflowId: updated.id,
            businessId: updated.businessId,
            version: updated.version,
            name: updated.name,
            triggerKey: updated.triggerKey,
            scheduleEveryMinutes: updated.scheduleEveryMinutes,
            scheduleCronExpression: updated.scheduleCronExpression,
            scheduleTimezone: updated.scheduleTimezone,
            conditions: updated.conditions as unknown as Prisma.InputJsonValue,
            conditionMode: updated.conditionMode,
            actions: updated.actions as unknown as Prisma.InputJsonValue,
            ...(updated.graph
              ? { graph: updated.graph as Prisma.InputJsonValue }
              : {}),
          },
        });
      }

      return updated;
    });
  }

  async archive(id: string) {
    const current = await this.findOne(id);
    if (current.archivedAt) return current;
    await this.tenantPrisma.client.workflow.update({
      where: { id },
      data: {
        active: false,
        nextScheduleAt: null,
        archivedAt: new Date(),
      },
    });
    return this.findOne(id);
  }

  async restore(id: string) {
    const current = await this.findOne(id);
    if (!current.archivedAt) return current;
    await this.tenantPrisma.client.workflow.update({
      where: { id },
      data: {
        active: false,
        nextScheduleAt: null,
        archivedAt: null,
      },
    });
    return this.findOne(id);
  }

  async duplicate(id: string) {
    const source = await this.findOne(id);
    return this.create(source.businessId, {
      name: `${source.name} (copy)`.slice(0, 191),
      triggerKey: source.triggerKey,
      conditions: Array.isArray(source.conditions)
        ? (source.conditions as Record<string, unknown>[])
        : [],
      conditionMode: source.conditionMode,
      scheduleEveryMinutes: source.scheduleEveryMinutes,
      scheduleCronExpression: source.scheduleCronExpression,
      scheduleTimezone: source.scheduleTimezone,
      actions: Array.isArray(source.actions)
        ? (source.actions as Record<string, unknown>[])
        : [],
      ...(source.graph
        ? { graph: source.graph as unknown as Record<string, unknown> }
        : {}),
    });
  }

  /** Backwards-compatible DELETE now archives rather than destroying audit history. */
  async remove(id: string) {
    return this.archive(id);
  }

  async listRuns(workflowId: string) {
    await this.findOne(workflowId);
    return this.tenantPrisma.client.workflowRun.findMany({
      where: { workflowId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { attempts: { orderBy: { attemptNumber: 'asc' } } },
      take: 50,
    });
  }

  async listBusinessRuns(businessId: string, dto: ListWorkflowRunsDto) {
    const take = dto.take ?? 25;
    const from = dto.from ? new Date(dto.from) : undefined;
    const to = dto.to ? new Date(dto.to) : undefined;
    if (from && to && from.getTime() > to.getTime()) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.INVALID_RUN_QUERY,
        'The start date must be earlier than or equal to the end date.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.cursor) {
      const cursorRun = await this.tenantPrisma.client.workflowRun.findFirst({
        where: { id: dto.cursor, businessId },
        select: { id: true },
      });
      if (!cursorRun) {
        throw new AppException(
          WORKFLOW_ERROR_CODES.INVALID_RUN_QUERY,
          'The execution page cursor is invalid.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const rows = await this.tenantPrisma.client.workflowRun.findMany({
      where: {
        businessId,
        ...(dto.workflowId ? { workflowId: dto.workflowId } : {}),
        ...(dto.status ? { status: dto.status } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
      take: take + 1,
      select: {
        id: true,
        workflowId: true,
        workflowVersion: true,
        triggerEventId: true,
        status: true,
        waitingUntil: true,
        retryCount: true,
        createdAt: true,
        workflow: {
          select: { id: true, name: true, triggerKey: true, active: true },
        },
      },
    });

    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
      hasMore,
    };
  }

  async findBusinessRun(businessId: string, runId: string) {
    const run = await this.tenantPrisma.client.workflowRun.findFirst({
      where: { id: runId, businessId },
      include: {
        workflow: {
          select: { id: true, name: true, triggerKey: true, active: true },
        },
        attempts: { orderBy: { attemptNumber: 'asc' } },
      },
    });
    if (!run) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.RUN_NOT_FOUND,
        'Workflow execution not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return run;
  }

  async listVersions(workflowId: string) {
    await this.findOne(workflowId);
    return this.tenantPrisma.client.workflowVersion.findMany({
      where: { workflowId },
      orderBy: { version: 'desc' },
    });
  }

  async restoreVersion(
    workflowId: string,
    sourceVersion: number,
    dto: RestoreWorkflowVersionDto,
    actorUserId: string | null = null,
  ) {
    const reason = typeof dto.reason === 'string' ? dto.reason.trim() : '';
    if (!reason || reason.length > 2_000) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.VERSION_RESTORE_REASON_REQUIRED,
        'Enter a reason before restoring an earlier workflow version.',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const current = await tx.workflow.findUnique({
        where: { id: workflowId },
      });
      if (!current) {
        throw new AppException(
          WORKFLOW_ERROR_CODES.NOT_FOUND,
          'Workflow not found.',
          HttpStatus.NOT_FOUND,
        );
      }
      if (current.archivedAt) {
        throw new AppException(
          WORKFLOW_ERROR_CODES.ARCHIVED,
          'Restore this workflow before rolling back its version.',
          HttpStatus.CONFLICT,
        );
      }
      const expectedUpdatedAt = new Date(dto.expectedUpdatedAt);
      if (
        current.version !== dto.expectedVersion ||
        current.updatedAt.getTime() !== expectedUpdatedAt.getTime()
      ) {
        throw this.versionConflict();
      }

      const source = await tx.workflowVersion.findFirst({
        where: { workflowId, version: sourceVersion },
      });
      if (!source) {
        throw new AppException(
          WORKFLOW_ERROR_CODES.VERSION_NOT_FOUND,
          'The saved workflow version was not found.',
          HttpStatus.NOT_FOUND,
        );
      }
      if (source.version >= current.version) {
        throw new AppException(
          WORKFLOW_ERROR_CODES.VERSION_RESTORE_NOT_ALLOWED,
          'Choose an earlier saved version to restore.',
          HttpStatus.CONFLICT,
        );
      }

      const currentSnapshot = await tx.workflowVersion.findFirst({
        where: { workflowId, version: current.version },
        select: { id: true },
      });

      if (source.graph) {
        this.validateGraph(
          source.graph as unknown as WorkflowGraph,
          source.triggerKey,
          source.name,
          source.scheduleEveryMinutes,
          source.scheduleCronExpression,
          source.scheduleTimezone,
        );
      } else {
        this.validateDefinition(
          source.triggerKey,
          source.name,
          source.conditions,
          source.actions,
          source.scheduleEveryMinutes,
          source.scheduleCronExpression,
          source.scheduleTimezone,
        );
      }

      await this.assertSubWorkflowTargets(
        workflowId,
        (source.graph
          ? workflowGraphActions(source.graph as unknown as WorkflowGraph)
          : source.actions) as unknown as WorkflowAction[],
      );
      await assertAutomationGovernance(tx, {
        businessId: current.businessId,
        workflowId,
        activating: false,
        activeAfter: current.active,
        actions: (source.graph
          ? workflowGraphActions(source.graph as unknown as WorkflowGraph)
          : source.actions) as unknown as { type: string }[],
        graph: (source.graph as unknown as WorkflowGraph | null) ?? null,
      });

      const scheduleStart = new Date();
      const nextScheduleAt =
        source.triggerKey !== WorkflowTriggerKey.scheduled || !current.active
          ? null
          : source.scheduleCronExpression
            ? nextCronOccurrence(
                source.scheduleCronExpression,
                source.scheduleTimezone,
                scheduleStart,
              )
            : new Date(
                scheduleStart.getTime() +
                  (source.scheduleEveryMinutes ?? 0) * 60 * 1000,
              );
      const changed = await tx.workflow.updateMany({
        where: {
          id: workflowId,
          version: dto.expectedVersion,
          updatedAt: expectedUpdatedAt,
          archivedAt: null,
        },
        data: {
          name: source.name,
          triggerKey: source.triggerKey,
          conditions: source.conditions as Prisma.InputJsonValue,
          conditionMode: source.conditionMode,
          scheduleEveryMinutes: source.scheduleEveryMinutes,
          scheduleCronExpression: source.scheduleCronExpression,
          scheduleTimezone: source.scheduleTimezone,
          nextScheduleAt,
          actions: source.actions as Prisma.InputJsonValue,
          graph:
            source.graph === null
              ? Prisma.DbNull
              : (source.graph as Prisma.InputJsonValue),
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw this.versionConflict();

      const restored = await tx.workflow.findUniqueOrThrow({
        where: { id: workflowId },
      });
      const restoredSnapshot = await tx.workflowVersion.create({
        data: {
          workflowId: restored.id,
          businessId: restored.businessId,
          version: restored.version,
          name: restored.name,
          triggerKey: restored.triggerKey,
          scheduleEveryMinutes: restored.scheduleEveryMinutes,
          scheduleCronExpression: restored.scheduleCronExpression,
          scheduleTimezone: restored.scheduleTimezone,
          conditions: restored.conditions as Prisma.InputJsonValue,
          conditionMode: restored.conditionMode,
          actions: restored.actions as Prisma.InputJsonValue,
          ...(restored.graph
            ? { graph: restored.graph as Prisma.InputJsonValue }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          businessId: restored.businessId,
          actorUserId,
          action: 'restore_version',
          entity: 'workflow',
          entityId: restored.id,
          before: {
            version: current.version,
            versionId: currentSnapshot?.id ?? null,
          },
          after: {
            version: restored.version,
            versionId: restoredSnapshot.id,
            restoredFromVersion: source.version,
            restoredFromVersionId: source.id,
            reason,
          },
        },
      });
      return restored;
    });
  }

  /**
   * "Run another workflow" steps must point at a different, non-archived workflow of this business
   * that uses the sub-workflow trigger. Checked again at run time (it may be paused or archived later).
   */
  private async assertSubWorkflowTargets(
    workflowId: string | null,
    actions: WorkflowAction[],
  ): Promise<void> {
    const targetIds = [
      ...new Set(
        (Array.isArray(actions) ? actions : []).flatMap((action) =>
          action?.type === 'run_workflow' ? [action.workflowId] : [],
        ),
      ),
    ];
    if (targetIds.length === 0) return;
    if (workflowId && targetIds.includes(workflowId)) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.INVALID_DEFINITION,
        'A workflow cannot run itself.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const found = await this.tenantPrisma.client.workflow.count({
      where: {
        id: { in: targetIds },
        triggerKey: WorkflowTriggerKey.sub_workflow,
        archivedAt: null,
      },
    });
    if (found !== targetIds.length) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.INVALID_DEFINITION,
        '"Run another workflow" must point to a workflow of this business that uses the "Run by another workflow" trigger.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private validateDefinition(
    triggerKey: WorkflowTriggerKey,
    name: unknown,
    conditions: unknown,
    actions: unknown,
    scheduleEveryMinutes?: unknown,
    scheduleCronExpression?: unknown,
    scheduleTimezone?: unknown,
  ): void {
    const error = validateWorkflowDefinition(
      triggerKey,
      name,
      conditions,
      actions,
      scheduleEveryMinutes,
      scheduleCronExpression,
      scheduleTimezone,
    );
    if (error) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.INVALID_DEFINITION,
        error,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private validateGraph(
    graph: WorkflowGraph,
    triggerKey: WorkflowTriggerKey,
    name: unknown,
    scheduleEveryMinutes?: unknown,
    scheduleCronExpression?: unknown,
    scheduleTimezone?: unknown,
  ): void {
    const error = validateWorkflowGraph(
      graph,
      triggerKey,
      typeof name === 'string' ? name : undefined,
      typeof scheduleEveryMinutes === 'number' || scheduleEveryMinutes === null
        ? scheduleEveryMinutes
        : undefined,
      typeof scheduleCronExpression === 'string' ||
        scheduleCronExpression === null
        ? scheduleCronExpression
        : undefined,
      typeof scheduleTimezone === 'string' ? scheduleTimezone : 'UTC',
    );
    if (error) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.INVALID_DEFINITION,
        error,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private versionConflict(): AppException {
    return new AppException(
      WORKFLOW_ERROR_CODES.VERSION_CONFLICT,
      'This workflow changed after you opened it. Reload it before saving again.',
      HttpStatus.CONFLICT,
    );
  }

  /**
   * Dry run (UPD-BE-028 acceptance criteria: "runs against real recent data without side
   * effects") — finds the most recent real `ActivityEvent` matching this workflow's trigger,
   * evaluates real conditions against it, and reports which actions WOULD run. Never calls
   * `SendGateService`, never writes a `WorkflowRun` row.
   */
  async test(id: string) {
    const workflow = await this.findOne(id);

    if (workflow.triggerKey === WorkflowTriggerKey.scheduled) {
      const context = await buildTriggerContext(
        this.tenantPrisma.client,
        workflow.businessId,
        workflow.triggerKey,
        {
          description: 'Scheduled workflow dry run',
          scheduledAt: new Date().toISOString(),
        },
      );
      return this.testWithContext(workflow, context);
    }

    const recentEvents = await this.tenantPrisma.client.activityEvent.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    const matchingEvent = recentEvents.find(
      (event) =>
        mapActivityEventToTriggerKey(event.type, event.description) ===
        workflow.triggerKey,
    );

    if (!matchingEvent) {
      return {
        workflowId: workflow.id,
        triggerKey: workflow.triggerKey,
        foundRecentEvent: false,
        matched: false,
        context: null,
        wouldExecuteActions: [],
        actionPreviews: [],
        selectedActionIndexes: [],
      };
    }

    const context = await buildTriggerContext(
      this.tenantPrisma.client,
      workflow.businessId,
      workflow.triggerKey,
      {
        eventId: matchingEvent.id,
        description: matchingEvent.description,
        entityType: matchingEvent.entityType,
        entityId: matchingEvent.entityId,
        amount: matchingEvent.amount ? Number(matchingEvent.amount) : undefined,
      },
    );

    return this.testWithContext(workflow, context, matchingEvent.id);
  }

  private async testWithContext(
    workflow: {
      id: string;
      businessId: string;
      triggerKey: WorkflowTriggerKey;
      conditions: Prisma.JsonValue;
      conditionMode: WorkflowConditionMode;
      actions: Prisma.JsonValue;
      graph?: Prisma.JsonValue | null;
    },
    context: Record<string, unknown>,
    sourceEventId?: string,
  ) {
    const graph = workflow.graph
      ? (workflow.graph as unknown as WorkflowGraph)
      : null;
    const conditions = (workflow.conditions ??
      []) as unknown as WorkflowCondition[];
    const matched = graph
      ? true
      : evaluateConditions(conditions, context, workflow.conditionMode);
    const allActions = (workflow.actions ?? []) as unknown as WorkflowAction[];
    const executionPlan = graph
      ? resolveWorkflowGraphPath(graph, context)
      : null;
    const selectedActionIndexes = graph
      ? executionPlan!.actionIndexes
      : matched
        ? allActions.map((_, index) => index)
        : [];
    const actions = selectedActionIndexes.map((index) => allActions[index]);
    const customFieldNames = [
      ...new Set(
        actions.flatMap((action) =>
          action.type === 'set_customer_custom_field'
            ? [action.fieldName.trim()]
            : [],
        ),
      ),
    ];
    const customFields = customFieldNames.length
      ? await this.tenantPrisma.client.customerCustomField.findMany({
          where: { name: { in: customFieldNames } },
          select: { name: true, type: true, options: true },
        })
      : [];
    const customFieldByName = new Map(
      customFields.map((field) => [field.name, field]),
    );
    const variableReadConfigs = new Map<
      string,
      { name: string; scope: 'business' | 'workflow' }
    >();
    for (const action of actions) {
      if (action.type === 'get_variable') {
        variableReadConfigs.set(`${action.scope}:${action.name}`, {
          name: action.name,
          scope: action.scope,
        });
      }
    }
    const variableReadEntries = await Promise.all(
      [...variableReadConfigs.entries()].map(async ([key, config]) => {
        const variable = await this.tenantPrisma.client.workflowVariable.findFirst({
          where: {
            businessId: workflow.businessId,
            environment: 'production',
            scope: config.scope,
            scopeKey: config.scope === 'business' ? '*' : workflow.id,
            name: config.name,
          },
          select: { valueType: true, value: true },
        });
        return [key, variable] as const;
      }),
    );
    const variableReadByKey = new Map(variableReadEntries);
    const subWorkflowIds = actions.flatMap((action) =>
      action.type === 'run_workflow' ? [action.workflowId] : [],
    );
    const subWorkflows = subWorkflowIds.length
      ? await this.tenantPrisma.client.workflow.findMany({
          where: {
            id: { in: subWorkflowIds },
            triggerKey: WorkflowTriggerKey.sub_workflow,
            archivedAt: null,
          },
          select: { id: true, name: true, active: true },
        })
      : [];
    const subWorkflowById = new Map(subWorkflows.map((row) => [row.id, row]));
    const actionPreviews = actions.flatMap((action, position) => {
      const actionIndex = selectedActionIndexes[position];
      if (action.type === 'add_customer_tag' || action.type === 'wait')
        return [];
      if (action.type === 'map_data') {
        const preview = previewWorkflowDataMapping(context, action.mappings);
        if (preview.valid) {
          const merged = mergeWorkflowMappedData(
            context.mappedData,
            preview.mappedData,
          );
          if (merged) context.mappedData = merged;
          return [
            {
              actionIndex,
              body: `Dry run only: would map ${preview.mappedFields} field(s); no workflow data is saved.`,
              error: merged
                ? null
                : 'Combined mapped data exceeds the 65536-character limit.',
              output: preview.mappedData,
            },
          ];
        }
        return [
          {
            actionIndex,
            body: 'Dry run only: mapping was not applied.',
            error: preview.errors.map((issue) => issue.message).join(' '),
            output: preview.mappedData,
          },
        ];
      }
      if (action.type === 'get_variable') {
        const variable = variableReadByKey.get(
          `${action.scope}:${action.name}`,
        );
        if (!variable) {
          return [
            {
              actionIndex,
              body: `Dry run only: would read Production variable "${action.name}".`,
              error: 'The selected workflow variable was not found.',
            },
          ];
        }
        if (variable.valueType === 'secret_reference' || variable.value === null) {
          return [
            {
              actionIndex,
              body: 'Dry run only: variable was not added to run context.',
              error: variable.valueType === 'secret_reference'
                ? 'Secret-reference variables cannot be read into workflow templates.'
                : 'Workflow variable has no stored value.',
            },
          ];
        }
        const variables =
          typeof context.variables === 'object' &&
          context.variables !== null &&
          !Array.isArray(context.variables)
            ? (context.variables as Record<string, unknown>)
            : {};
        context.variables = { ...variables, [action.name]: variable.value };
        return [
          {
            actionIndex,
            body: `Dry run only: would load "${action.name}" into this run.`,
            error: null,
          },
        ];
      }
      if (action.type === 'ai_agent') {
        const template = workflowMessageTemplateFields(action.goal);
        const resolved = resolveWorkflowMessageTemplate(action.goal, context);
        return [
          {
            actionIndex,
            body: `Dry run only: the AI agent is not called (read-only tools, up to ${action.maxSteps} steps).`,
            error: template.malformed
              ? 'Agent goal template syntax is invalid. Use {{fieldName}}.'
              : resolved.error,
          },
        ];
      }
      if (action.type === 'run_workflow') {
        const target = subWorkflowById.get(action.workflowId);
        return [
          {
            actionIndex,
            body: target
              ? `Dry run only: would start "${target.name}"; it is not started.`
              : 'Dry run only: no workflow is started.',
            error: !target
              ? 'The selected workflow was not found or no longer uses the "Run by another workflow" trigger.'
              : target.active
                ? null
                : `"${target.name}" is paused, so a live run would skip this step.`,
          },
        ];
      }
      if (action.type === 'generate_ai_draft') {
        const template = workflowMessageTemplateFields(action.prompt);
        const resolved = resolveWorkflowMessageTemplate(action.prompt, context);
        return [
          {
            actionIndex,
            body: 'Dry run only: an AI draft request is not sent to the provider.',
            error: template.malformed
              ? 'AI prompt template syntax is invalid. Use {{fieldName}}.'
              : resolved.error,
          },
        ];
      }
      if (action.type === 'request_approval') {
        const title = resolveWorkflowMessageTemplate(action.title, context);
        const description = resolveWorkflowMessageTemplate(
          action.description,
          context,
        );
        return [
          {
            actionIndex,
            body: `Approval gate: ${title.body ?? action.title}. ${description.body ?? action.description}. Later actions remain blocked until an owner or manager decides.`,
            error: title.error ?? description.error,
          },
        ];
      }
      if (action.type === 'set_customer_custom_field') {
        const field = customFieldByName.get(action.fieldName.trim());
        const resolvedValue = resolveWorkflowCustomFieldValue(
          action.value,
          context,
        );
        let options: unknown = field?.options;
        if (typeof options === 'string') {
          try {
            options = JSON.parse(options);
          } catch {
            options = null;
          }
        }
        const valueMatches =
          !field ||
          resolvedValue.value === null ||
          (field.type === 'number'
            ? typeof resolvedValue.value === 'number' &&
              Number.isFinite(resolvedValue.value)
            : field.type === 'date'
              ? typeof resolvedValue.value === 'string' &&
                isDateOnly(resolvedValue.value)
              : field.type === 'select'
                ? typeof resolvedValue.value === 'string' &&
                  Array.isArray(options) &&
                  options.includes(resolvedValue.value)
                : typeof resolvedValue.value === 'string');
        return [
          {
            actionIndex,
            body: `Dry run only: would set "${action.fieldName}" on the canonical CRM customer; no record is changed.`,
            error: !context.customerId
              ? 'This trigger context does not contain a customer.'
              : !field
                ? 'The configured customer field does not exist in Customer Settings.'
                : resolvedValue.error
                  ? resolvedValue.error
                  : !valueMatches
                    ? 'The configured value does not match this field type or its available options.'
                    : null,
          },
        ];
      }
      const resolved = resolveWorkflowMessageTemplate(
        action.messageBody,
        context,
      );
      return [
        {
          actionIndex,
          body: resolved.body,
          error: resolved.error,
        },
      ];
    });

    return {
      workflowId: workflow.id,
      triggerKey: workflow.triggerKey,
      foundRecentEvent: true,
      ...(sourceEventId ? { sourceEventId } : {}),
      matched,
      context,
      wouldExecuteActions: actions,
      actionPreviews,
      selectedActionIndexes,
      ...(executionPlan ? { executionPlan } : {}),
    };
  }
}
