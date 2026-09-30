import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { WorkflowTriggerKey } from '@prisma/client';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkflowTriggerService } from '../workflow-trigger.service';
import { nextCronOccurrence } from '../workflow-schedule.util';
import { WORKFLOW_SCHEDULE_QUEUE } from '../workflows.constants';

@Processor(WORKFLOW_SCHEDULE_QUEUE)
@Injectable()
export class WorkflowScheduleProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowScheduleProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowTrigger: WorkflowTriggerService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    await this.runDueSchedules();
  }

  /** One catch-up run per due interval; failed dispatches retain their due time for retry. */
  async runDueSchedules(now = new Date()): Promise<void> {
    const dueSchedules = await this.prisma.workflow.findMany({
      where: {
        triggerKey: WorkflowTriggerKey.scheduled,
        active: true,
        OR: [
          { scheduleEveryMinutes: { not: null } },
          { scheduleCronExpression: { not: null } },
        ],
        nextScheduleAt: { lte: now },
      },
      orderBy: [{ nextScheduleAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true,
        businessId: true,
        scheduleEveryMinutes: true,
        scheduleCronExpression: true,
        scheduleTimezone: true,
        nextScheduleAt: true,
      },
    });

    for (const schedule of dueSchedules) {
      if (
        (schedule.scheduleEveryMinutes === null &&
          schedule.scheduleCronExpression === null) ||
        !schedule.nextScheduleAt
      )
        continue;

      const dueAt = schedule.nextScheduleAt;
      try {
        await this.workflowTrigger.runScheduled(
          schedule.businessId,
          schedule.id,
          dueAt,
        );
      } catch (error) {
        this.logger.warn(
          `Scheduled workflow ${schedule.id} remains due after dispatch failure: ${(error as Error).message}`,
        );
        continue;
      }

      let nextScheduleAt: Date;
      if (schedule.scheduleCronExpression !== null) {
        nextScheduleAt = nextCronOccurrence(
          schedule.scheduleCronExpression,
          schedule.scheduleTimezone,
          now,
        );
      } else {
        const intervalMs = schedule.scheduleEveryMinutes! * 60_000;
        const intervalsToAdvance =
          Math.floor(
            Math.max(0, now.getTime() - dueAt.getTime()) / intervalMs,
          ) + 1;
        nextScheduleAt = new Date(
          dueAt.getTime() + intervalsToAdvance * intervalMs,
        );
      }
      await this.prisma.workflow.updateMany({
        where: {
          id: schedule.id,
          businessId: schedule.businessId,
          triggerKey: WorkflowTriggerKey.scheduled,
          active: true,
          scheduleEveryMinutes: schedule.scheduleEveryMinutes,
          scheduleCronExpression: schedule.scheduleCronExpression,
          scheduleTimezone: schedule.scheduleTimezone,
          nextScheduleAt: dueAt,
        },
        data: { lastScheduledAt: dueAt, nextScheduleAt },
      });
    }

    const waitingRuns = await this.prisma.workflowRun.findMany({
      where: {
        status: 'waiting',
        waitingUntil: { lte: now },
      },
      orderBy: [{ waitingUntil: 'asc' }, { id: 'asc' }],
      take: 100,
      select: { id: true, workflowId: true, businessId: true },
    });
    for (const run of waitingRuns) {
      try {
        await this.workflowTrigger.resumeWaitingRun(
          run.businessId,
          run.workflowId,
          run.id,
          now,
        );
      } catch (error) {
        this.logger.warn(
          `Waiting workflow run ${run.id} could not resume: ${(error as Error).message}`,
        );
      }
    }
  }
}
