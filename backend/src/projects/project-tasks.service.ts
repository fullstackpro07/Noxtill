import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  ProjectsContextService,
  addDays,
  dayDiff,
  isoDay,
  parseDay,
} from './projects-context.service';
import { ProjectsLoaderService } from './projects-loader.service';
import {
  ActorAccess,
  ProjectsPermissionsService,
} from './projects-permissions.service';
import {
  PRIORITIES,
  PROJECT_ERRORS,
  TASK_STATUSES,
  WIP_LIMIT,
} from './projects.constants';
import { dependentsOf, wouldCycle } from './projects-metrics';

export interface TaskInput {
  projectId?: string;
  title?: string;
  description?: string | null;
  assigneeId?: string | null;
  priority?: string;
  status?: string;
  startDate?: string | null;
  dueDate?: string | null;
  estimateMins?: number;
  parentTaskId?: string | null;
  clientVisible?: boolean;
  customFields?: Record<string, unknown>;
  checklist?: Array<{ t: string; done: boolean; req: boolean }>;
  blocked?: boolean;
  blockType?: string | null;
  blockerNote?: string | null;
}

type ChecklistItem = { t: string; done: boolean; req: boolean };

@Injectable()
export class ProjectTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: ProjectsContextService,
    private readonly loader: ProjectsLoaderService,
    private readonly perms: ProjectsPermissionsService,
  ) {}

  async task(id: string) {
    const t = await this.prisma.projectTask.findUnique({ where: { id } });
    if (!t)
      throw new AppException(
        PROJECT_ERRORS.TASK_NOT_FOUND,
        'Task not found',
        HttpStatus.NOT_FOUND,
      );
    await this.loader.project(t.projectId); // branch guard
    return t;
  }

  private assertCanEdit(
    acc: ActorAccess,
    t: { assigneeId: string | null; createdById: string | null },
    actor: AuthenticatedUser,
  ) {
    const mine =
      (!!acc.personId && t.assigneeId === acc.personId) ||
      t.createdById === actor.sub;
    if (!mine) ProjectsPermissionsService.check(acc, 'Edit others’ tasks');
  }

  private async assertAssignee(
    acc: ActorAccess,
    assigneeId: string | null | undefined,
  ) {
    if (!assigneeId) return;
    const people = await this.ctx.people();
    if (!people.some((p) => p.id === assigneeId && p.active))
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Assignee must be an active staff member.',
        HttpStatus.BAD_REQUEST,
      );
    if (assigneeId !== acc.personId)
      ProjectsPermissionsService.check(acc, 'Assign tasks');
  }

  async create(actor: AuthenticatedUser, input: TaskInput) {
    const acc = await this.perms.assert(actor, 'Create tasks');
    if (!input.projectId)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Pick a project for the task.',
        HttpStatus.BAD_REQUEST,
      );
    const p = await this.loader.project(input.projectId);
    const title = (input.title ?? '').trim();
    if (!title)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Give the task a title.',
        HttpStatus.BAD_REQUEST,
      );
    const assigneeId =
      input.assigneeId === undefined ? acc.personId : input.assigneeId;
    await this.assertAssignee(acc, assigneeId);
    const status =
      (TASK_STATUSES as readonly string[]).includes(input.status ?? '') &&
      input.status !== 'Done'
        ? input.status!
        : 'To Do';
    if (input.parentTaskId) {
      const parent = await this.task(input.parentTaskId);
      if (parent.projectId !== p.id)
        throw new AppException(
          PROJECT_ERRORS.INVALID,
          'A subtask must be in the same project.',
          HttpStatus.BAD_REQUEST,
        );
    }
    const start = parseDay(input.startDate ?? null);
    const due = parseDay(input.dueDate ?? null);
    if (start && due && due < start)
      throw new AppException(
        PROJECT_ERRORS.DATES_INVALID,
        'Due date must be on or after the start date.',
        HttpStatus.BAD_REQUEST,
      );
    const number = await this.ctx.nextNumber('taskSeq');
    const max = await this.prisma.projectTask.aggregate({
      where: { projectId: p.id },
      _max: { sortOrder: true },
    });
    const t = await this.ctx.db.projectTask.create({
      data: {
        businessId: this.ctx.businessId(),
        number,
        projectId: p.id,
        parentTaskId: input.parentTaskId ?? null,
        title: title.slice(0, 255),
        description: input.description?.trim() || null,
        assigneeId: assigneeId ?? null,
        priority: (PRIORITIES as readonly string[]).includes(
          input.priority ?? '',
        )
          ? input.priority!
          : 'Medium',
        status,
        startDate: start,
        dueDate: due,
        baselineStart: start,
        baselineDue: due,
        estimateMins: Math.max(0, Math.round(input.estimateMins ?? 0)),
        clientVisible: !!input.clientVisible,
        customFields: (await this.taskFields(
          input.customFields ?? {},
        )) as Prisma.InputJsonValue,
        checklist: sanitizeChecklist(
          input.checklist ?? [],
        ) as Prisma.InputJsonValue,
        sortOrder: (max._max.sortOrder ?? 0) + 1,
        createdById: actor.sub,
      },
    });
    await this.ctx.activity(
      actor,
      'task.created',
      `created ${t.number} ${t.title} in ${p.name}`,
      { projectId: p.id, taskId: t.id },
    );
    if (t.assigneeId)
      await this.ctx.notifyPerson(
        t.assigneeId,
        'Task assigned',
        {
          title: `Assigned: ${t.title}`,
          body: `${t.number} · ${p.name}`,
          link: `/projects/tasks?task=${t.id}`,
        },
        actor.sub,
      );
    return { id: t.id, number: t.number };
  }

  async update(actor: AuthenticatedUser, id: string, input: TaskInput) {
    const acc = await this.perms.access(actor);
    const t = await this.task(id);
    this.assertCanEdit(acc, t, actor);
    const data: Prisma.ProjectTaskUpdateInput = {};
    if (input.title !== undefined) {
      if (!input.title.trim())
        throw new AppException(
          PROJECT_ERRORS.INVALID,
          'Give the task a title.',
          HttpStatus.BAD_REQUEST,
        );
      data.title = input.title.trim().slice(0, 255);
    }
    if (input.description !== undefined)
      data.description = input.description?.trim() || null;
    if (input.assigneeId !== undefined && input.assigneeId !== t.assigneeId) {
      await this.assertAssignee(acc, input.assigneeId);
      data.assigneeId = input.assigneeId || null;
    }
    if (
      input.priority !== undefined &&
      (PRIORITIES as readonly string[]).includes(input.priority)
    )
      data.priority = input.priority;
    if (input.estimateMins !== undefined)
      data.estimateMins = Math.max(0, Math.round(input.estimateMins));
    if (input.clientVisible !== undefined)
      data.clientVisible = !!input.clientVisible;
    if (input.customFields !== undefined)
      data.customFields = {
        ...((t.customFields ?? {}) as Record<string, unknown>),
        ...(await this.taskFields(input.customFields)),
      } as Prisma.InputJsonValue;
    if (input.checklist !== undefined)
      data.checklist = sanitizeChecklist(input.checklist);
    const start =
      input.startDate !== undefined ? parseDay(input.startDate) : t.startDate;
    const due =
      input.dueDate !== undefined ? parseDay(input.dueDate) : t.dueDate;
    if (start && due && due < start)
      throw new AppException(
        PROJECT_ERRORS.DATES_INVALID,
        'Due date must be on or after the start date.',
        HttpStatus.BAD_REQUEST,
      );
    if (input.startDate !== undefined) {
      data.startDate = start;
      if (!t.baselineStart) data.baselineStart = start;
    }
    if (input.dueDate !== undefined) {
      data.dueDate = due;
      if (!t.baselineDue) data.baselineDue = due;
    }
    if (input.blocked !== undefined) {
      data.blocked = !!input.blocked;
      data.blockType = input.blocked
        ? (input.blockType || 'Internal').slice(0, 30)
        : null;
      data.blockerNote = input.blocked
        ? input.blockerNote?.trim() || null
        : null;
    }
    await this.ctx.db.projectTask.update({ where: { id }, data });
    if (
      input.assigneeId !== undefined &&
      input.assigneeId &&
      input.assigneeId !== t.assigneeId
    ) {
      const p = await this.prisma.project.findUnique({
        where: { id: t.projectId },
        select: { name: true },
      });
      await this.ctx.notifyPerson(
        input.assigneeId,
        'Task assigned',
        {
          title: `Assigned: ${t.title}`,
          body: `${t.number} · ${p?.name ?? ''}`,
          link: `/projects/tasks?task=${t.id}`,
        },
        actor.sub,
      );
    }
    if (input.blocked === true && !t.blocked)
      await this.ctx.activity(
        actor,
        'task.blocked',
        `marked ${t.title} as Blocked`,
        { projectId: t.projectId, taskId: id },
      );
    else
      await this.ctx.activity(
        actor,
        'task.updated',
        `updated ${t.number} ${t.title}`,
        { projectId: t.projectId, taskId: id },
      );
    let warning: string | null = null;
    if (input.status !== undefined && input.status !== t.status)
      warning = (await this.setStatus(actor, id, input.status)).warning;
    return { ok: true, warning };
  }

  /**
   * Status change with the design's guard rails: Done needs every required checklist item ticked
   * and every Finish-to-Start dependency Done. Moving into In Progress past the WIP limit is
   * allowed but reported back so the UI can warn.
   */
  async setStatus(actor: AuthenticatedUser, id: string, status: string) {
    const acc = await this.perms.access(actor);
    const t = await this.task(id);
    this.assertCanEdit(acc, t, actor);
    if (!(TASK_STATUSES as readonly string[]).includes(status))
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        `Unknown task status “${status}”.`,
        HttpStatus.BAD_REQUEST,
      );
    if (t.status === status) return { ok: true, warning: null };
    if (status === 'Done') {
      const miss = (
        Array.isArray(t.checklist) ? (t.checklist as ChecklistItem[]) : []
      )
        .filter((c) => c.req && !c.done)
        .map((c) => c.t);
      if (miss.length) {
        throw new AppException(
          PROJECT_ERRORS.CHECKLIST_INCOMPLETE,
          `${t.number} can’t move to Done until these required checklist items are finished: ${miss.join('; ')}.`,
          HttpStatus.CONFLICT,
        );
      }
      const deps = await this.prisma.projectTaskDependency.findMany({
        where: { taskId: id },
        include: {
          dependsOnTask: {
            select: { number: true, title: true, status: true },
          },
        },
      });
      const open = deps.filter(
        (d) =>
          d.dependsOnTask.status !== 'Done' &&
          d.dependsOnTask.status !== 'Cancelled',
      );
      if (open.length) {
        throw new AppException(
          PROJECT_ERRORS.DEPS_OPEN,
          `${t.number} depends on tasks that are not done yet: ${open.map((d) => `${d.dependsOnTask.number} · ${d.dependsOnTask.title}`).join('; ')}.`,
          HttpStatus.CONFLICT,
        );
      }
    }
    let warning: string | null = null;
    if (status === 'In Progress') {
      const n = await this.prisma.projectTask.count({
        where: { businessId: this.ctx.businessId(), status: 'In Progress' },
      });
      const limit = (await this.ctx.config()).wipLimit || WIP_LIMIT;
      if (n >= limit)
        warning = `In Progress is over its WIP limit (${limit}). Moved anyway — consider finishing work first.`;
    }
    await this.ctx.db.projectTask.update({
      where: { id },
      data: {
        status,
        completedAt: status === 'Done' ? new Date() : null,
        ...(status === 'Done'
          ? { blocked: false, blockType: null, blockerNote: null }
          : {}),
        ...(status === 'Blocked' && !t.blocked
          ? { blocked: true, blockType: t.blockType ?? 'Internal' }
          : {}),
      },
    });
    const ev =
      status === 'Done'
        ? 'task.completed'
        : status === 'Blocked'
          ? 'task.blocked'
          : 'task.status_changed';
    const text =
      status === 'Done'
        ? `completed ${t.title}`
        : status === 'Blocked'
          ? `marked ${t.title} as Blocked`
          : `moved ${t.number} to ${status}`;
    await this.ctx.activity(actor, ev, text, {
      projectId: t.projectId,
      taskId: id,
    });
    return { ok: true, warning };
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const acc = await this.perms.access(actor);
    const t = await this.task(id);
    this.assertCanEdit(acc, t, actor);
    const logged = await this.prisma.projectTimeEntry.count({
      where: { taskId: id },
    });
    if (logged)
      throw new AppException(
        PROJECT_ERRORS.DELETE_BLOCKED,
        'Time has been logged against this task — cancel it instead of deleting.',
        HttpStatus.CONFLICT,
      );
    await this.prisma.projectTask.updateMany({
      where: { parentTaskId: id },
      data: { parentTaskId: null },
    });
    await this.ctx.db.projectTask.delete({ where: { id } });
    await this.ctx.activity(
      actor,
      'task.deleted',
      `deleted ${t.number} ${t.title}`,
      { projectId: t.projectId },
    );
    return { ok: true };
  }

  async addDependency(
    actor: AuthenticatedUser,
    id: string,
    dependsOnId: string,
  ) {
    const acc = await this.perms.access(actor);
    const t = await this.task(id);
    this.assertCanEdit(acc, t, actor);
    const d = await this.task(dependsOnId);
    if (d.id === t.id)
      throw new AppException(
        PROJECT_ERRORS.DEP_CYCLE,
        'A task cannot depend on itself.',
        HttpStatus.BAD_REQUEST,
      );
    const all = await this.prisma.projectTaskDependency.findMany({
      where: { businessId: this.ctx.businessId() },
      select: { taskId: true, dependsOnTaskId: true },
    });
    const graph = new Map<string, string[]>();
    all.forEach((x) =>
      graph.set(x.taskId, [...(graph.get(x.taskId) ?? []), x.dependsOnTaskId]),
    );
    const nodes = [...new Set([...graph.keys(), t.id, d.id])].map((k) => ({
      id: k,
      deps: graph.get(k) ?? [],
    }));
    if (wouldCycle(t.id, d.id, nodes)) {
      throw new AppException(
        PROJECT_ERRORS.DEP_CYCLE,
        `This dependency creates a circular chain. ${d.number} already depends on ${t.number}.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.ctx.db.projectTaskDependency.upsert({
      where: {
        taskId_dependsOnTaskId: { taskId: t.id, dependsOnTaskId: d.id },
      },
      update: {},
      create: {
        businessId: this.ctx.businessId(),
        taskId: t.id,
        dependsOnTaskId: d.id,
      },
    });
    await this.ctx.activity(
      actor,
      'task.updated',
      `made ${t.number} wait on ${d.number}`,
      { projectId: t.projectId, taskId: t.id },
    );
    return { ok: true };
  }

  async removeDependency(
    actor: AuthenticatedUser,
    id: string,
    dependsOnId: string,
  ) {
    const acc = await this.perms.access(actor);
    const t = await this.task(id);
    this.assertCanEdit(acc, t, actor);
    await this.ctx.db.projectTaskDependency.deleteMany({
      where: { taskId: id, dependsOnTaskId: dependsOnId },
    });
    return { ok: true };
  }

  /** Keeps only the Task custom fields defined in Project Settings. */
  private async taskFields(input: Record<string, unknown>) {
    const cfg = await this.ctx.config();
    const allowed = new Set(
      cfg.fields.filter((f) => f.applies === 'Task').map((f) => f.name),
    );
    return Object.fromEntries(
      Object.entries(input ?? {})
        .filter(([k]) => allowed.has(k))
        .map(([k, v]) => [k, typeof v === 'string' ? v.slice(0, 500) : v]),
    );
  }

  // ── comments ─────────────────────────────────────────────────────────────

  async comments(id: string) {
    await this.task(id);
    const rows = await this.ctx.db.projectComment.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((c) => ({
      id: c.id,
      who: c.authorName + (c.portalAuthor ? ' (client)' : ''),
      body: c.body,
      when: c.createdAt.toISOString(),
      edited: !!c.editedAt,
    }));
  }

  async addComment(actor: AuthenticatedUser, id: string, body: string) {
    const t = await this.task(id);
    const text = (body ?? '').trim();
    if (!text)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Write a comment first.',
        HttpStatus.BAD_REQUEST,
      );
    const name = await this.ctx.actorName(actor);
    const people = await this.ctx.people();
    const mentioned = people.filter(
      (p) => p.active && text.includes('@' + p.name),
    );
    await this.ctx.db.projectComment.create({
      data: {
        businessId: this.ctx.businessId(),
        projectId: t.projectId,
        taskId: id,
        authorUserId: actor.sub,
        authorName: name,
        body: text.slice(0, 5000),
        mentions: mentioned.map((m) => m.id),
      },
    });
    await this.ctx.activity(
      actor,
      'comment.created',
      `commented on ${t.title}`,
      { projectId: t.projectId, taskId: id },
    );
    const link = `/projects/tasks?task=${id}`;
    for (const m of mentioned)
      await this.ctx.notifyPerson(
        m.id,
        'Mentioned',
        {
          title: `${name} mentioned you`,
          body: `${t.number} · ${text.slice(0, 140)}`,
          link,
        },
        actor.sub,
      );
    if (t.assigneeId && !mentioned.some((m) => m.id === t.assigneeId))
      await this.ctx.notifyPerson(
        t.assigneeId,
        'Comment reply',
        { title: `New comment on ${t.title}`, body: text.slice(0, 140), link },
        actor.sub,
      );
    return { ok: true, notified: mentioned.length };
  }

  // ── reschedule with downstream impact ────────────────────────────────────

  async reschedulePlan(actor: AuthenticatedUser, id: string, newDue: string) {
    const L = await this.loader.load(actor);
    const t = L.tasks.find((x) => x.id === id);
    if (!t)
      throw new AppException(
        PROJECT_ERRORS.TASK_NOT_FOUND,
        'Task not found',
        HttpStatus.NOT_FOUND,
      );
    if (!t.dueDate)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'This task has no due date to move.',
        HttpStatus.BAD_REQUEST,
      );
    parseDay(newDue);
    const delta = dayDiff(newDue, t.dueDate);
    const deps = dependentsOf(
      id,
      L.mTasks
        .filter((x) => x.status !== 'Done' && x.status !== 'Cancelled')
        .concat(L.mTasks.filter((x) => x.id === id)),
    );
    const moving = [id, ...deps];
    const ms = L.milestones.filter(
      (m) =>
        m.status !== 'Completed' &&
        m.status !== 'Cancelled' &&
        m.taskIds.some((x) => moving.includes(x)),
    );
    const items = [
      `${t.number}: ${t.dueDate} → ${newDue} (${delta > 0 ? '+' : ''}${delta}d)`,
      ...deps.map((d) => {
        const x = L.tasks.find((y) => y.id === d)!;
        return `${x.number} ${x.title}: ${x.dueDate ?? '—'} → ${x.dueDate ? addDays(x.dueDate, delta) : '—'}`;
      }),
      ...ms.map((m) => {
        const latest = moving
          .filter((x) => m.taskIds.includes(x))
          .map((x) => L.tasks.find((y) => y.id === x)?.dueDate)
          .filter(Boolean)
          .map((d) => addDays(d!, delta))
          .sort()
          .pop();
        return `Milestone ${m.name} (${m.plannedDate})${latest && latest > m.plannedDate ? ' — would be missed' : ' — still on track'}`;
      }),
    ];
    return {
      taskId: id,
      number: t.number,
      delta,
      dependents: deps.length,
      milestones: ms.length,
      items,
      onlyAllowed: delta < 0 || !deps.length,
    };
  }

  async reschedule(
    actor: AuthenticatedUser,
    id: string,
    newDue: string,
    withDependents: boolean,
  ) {
    const acc = await this.perms.access(actor);
    const base = await this.task(id);
    this.assertCanEdit(acc, base, actor);
    const plan = await this.reschedulePlan(actor, id, newDue);
    if (!withDependents && plan.dependents && !plan.onlyAllowed) {
      throw new AppException(
        PROJECT_ERRORS.RESCHEDULE_BREAKS_DEPS,
        'Moving this task later without its dependents would break Finish-to-Start links.',
        HttpStatus.CONFLICT,
      );
    }
    const L = await this.loader.load(actor);
    const ids = withDependents
      ? [
          id,
          ...dependentsOf(
            id,
            L.mTasks
              .filter((x) => x.status !== 'Done' && x.status !== 'Cancelled')
              .concat(L.mTasks.filter((x) => x.id === id)),
          ),
        ]
      : [id];
    await this.prisma.$transaction(async (tx) => {
      for (const tid of ids) {
        const x = await tx.projectTask.findUniqueOrThrow({
          where: { id: tid },
        });
        const due = isoDay(x.dueDate);
        const start =
          isoDay(x.startDate) ??
          (due
            ? addDays(due, -Math.max(1, Math.ceil(x.estimateMins / 480)))
            : null);
        await tx.projectTask.update({
          where: { id: tid },
          data: {
            dueDate: due ? parseDay(addDays(due, plan.delta)) : null,
            startDate: start ? parseDay(addDays(start, plan.delta)) : null,
            baselineStart: x.baselineStart ?? x.startDate,
            baselineDue: x.baselineDue ?? x.dueDate,
          },
        });
      }
    });
    const extra =
      withDependents && ids.length > 1
        ? ` and ${ids.length - 1} dependent task${ids.length > 2 ? 's' : ''}`
        : '';
    await this.ctx.activity(
      actor,
      'task.updated',
      `rescheduled ${base.number}${extra}`,
      { projectId: base.projectId, taskId: id },
    );
    return { moved: ids.length, delta: plan.delta };
  }
}

function sanitizeChecklist(list: ChecklistItem[]): ChecklistItem[] {
  return (Array.isArray(list) ? list : [])
    .filter((c) => c && typeof c.t === 'string' && c.t.trim())
    .slice(0, 50)
    .map((c) => ({
      t: c.t.trim().slice(0, 200),
      done: !!c.done,
      req: !!c.req,
    }));
}
