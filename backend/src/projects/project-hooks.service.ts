import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import {
  ProjectsContextService,
  addDays,
  parseDay,
} from './projects-context.service';
import { usDate } from './projects-metrics';

export type HookKey =
  | 'project.created'
  | 'project.deadline_approaching'
  | 'task.overdue'
  | 'milestone.completed'
  | 'project.completed';

/**
 * Project automation hooks a project (or its template) opts into. Each one performs a real,
 * visible action inside Noxtill — an in-app notification to the right people or a review request
 * through Reviews — and records what it did in the project activity feed.
 */
@Injectable()
export class ProjectHooksService {
  private readonly logger = new Logger(ProjectHooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: ProjectsContextService,
    private readonly reviews: ReviewRequestsService,
  ) {}

  private async project(projectId: string) {
    const p = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        businessId: true,
        managerId: true,
        customerId: true,
        automationRefs: true,
        dueDate: true,
      },
    });
    if (!p) return null;
    const refs = Array.isArray(p.automationRefs)
      ? (p.automationRefs as string[])
      : [];
    return { ...p, refs };
  }

  private async log(businessId: string, projectId: string, text: string) {
    await this.ctx.activity(
      { name: 'Noxtill automation' },
      'automation.ran',
      text,
      { projectId },
      businessId,
    );
  }

  async projectCreated(projectId: string, actorUserId: string) {
    const p = await this.project(projectId);
    if (!p || !p.refs.includes('project.created')) return;
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: { businessUserId: true },
    });
    const all = [
      ...new Set(
        [p.managerId, ...members.map((m) => m.businessUserId)].filter(
          Boolean,
        ) as string[],
      ),
    ];
    // The person who created the project is not told about their own action.
    const people = await this.prisma.businessUser.findMany({
      where: { id: { in: all } },
      select: { id: true, userId: true },
    });
    const ids = new Set(
      people.filter((x) => x.userId !== actorUserId).map((x) => x.id),
    );
    if (!ids.size) {
      await this.log(
        p.businessId,
        p.id,
        'no other team members to notify about the new project',
      );
      return;
    }
    for (const id of ids) {
      await this.ctx.notifyPerson(
        id,
        null,
        {
          title: `You’re on a new project: ${p.name}`,
          body: 'You were added to the project team.',
          link: `/projects/${p.id}`,
        },
        actorUserId,
        p.businessId,
      );
    }
    await this.log(
      p.businessId,
      p.id,
      `notified ${ids.size} team member${ids.size === 1 ? '' : 's'} about the new project`,
    );
  }

  async milestoneCompleted(projectId: string, milestoneName: string) {
    const p = await this.project(projectId);
    if (!p || !p.refs.includes('milestone.completed') || !p.managerId) return;
    await this.ctx.notifyPerson(
      p.managerId,
      null,
      {
        title: `${milestoneName} completed — send the client an update`,
        body: `A client status draft for ${p.name} is ready to review.`,
        link: `/projects/${p.id}?ai=status`,
      },
      undefined,
      p.businessId,
    );
    await this.log(
      p.businessId,
      p.id,
      `prepared a client update draft after ${milestoneName}`,
    );
  }

  async projectCompleted(projectId: string) {
    const p = await this.project(projectId);
    if (!p || !p.refs.includes('project.completed')) return;
    if (!p.customerId) {
      await this.log(
        p.businessId,
        p.id,
        'skipped the review request — the project has no customer',
      );
      return;
    }
    try {
      await this.reviews.create(p.businessId, {
        customerId: p.customerId,
        source: 'project',
        sourceId: p.id,
      });
      await this.log(
        p.businessId,
        p.id,
        'scheduled a review request to the customer',
      );
    } catch (e) {
      await this.log(
        p.businessId,
        p.id,
        `could not request a review: ${(e as Error).message}`.slice(0, 480),
      );
    }
  }

  /** Daily: deadline reminders (3 days out) and overdue-task digests, for projects that opted in. */
  async daily(businessId: string, today: string) {
    const projects = await this.prisma.project.findMany({
      where: { businessId, archivedAt: null, completedAt: null },
      select: {
        id: true,
        name: true,
        managerId: true,
        dueDate: true,
        automationRefs: true,
      },
    });
    for (const p of projects) {
      const refs = Array.isArray(p.automationRefs)
        ? (p.automationRefs as string[])
        : [];
      if (!p.managerId) continue;
      if (
        refs.includes('project.deadline_approaching') &&
        p.dueDate &&
        p.dueDate.getTime() === parseDay(addDays(today, 3))!.getTime()
      ) {
        await this.ctx.notifyPerson(
          p.managerId,
          null,
          {
            title: `${p.name} is due in 3 days`,
            body: `Deadline ${usDate(addDays(today, 3))}.`,
            link: `/projects/${p.id}`,
          },
          undefined,
          businessId,
        );
        await this.log(
          businessId,
          p.id,
          'reminded the manager that the deadline is 3 days away',
        );
      }
      if (refs.includes('task.overdue')) {
        const overdue = await this.prisma.projectTask.findMany({
          where: {
            projectId: p.id,
            status: { notIn: ['Done', 'Cancelled'] },
            dueDate: { lt: parseDay(today)! },
          },
          select: { number: true },
          orderBy: { dueDate: 'asc' },
        });
        if (overdue.length) {
          await this.ctx.notifyPerson(
            p.managerId,
            null,
            {
              title: `${p.name}: ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`,
              body: overdue
                .map((t) => t.number)
                .slice(0, 10)
                .join(', '),
              link: `/projects/${p.id}`,
            },
            undefined,
            businessId,
          );
          await this.log(
            businessId,
            p.id,
            `sent the daily overdue digest (${overdue.length})`,
          );
        }
      }
    }
    this.logger.debug(`project hooks daily done for ${businessId}`);
  }
}
