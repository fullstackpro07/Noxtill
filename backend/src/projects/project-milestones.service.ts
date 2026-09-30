import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { ProjectsContextService, parseDay } from './projects-context.service';
import { ProjectsLoaderService } from './projects-loader.service';
import { ProjectsPermissionsService } from './projects-permissions.service';
import { ProjectHooksService } from './project-hooks.service';
import { PROJECT_ERRORS } from './projects.constants';
import { toCsv } from './projects.service';

export interface MilestoneInput {
  projectId?: string;
  name?: string;
  ownerId?: string | null;
  plannedDate?: string;
  description?: string | null;
  approvalMode?: string;
  taskIds?: string[];
}

@Injectable()
export class ProjectMilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: ProjectsContextService,
    private readonly loader: ProjectsLoaderService,
    private readonly perms: ProjectsPermissionsService,
    private readonly hooks: ProjectHooksService,
  ) {}

  async milestone(id: string) {
    const m = await this.prisma.projectMilestone.findUnique({
      where: { id },
      include: { tasks: true },
    });
    if (!m)
      throw new AppException(
        PROJECT_ERRORS.MILESTONE_NOT_FOUND,
        'Milestone not found',
        HttpStatus.NOT_FOUND,
      );
    await this.loader.project(m.projectId);
    return m;
  }

  async create(actor: AuthenticatedUser, input: MilestoneInput) {
    await this.perms.assert(actor, 'Edit projects');
    const name = (input.name ?? '').trim();
    if (!name)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Milestone name is required.',
        HttpStatus.BAD_REQUEST,
      );
    if (!input.projectId)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Pick a project.',
        HttpStatus.BAD_REQUEST,
      );
    const p = await this.loader.project(input.projectId);
    const planned = parseDay(input.plannedDate ?? null);
    if (!planned)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Pick a planned date.',
        HttpStatus.BAD_REQUEST,
      );
    const mode = ['not_required', 'internal', 'client'].includes(
      input.approvalMode ?? '',
    )
      ? input.approvalMode!
      : 'not_required';
    const taskIds = await this.validTaskIds(p.id, input.taskIds ?? []);
    const number = await this.ctx.nextNumber('msSeq');
    const m = await this.ctx.db.projectMilestone.create({
      data: {
        businessId: this.ctx.businessId(),
        number,
        projectId: p.id,
        name: name.slice(0, 191),
        ownerId: input.ownerId || p.managerId,
        plannedDate: planned,
        description: input.description?.trim() || null,
        approvalMode: mode,
      },
    });
    if (taskIds.length)
      await this.ctx.db.projectMilestoneTask.createMany({
        data: taskIds.map((taskId) => ({
          businessId: this.ctx.businessId(),
          milestoneId: m.id,
          taskId,
        })),
      });
    await this.ctx.activity(
      actor,
      'milestone.created',
      `added milestone ${m.name} to ${p.name}`,
      { projectId: p.id },
    );
    return { id: m.id, number };
  }

  async update(actor: AuthenticatedUser, id: string, input: MilestoneInput) {
    await this.perms.assert(actor, 'Edit projects');
    const m = await this.milestone(id);
    const data: Prisma.ProjectMilestoneUpdateInput = {};
    if (input.name !== undefined) {
      if (!input.name.trim())
        throw new AppException(
          PROJECT_ERRORS.INVALID,
          'Milestone name is required.',
          HttpStatus.BAD_REQUEST,
        );
      data.name = input.name.trim().slice(0, 191);
    }
    if (input.ownerId !== undefined) data.ownerId = input.ownerId || null;
    if (input.plannedDate !== undefined)
      data.plannedDate = parseDay(input.plannedDate) ?? m.plannedDate;
    if (input.description !== undefined)
      data.description = input.description?.trim() || null;
    if (
      input.approvalMode !== undefined &&
      ['not_required', 'internal', 'client'].includes(input.approvalMode)
    )
      data.approvalMode = input.approvalMode;
    await this.ctx.db.projectMilestone.update({ where: { id }, data });
    if (input.taskIds !== undefined) {
      const ids = await this.validTaskIds(m.projectId, input.taskIds);
      await this.ctx.db.projectMilestoneTask.deleteMany({
        where: { milestoneId: id },
      });
      if (ids.length)
        await this.ctx.db.projectMilestoneTask.createMany({
          data: ids.map((taskId) => ({
            businessId: this.ctx.businessId(),
            milestoneId: id,
            taskId,
          })),
        });
    }
    await this.ctx.activity(
      actor,
      'milestone.updated',
      `updated milestone ${m.name}`,
      { projectId: m.projectId },
    );
    return { ok: true };
  }

  /**
   * Completion rules: every linked task Done, and a client-approval milestone only completes after
   * the client approved it in the portal (an internal one after its internal approver did).
   */
  async complete(actor: AuthenticatedUser, id: string) {
    await this.perms.assert(actor, 'Edit projects');
    const m = await this.milestone(id);
    if (m.status === 'Completed') return { ok: true };
    const tasks = await this.prisma.projectTask.findMany({
      where: { id: { in: m.tasks.map((t) => t.taskId) } },
      select: { number: true, title: true, status: true },
    });
    const open = tasks.filter(
      (t) => t.status !== 'Done' && t.status !== 'Cancelled',
    );
    if (open.length) {
      throw new AppException(
        PROJECT_ERRORS.MILESTONE_TASKS_OPEN,
        `${m.name} can’t be completed until its linked tasks are done: ${open.map((t) => `${t.number} · ${t.title} (${t.status})`).join('; ')}.`,
        HttpStatus.CONFLICT,
      );
    }
    if (m.approvalMode !== 'not_required') {
      const approved = await this.prisma.projectApproval.count({
        where: { milestoneId: id, status: 'Approved' },
      });
      if (!approved) {
        throw new AppException(
          PROJECT_ERRORS.MILESTONE_NEEDS_CLIENT,
          m.approvalMode === 'client'
            ? 'This milestone requires client approval. It can only complete after the client approves — never on their behalf.'
            : 'This milestone requires internal approval before it can complete.',
          HttpStatus.CONFLICT,
        );
      }
    }
    const today = await this.ctx.today();
    await this.ctx.db.projectMilestone.update({
      where: { id },
      data: { status: 'Completed', actualDate: parseDay(today) },
    });
    await this.ctx.activity(
      actor,
      'milestone.completed',
      `completed milestone ${m.name}`,
      { projectId: m.projectId },
    );
    await this.ctx.auditLog(
      'milestone.completed',
      'ProjectMilestone',
      id,
      { status: m.status },
      { status: 'Completed', actualDate: today },
    );
    await this.hooks.milestoneCompleted(m.projectId, m.name);
    return { ok: true };
  }

  async markReady(actor: AuthenticatedUser, id: string) {
    await this.perms.assert(actor, 'Edit projects');
    const m = await this.milestone(id);
    if (m.status === 'Completed')
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Milestone is already completed.',
        HttpStatus.CONFLICT,
      );
    await this.ctx.db.projectMilestone.update({
      where: { id },
      data: { status: 'Ready for Approval' },
    });
    await this.ctx.activity(
      actor,
      'milestone.updated',
      `marked ${m.name} ready for approval`,
      { projectId: m.projectId },
    );
    return { ok: true, needsRequest: m.approvalMode !== 'not_required' };
  }

  async remove(actor: AuthenticatedUser, id: string) {
    await this.perms.assert(actor, 'Edit projects');
    const m = await this.milestone(id);
    await this.ctx.db.projectMilestone.delete({ where: { id } });
    await this.ctx.activity(
      actor,
      'milestone.deleted',
      `removed milestone ${m.name}`,
      { projectId: m.projectId },
    );
    return { ok: true };
  }

  async exportCsv(actor: AuthenticatedUser, ids: string[]) {
    await this.perms.assert(actor, 'Export');
    const L = await this.loader.load(actor);
    const people = new Map(L.people.map((p) => [p.id, p.name]));
    const rows = L.milestones.filter((m) => !ids.length || ids.includes(m.id));
    const body = rows.map((m) => [
      m.number,
      m.name,
      L.projects.find((p) => p.id === m.projectId)?.name ?? '',
      people.get(m.ownerId ?? '') ?? '',
      m.plannedDate,
      m.status,
      m.pct + '%',
    ]);
    return {
      filename: 'milestones.csv',
      csv: toCsv(
        [
          'Milestone ID',
          'Name',
          'Project',
          'Owner',
          'Planned',
          'Status',
          'Completion',
        ],
        body,
      ),
      count: rows.length,
    };
  }

  private async validTaskIds(projectId: string, ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prisma.projectTask.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
