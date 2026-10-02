import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import {
  WorkflowApprovalStatus,
  WorkflowDeadLetterStatus,
  WorkflowRunStatus,
} from '@prisma/client';
import type { Queue } from 'bullmq';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
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
}
