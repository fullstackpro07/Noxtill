import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import {
  WorkflowApprovalStatus,
  WorkflowDeadLetterStatus,
  WorkflowRunStatus,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { resolvePolicies } from '../../common/policies/policies.service';
import type { WorkflowAction } from './workflow-action.util';
import { WORKFLOW_AGENT_TOOL_LABELS } from './workflow-agent.util';
import {
  workflowGraphActions,
  type WorkflowGraph,
} from './workflow-graph.util';
import { WORKFLOW_SCHEDULE_QUEUE } from './workflows.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface QueueHealth {
  reachable: boolean;
  counts: Record<
    'waiting' | 'active' | 'delayed' | 'failed' | 'completed',
    number
  > | null;
}

/**
 * Automation Command Center (Automations spec area 1): one health view over the real workflow
 * records — runs in the last 24 hours, failures, waits, approvals, recovery items and upcoming
 * schedules — plus the shared schedule queue's live counts from Redis. Queue counts are
 * platform-wide (BullMQ queues are shared), everything else is this business's. Run cost is not
 * tracked (no per-run cost metering exists).
 */
@Injectable()
export class AutomationCommandCenterService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Optional()
    @InjectQueue(WORKFLOW_SCHEDULE_QUEUE)
    private readonly scheduleQueue?: Queue,
  ) {}

  private async queueHealth(): Promise<QueueHealth> {
    if (!this.scheduleQueue) return { reachable: false, counts: null };
    try {
      const counts = await Promise.race([
        this.scheduleQueue.getJobCounts(
          'waiting',
          'active',
          'delayed',
          'failed',
          'completed',
        ),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 2000),
        ),
      ]);
      return {
        reachable: true,
        counts: {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          completed: counts.completed ?? 0,
        },
      };
    } catch {
      return { reachable: false, counts: null };
    }
  }

  async overview(businessId: string, now = new Date()) {
    const db = this.tenantPrisma.client;
    const since = new Date(now.getTime() - DAY_MS);
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const [
      workflows,
      runsByStatus,
      waiting,
      overdueWaits,
      approvals,
      deadLetters,
      upcoming,
      recentFailures,
      queue,
      runsThisMonth,
      business,
    ] = await Promise.all([
      db.workflow.groupBy({
        by: ['active'],
        where: { businessId, archivedAt: null },
        _count: { _all: true },
      }),
      db.workflowRun.groupBy({
        by: ['status'],
        where: { businessId, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      db.workflowRun.count({
        where: { businessId, status: WorkflowRunStatus.waiting },
      }),
      db.workflowRun.count({
        where: {
          businessId,
          status: WorkflowRunStatus.waiting,
          waitingUntil: { lt: new Date(now.getTime() - 5 * 60 * 1000) },
        },
      }),
      db.workflowApproval.findMany({
        where: { businessId, status: WorkflowApprovalStatus.pending },
        select: {
          id: true,
          requestedAt: true,
          title: true,
          workflow: { select: { name: true } },
        },
        orderBy: { requestedAt: 'asc' },
        take: 5,
      }),
      db.workflowDeadLetter.count({
        where: { businessId, status: WorkflowDeadLetterStatus.open },
      }),
      db.workflow.findMany({
        where: {
          businessId,
          active: true,
          archivedAt: null,
          nextScheduleAt: { not: null },
        },
        select: { id: true, name: true, nextScheduleAt: true },
        orderBy: { nextScheduleAt: 'asc' },
        take: 5,
      }),
      db.workflowRun.findMany({
        where: {
          businessId,
          status: WorkflowRunStatus.failed,
          createdAt: { gte: since },
        },
        select: {
          id: true,
          error: true,
          createdAt: true,
          workflow: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.queueHealth(),
      db.workflowRun.count({
        where: {
          businessId,
          createdAt: { gte: monthStart },
          status: { not: WorkflowRunStatus.skipped },
        },
      }),
      db.business.findUnique({
        where: { id: businessId },
        select: { policies: true },
      }),
    ]);
    const pendingApprovals = await db.workflowApproval.count({
      where: { businessId, status: WorkflowApprovalStatus.pending },
    });
    const run = (status: WorkflowRunStatus) =>
      runsByStatus.find((row) => row.status === status)?._count._all ?? 0;
    const success = run(WorkflowRunStatus.success);
    const failed = run(WorkflowRunStatus.failed);
    const active = workflows.find((row) => row.active)?._count._all ?? 0;
    const paused = workflows.find((row) => !row.active)?._count._all ?? 0;

    const attention: {
      key: string;
      tone: 'red' | 'amber';
      text: string;
      href: string;
    }[] = [];
    if (failed > 0)
      attention.push({
        key: 'failures',
        tone: 'red',
        text: `${failed} run(s) failed in the last 24 hours`,
        href: '/marketing/automations/executions',
      });
    if (deadLetters > 0)
      attention.push({
        key: 'recovery',
        tone: 'red',
        text: `${deadLetters} item(s) waiting in the Recovery Center`,
        href: '/marketing/automations/recovery',
      });
    if (pendingApprovals > 0)
      attention.push({
        key: 'approvals',
        tone: 'amber',
        text: `${pendingApprovals} approval(s) waiting`,
        href: '/marketing/automations/approvals',
      });
    if (overdueWaits > 0)
      attention.push({
        key: 'waits',
        tone: 'amber',
        text: `${overdueWaits} wait(s) are past their resume time — check that the queue worker is running`,
        href: '/marketing/automations/schedules',
      });
    if (!queue.reachable)
      attention.push({
        key: 'queue',
        tone: 'red',
        text: 'The automation queue (Redis) is unreachable — schedules and waits cannot resume',
        href: '/marketing/automations/schedules',
      });

    return {
      capturedAt: now,
      workflows: { active, paused },
      runs24h: {
        total: runsByStatus.reduce((sum, row) => sum + row._count._all, 0),
        success,
        failed,
        skipped: run(WorkflowRunStatus.skipped),
        cancelled: run(WorkflowRunStatus.cancelled),
        running: run(WorkflowRunStatus.running),
        failureRatePct:
          success + failed > 0
            ? Math.round((failed / (success + failed)) * 1000) / 10
            : null,
      },
      runsThisMonth: {
        count: runsThisMonth,
        limit: resolvePolicies(business).num('automations.maxRunsPerMonth'),
      },
      waiting,
      overdueWaits,
      pendingApprovals,
      oldestApprovals: approvals.map((row) => ({
        id: row.id,
        workflow: row.workflow.name,
        title: row.title,
        requestedAt: row.requestedAt,
      })),
      openDeadLetters: deadLetters,
      upcoming,
      recentFailures: recentFailures.map((row) => ({
        id: row.id,
        workflowId: row.workflow.id,
        workflow: row.workflow.name,
        error: row.error,
        createdAt: row.createdAt,
      })),
      queue,
      attention,
      notTracked: [
        'Run cost (no per-run cost metering)',
        'Business value / revenue influenced by automations (no attribution source)',
      ],
    };
  }

  /**
   * Schedules & Queues (Automations spec area 10): every scheduled workflow with its rule and next
   * run, durable waits in progress, and the shared queue's live counts. Concurrency limits,
   * partitioning and fairness are fixed by the platform (one schedule queue, one worker) and are not
   * configurable per business.
   */
  async schedules(businessId: string, now = new Date()) {
    const db = this.tenantPrisma.client;
    const [scheduled, waits, queue] = await Promise.all([
      db.workflow.findMany({
        where: {
          businessId,
          archivedAt: null,
          OR: [
            { scheduleEveryMinutes: { not: null } },
            { scheduleCronExpression: { not: null } },
          ],
        },
        select: {
          id: true,
          name: true,
          active: true,
          scheduleEveryMinutes: true,
          scheduleCronExpression: true,
          scheduleTimezone: true,
          nextScheduleAt: true,
          lastScheduledAt: true,
          runs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true, createdAt: true },
          },
        },
        orderBy: [{ active: 'desc' }, { nextScheduleAt: 'asc' }],
        take: 200,
      }),
      db.workflowRun.findMany({
        where: { businessId, status: WorkflowRunStatus.waiting },
        select: {
          id: true,
          waitingUntil: true,
          createdAt: true,
          workflow: { select: { id: true, name: true } },
        },
        orderBy: { waitingUntil: 'asc' },
        take: 200,
      }),
      this.queueHealth(),
    ]);
    const overdueAfter = new Date(now.getTime() - 5 * 60 * 1000);
    return {
      capturedAt: now,
      queue,
      scheduled: scheduled.map((row) => ({
        id: row.id,
        name: row.name,
        active: row.active,
        rule: row.scheduleCronExpression
          ? `cron ${row.scheduleCronExpression}`
          : `every ${row.scheduleEveryMinutes} min`,
        timezone: row.scheduleTimezone,
        nextScheduleAt: row.active ? row.nextScheduleAt : null,
        lastScheduledAt: row.lastScheduledAt,
        lastRun: row.runs[0] ?? null,
        overdue: Boolean(
          row.active && row.nextScheduleAt && row.nextScheduleAt < overdueAfter,
        ),
      })),
      waits: waits.map((row) => ({
        id: row.id,
        workflowId: row.workflow.id,
        workflow: row.workflow.name,
        waitingUntil: row.waitingUntil,
        startedAt: row.createdAt,
        overdue: Boolean(row.waitingUntil && row.waitingUntil < overdueAfter),
      })),
      fixed: [
        'One shared schedule queue and worker for all businesses',
        'Schedules run at most every 15 minutes; waits up to 7 days',
        'Per-workflow concurrency, partitioning and fairness are not configurable',
      ],
    };
  }

  /**
   * Governance audit (Automations spec area 18): who changed or decided what — version saves,
   * approval decisions and Recovery Center decisions — newest first. Version saves don't record an
   * author, so they show without one.
   */
  /**
   * AI Agents screen: every workflow with an AI agent step, its configured goal / tools / step limit,
   * and what its runs in the last 30 days actually did (from the stored step results). Cost is only
   * available as the month's total for all workflow AI steps (drafts and agents share one AI kind).
   */
  async agents(businessId: string, now = new Date()) {
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const workflows = await this.tenantPrisma.client.workflow.findMany({
      where: { businessId, archivedAt: null },
      select: {
        id: true,
        name: true,
        active: true,
        triggerKey: true,
        actions: true,
        graph: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const withAgents = workflows.flatMap((workflow) => {
      const actions = workflow.graph
        ? workflowGraphActions(workflow.graph as unknown as WorkflowGraph)
        : ((workflow.actions ?? []) as unknown as WorkflowAction[]);
      const steps = actions.flatMap((action) =>
        action?.type === 'ai_agent'
          ? [
              {
                goal: action.goal,
                maxSteps: action.maxSteps,
                tools: (action.tools ?? []).map((tool) => ({
                  key: tool,
                  label: WORKFLOW_AGENT_TOOL_LABELS[tool] ?? tool,
                })),
              },
            ]
          : [],
      );
      return steps.length ? [{ ...workflow, steps }] : [];
    });
    const runs = withAgents.length
      ? await this.tenantPrisma.client.workflowRun.findMany({
          where: {
            businessId,
            workflowId: { in: withAgents.map((workflow) => workflow.id) },
            createdAt: { gte: since },
          },
          select: { workflowId: true, result: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 2000,
        })
      : [];
    const [business, cost] = await Promise.all([
      this.tenantPrisma.client.business.findUnique({
        where: { id: businessId },
        select: { aiFeatureToggles: true },
      }),
      this.tenantPrisma.client.aiCallLog.aggregate({
        where: {
          businessId,
          kind: 'workflow_agent',
          createdAt: { gte: monthStart },
        },
        _sum: { estimatedCostUsd: true },
        _count: { _all: true },
      }),
    ]);
    const toggles = (business?.aiFeatureToggles ?? {}) as Record<
      string,
      boolean
    >;
    return {
      enabledInAiSettings: toggles.workflowAgents !== false,
      monthWorkflowAiCalls: cost._count._all,
      monthWorkflowAiCostUsd: Number(cost._sum.estimatedCostUsd ?? 0),
      agents: withAgents.map((workflow) => {
        const stats = {
          agentRuns: 0,
          completed: 0,
          failed: 0,
          toolCalls: 0,
          blockedToolCalls: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
        for (const run of runs) {
          if (run.workflowId !== workflow.id || !Array.isArray(run.result))
            continue;
          for (const step of run.result as Array<Record<string, unknown>>) {
            if (step?.type !== 'ai_agent') continue;
            stats.agentRuns += 1;
            if (step.completed === true) stats.completed += 1;
            else if (step.error) stats.failed += 1;
            const calls = Array.isArray(step.toolCalls)
              ? (step.toolCalls as Array<{ allowed?: unknown }>)
              : [];
            stats.toolCalls += calls.length;
            stats.blockedToolCalls += calls.filter(
              (call) => call.allowed === false,
            ).length;
            stats.inputTokens += Number(step.inputTokens ?? 0) || 0;
            stats.outputTokens += Number(step.outputTokens ?? 0) || 0;
          }
        }
        return {
          workflowId: workflow.id,
          name: workflow.name,
          active: workflow.active,
          triggerKey: workflow.triggerKey,
          steps: workflow.steps,
          last30Days: stats,
        };
      }),
    };
  }

  async audit(businessId: string) {
    const db = this.tenantPrisma.client;
    const [versions, approvals, decisions] = await Promise.all([
      db.workflowVersion.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 60,
        select: {
          workflowId: true,
          version: true,
          name: true,
          createdAt: true,
        },
      }),
      db.workflowApproval.findMany({
        where: { businessId, decidedAt: { not: null } },
        orderBy: { decidedAt: 'desc' },
        take: 60,
        select: {
          id: true,
          status: true,
          title: true,
          decisionComment: true,
          decidedAt: true,
          decidedBy: { select: { name: true } },
          workflow: { select: { name: true } },
        },
      }),
      db.workflowDeadLetterDecision.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: 60,
        select: {
          id: true,
          action: true,
          reason: true,
          createdAt: true,
          actorUser: { select: { name: true } },
        },
      }),
    ]);
    return [
      ...versions.map((row) => ({
        kind: 'version' as const,
        at: row.createdAt,
        actor: null as string | null,
        text: `Saved “${row.name}” as version ${row.version}`,
        note: null as string | null,
      })),
      ...approvals.map((row) => ({
        kind: 'approval' as const,
        at: row.decidedAt!,
        actor: row.decidedBy?.name ?? null,
        text: `${row.status === 'approved' ? 'Approved' : row.status === 'rejected' ? 'Rejected' : 'Closed'} “${row.title}” in ${row.workflow.name}`,
        note: row.decisionComment,
      })),
      ...decisions.map((row) => ({
        kind: 'recovery' as const,
        at: row.createdAt,
        actor: row.actorUser?.name ?? null,
        text: `Recovery Center: ${row.action}`,
        note: row.reason,
      })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, 100);
  }

  /** Current monthly usage and the most recent completed retention pass for Governance. */
  async governanceSummary(businessId: string, now = new Date()) {
    const db = this.tenantPrisma.client;
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const [business, runsThisMonth, lastCleanup] = await Promise.all([
      db.business.findUnique({
        where: { id: businessId },
        select: { policies: true },
      }),
      db.workflowRun.count({
        where: {
          businessId,
          createdAt: { gte: monthStart },
          status: { not: WorkflowRunStatus.skipped },
        },
      }),
      db.workflowRetentionCleanup.findFirst({
        where: { businessId },
        orderBy: [{ cleanedAt: 'desc' }, { id: 'desc' }],
        select: { cleanedAt: true, deletedRuns: true, retentionDays: true },
      }),
    ]);
    const policies = resolvePolicies(business);
    return {
      runsThisMonth: {
        count: runsThisMonth,
        limit: policies.num('automations.maxRunsPerMonth'),
      },
      runRetention: {
        days: policies.num('automations.runRetentionDays'),
        lastCleanup: lastCleanup
          ? {
              cleanedAt: lastCleanup.cleanedAt,
              deletedRuns: lastCleanup.deletedRuns,
              retentionDays: lastCleanup.retentionDays,
            }
          : null,
      },
    };
  }
}
