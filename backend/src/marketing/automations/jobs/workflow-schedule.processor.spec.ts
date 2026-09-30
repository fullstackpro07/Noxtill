import { WorkflowTriggerKey } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkflowTriggerService } from '../workflow-trigger.service';
import { WorkflowScheduleProcessor } from './workflow-schedule.processor';

describe('WorkflowScheduleProcessor', () => {
  const now = new Date('2026-09-29T12:00:00.000Z');
  const dueAt = new Date('2026-09-29T10:00:00.000Z');

  function createProcessor(overrides: Record<string, unknown> = {}) {
    const schedule = {
      id: 'workflow_1',
      businessId: 'business_1',
      scheduleEveryMinutes: 60,
      scheduleCronExpression: null,
      scheduleTimezone: 'UTC',
      nextScheduleAt: dueAt,
      ...overrides,
    };
    const findMany = jest.fn().mockResolvedValue([schedule]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const runScheduled = jest.fn().mockResolvedValue(undefined);
    const findWaitingRuns = jest.fn().mockResolvedValue([]);
    const resumeWaitingRun = jest.fn().mockResolvedValue(true);
    const processor = new WorkflowScheduleProcessor(
      {
        workflow: { findMany, updateMany },
        workflowRun: { findMany: findWaitingRuns },
      } as unknown as PrismaService,
      { runScheduled, resumeWaitingRun } as unknown as WorkflowTriggerService,
    );
    return {
      processor,
      findMany,
      updateMany,
      runScheduled,
      findWaitingRuns,
      resumeWaitingRun,
    };
  }

  it('runs a single catch-up occurrence and advances to the next future interval', async () => {
    const { processor, findMany, updateMany, runScheduled } = createProcessor();

    await processor.runDueSchedules(now);

    expect(findMany).toHaveBeenCalledWith({
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
    expect(runScheduled).toHaveBeenCalledWith(
      'business_1',
      'workflow_1',
      dueAt,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'workflow_1',
        businessId: 'business_1',
        triggerKey: WorkflowTriggerKey.scheduled,
        active: true,
        scheduleEveryMinutes: 60,
        scheduleCronExpression: null,
        scheduleTimezone: 'UTC',
        nextScheduleAt: dueAt,
      },
      data: {
        lastScheduledAt: dueAt,
        nextScheduleAt: new Date('2026-09-29T13:00:00.000Z'),
      },
    });
  });

  it('runs and advances a cron schedule using its configured local time zone', async () => {
    const cronDueAt = new Date('2026-09-29T04:00:00.000Z');
    const nowAfterDue = new Date('2026-09-29T12:00:00.000Z');
    const { processor, updateMany, runScheduled } = createProcessor({
      scheduleEveryMinutes: null,
      scheduleCronExpression: '0 9 * * *',
      scheduleTimezone: 'Asia/Karachi',
      nextScheduleAt: cronDueAt,
    });

    await processor.runDueSchedules(nowAfterDue);

    expect(runScheduled).toHaveBeenCalledWith(
      'business_1',
      'workflow_1',
      cronDueAt,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'workflow_1',
        businessId: 'business_1',
        triggerKey: WorkflowTriggerKey.scheduled,
        active: true,
        scheduleEveryMinutes: null,
        scheduleCronExpression: '0 9 * * *',
        scheduleTimezone: 'Asia/Karachi',
        nextScheduleAt: cronDueAt,
      },
      data: {
        lastScheduledAt: cronDueAt,
        nextScheduleAt: new Date('2026-09-30T04:00:00.000Z'),
      },
    });
  });

  it('leaves the due time intact when dispatch fails so a later tick can retry it', async () => {
    const { processor, updateMany, runScheduled } = createProcessor();
    runScheduled.mockRejectedValueOnce(
      new Error('database temporarily unavailable'),
    );

    await processor.runDueSchedules(now);

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('resumes persisted workflow waits that became due', async () => {
    const { processor, findWaitingRuns, resumeWaitingRun } = createProcessor();
    findWaitingRuns.mockResolvedValueOnce([
      { id: 'run_1', workflowId: 'workflow_2', businessId: 'business_3' },
    ]);

    await processor.runDueSchedules(now);

    expect(findWaitingRuns).toHaveBeenCalledWith({
      where: { status: 'waiting', waitingUntil: { lte: now } },
      orderBy: [{ waitingUntil: 'asc' }, { id: 'asc' }],
      take: 100,
      select: { id: true, workflowId: true, businessId: true },
    });
    expect(resumeWaitingRun).toHaveBeenCalledWith(
      'business_3',
      'workflow_2',
      'run_1',
      now,
    );
  });
});
