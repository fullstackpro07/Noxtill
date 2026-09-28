import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProjectsContextService,
  addDays,
  mergeConfig,
  parseDay,
  todayIn,
} from './projects-context.service';
import { ARCHIVE_DAYS, PROJECTS_QUEUE } from './projects.constants';

@Injectable()
export class ProjectsDailyScheduler implements OnModuleInit {
  private readonly logger = new Logger(ProjectsDailyScheduler.name);

  constructor(@InjectQueue(PROJECTS_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    this.queue
      .add(
        'daily',
        {},
        { repeat: { pattern: '15 * * * *' }, jobId: 'projects-hourly' },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register Projects daily job: ${error.message}`,
        ),
      );
  }
}

/**
 * Runs hourly and acts once per business per local day:
 *  - auto-archives completed projects older than the Archive Policy window;
 *  - "Task overdue": tells the assignee the day after a task's due date passes;
 *  - "Milestone due": tells the owner three days before a milestone's planned date.
 * The per-day guard is the ProjectActivity row it writes (`system.daily`), so re-runs are no-ops.
 */
@Processor(PROJECTS_QUEUE)
export class ProjectsDailyProcessor extends WorkerHost {
  private readonly logger = new Logger(ProjectsDailyProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: ProjectsContextService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const rows = await this.prisma.projectSettings.findMany({
      select: { businessId: true, config: true },
    });
    for (const r of rows) {
      try {
        await this.runFor(r.businessId, r.config);
      } catch (e) {
        this.logger.warn(
          `projects daily failed for ${r.businessId}: ${(e as Error).message}`,
        );
      }
    }
  }

  async runFor(businessId: string, rawConfig: unknown) {
    const biz = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    if (!biz) return;
    const today = todayIn(biz.timezone);
    const marker = `daily ${today}`;
    const done = await this.prisma.projectActivity.findFirst({
      where: { businessId, event: 'system.daily', text: marker },
    });
    if (done) return;
    await this.prisma.projectActivity.create({
      data: {
        businessId,
        actorName: 'Noxtill',
        event: 'system.daily',
        text: marker,
      },
    });

    const cfg = mergeConfig(rawConfig);
    const days = ARCHIVE_DAYS[cfg.archiveDays];
    if (days != null) {
      const doneNames = cfg.statuses
        .filter((s) => s.cat === 'Done')
        .map((s) => s.name);
      const cutoff = new Date(Date.now() - days * 864e5);
      const stale = await this.prisma.project.findMany({
        where: {
          businessId,
          status: { in: doneNames },
          completedAt: { lt: cutoff },
          archivedAt: null,
        },
        select: { id: true, name: true },
      });
      for (const p of stale) {
        await this.prisma.project.update({
          where: { id: p.id },
          data: { status: 'Archived', archivedAt: new Date() },
        });
        await this.ctx.activity(
          { name: 'Noxtill' },
          'status.changed',
          `auto-archived ${p.name} (${cfg.archiveDays} after completion)`,
          { projectId: p.id },
          businessId,
        );
      }
    }

    const overdue = await this.prisma.projectTask.findMany({
      where: {
        businessId,
        dueDate: parseDay(addDays(today, -1)),
        status: { notIn: ['Done', 'Cancelled'] },
        assigneeId: { not: null },
      },
      select: { id: true, number: true, title: true, assigneeId: true },
    });
    for (const t of overdue) {
      await this.ctx.notifyPerson(
        t.assigneeId,
        'Task overdue',
        {
          title: `Overdue: ${t.title}`,
          body: `${t.number} was due yesterday.`,
          link: `/projects/tasks?task=${t.id}`,
        },
        undefined,
        businessId,
      );
    }
    const soon = await this.prisma.projectMilestone.findMany({
      where: {
        businessId,
        plannedDate: parseDay(addDays(today, 3))!,
        status: { notIn: ['Completed', 'Cancelled'] },
        ownerId: { not: null },
      },
      select: { name: true, ownerId: true, projectId: true },
    });
    for (const m of soon) {
      await this.ctx.notifyPerson(
        m.ownerId,
        'Milestone due',
        {
          title: `Milestone in 3 days: ${m.name}`,
          body: 'Check that its linked tasks will be done in time.',
          link: `/projects/${m.projectId}`,
        },
        undefined,
        businessId,
      );
    }
  }
}
