import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  ProjectsContextService,
  Person,
  addDays,
  isoDay,
} from './projects-context.service';
import {
  ActorAccess,
  ProjectsPermissionsService,
} from './projects-permissions.service';
import { PROJECT_ERRORS, ProjectConfig } from './projects.constants';
import {
  Health,
  MMilestone,
  MProject,
  MTask,
  criticalPath,
  healthOf,
  isBlocked,
  isOpenTask,
  isOverdue,
  milestonePct,
  milestoneStatus,
  progressOf,
  statusCategory,
} from './projects-metrics';

export interface ProjectRow {
  id: string;
  businessId: string;
  number: string;
  name: string;
  customerId: string | null;
  customerName: string | null;
  customerContact: string | null;
  managerId: string | null;
  type: string;
  status: string;
  statusCat: string;
  priority: string;
  visibility: string;
  health: Health;
  healthWhy: string;
  dims: Array<{ dim: string; v: string }>;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  dueLocked: boolean;
  baselineDueDate: string | null;
  taskCount: number;
  openCount: number;
  doneCount: number;
  overdueCount: number;
  blockedCount: number;
  nextMilestone: { id: string; name: string; date: string } | null;
  budget: number | null;
  consumed: number | null;
  billingType: string;
  description: string | null;
  objective: string | null;
  deliverables: string | null;
  exclusions: string | null;
  requireClientApproval: boolean;
  lastActivityAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  favorite: boolean;
  members: Array<{
    personId: string;
    roleLabel: string;
    allocationPct: number;
  }>;
  customFields: Record<string, unknown>;
  automationRefs: string[];
  templateId: string | null;
}

export interface TaskRow {
  id: string;
  number: string;
  projectId: string;
  parentTaskId: string | null;
  title: string;
  description: string | null;
  assigneeId: string | null;
  priority: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  baselineStart: string | null;
  baselineDue: string | null;
  estimateMins: number;
  loggedMins: number;
  checklist: Array<{ t: string; done: boolean; req: boolean }>;
  blocked: boolean;
  blockType: string | null;
  blockerNote: string | null;
  clientVisible: boolean;
  customFields: Record<string, unknown>;
  deps: string[];
  subDone: number;
  subTotal: number;
  commentCount: number;
  milestoneIds: string[];
  critical: boolean;
  createdById: string | null;
  completedAt: string | null;
}

export interface MilestoneRow {
  id: string;
  number: string;
  projectId: string;
  name: string;
  ownerId: string | null;
  plannedDate: string;
  actualDate: string | null;
  status: string;
  storedStatus: string;
  pct: number;
  description: string | null;
  approvalMode: string;
  approval: string;
  taskIds: string[];
}

export interface WorkloadRow {
  id: string;
  name: string;
  hours: number;
  capacity: number | null;
  tasks: number;
  overdue: number;
}

export interface Loaded {
  today: string;
  weekStart: string;
  weekEnd: string;
  cfg: ProjectConfig;
  acc: ActorAccess;
  people: Person[];
  projects: ProjectRow[];
  tasks: TaskRow[];
  milestones: MilestoneRow[];
  workload: WorkloadRow[];
  capacityKnown: boolean;
  mTasks: MTask[];
  mMilestones: MMilestone[];
  taskMap: Map<string, MTask>;
  approvals: Array<{
    projectId: string;
    type: string;
    status: string;
    approverKind: string;
    dueDate: string | null;
    milestoneId: string | null;
  }>;
}

/**
 * Loads a business's (or the whole group's, for "All branches") project rows and computes every
 * derived figure once — progress, health, budget consumption, logged time, milestone status,
 * workload and critical path — then filters to what the actor's project role may see.
 */
@Injectable()
export class ProjectsLoaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: ProjectsContextService,
    private readonly perms: ProjectsPermissionsService,
  ) {}

  async scopeIds(actor: AuthenticatedUser, scope?: string): Promise<string[]> {
    const current = this.ctx.businessId();
    if (scope === 'all' && current === actor.businessId)
      return this.ctx.groupIds(actor.businessId);
    return [current];
  }

  /** Project in the current business, or a clear error if it lives in another branch. */
  async project(id: string) {
    const businessId = this.ctx.businessId();
    const p = await this.prisma.project.findUnique({ where: { id } });
    if (!p)
      throw new AppException(
        PROJECT_ERRORS.NOT_FOUND,
        'Project not found',
        HttpStatus.NOT_FOUND,
      );
    if (p.businessId !== businessId) {
      const group = await this.ctx.groupIds(businessId);
      if (!group.includes(p.businessId))
        throw new AppException(
          PROJECT_ERRORS.NOT_FOUND,
          'Project not found',
          HttpStatus.NOT_FOUND,
        );
      const b = await this.prisma.business.findUnique({
        where: { id: p.businessId },
        select: { name: true },
      });
      throw new AppException(
        PROJECT_ERRORS.OTHER_BRANCH,
        `${p.name} belongs to ${b?.name ?? 'another branch'}. Switch to that branch to change it.`,
        HttpStatus.CONFLICT,
      );
    }
    return p;
  }

  async load(
    actor: AuthenticatedUser,
    scope?: string,
    opts: { includeArchived?: boolean } = {},
  ): Promise<Loaded> {
    const ids = await this.scopeIds(actor, scope);
    const businessId = this.ctx.businessId();
    const [today, cfg, acc, people] = await Promise.all([
      this.ctx.today(),
      this.ctx.config(),
      this.perms.access(actor),
      this.peopleFor(ids),
    ]);
    const weekStart = mondayOf(today);
    const weekEnd = addDays(weekStart, 6);

    const [
      projects,
      tasks,
      deps,
      milestones,
      msLinks,
      entries,
      approvals,
      comments,
      favorites,
      members,
      shifts,
    ] = await Promise.all([
      this.prisma.project.findMany({
        where: { businessId: { in: ids }, ...(opts.includeArchived ? {} : {}) },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.projectTask.findMany({
        where: { businessId: { in: ids } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.projectTaskDependency.findMany({
        where: { businessId: { in: ids } },
        select: { taskId: true, dependsOnTaskId: true },
      }),
      this.prisma.projectMilestone.findMany({
        where: { businessId: { in: ids } },
        orderBy: { plannedDate: 'asc' },
      }),
      this.prisma.projectMilestoneTask.findMany({
        where: { businessId: { in: ids } },
        select: { milestoneId: true, taskId: true },
      }),
      this.prisma.projectTimeEntry.findMany({
        where: { businessId: { in: ids }, status: { not: 'rejected' } },
        select: {
          projectId: true,
          taskId: true,
          minutes: true,
          status: true,
          rateSnapshot: true,
        },
      }),
      this.prisma.projectApproval.findMany({
        where: { businessId: { in: ids } },
        select: {
          projectId: true,
          type: true,
          status: true,
          approverKind: true,
          dueDate: true,
          milestoneId: true,
          requestedAt: true,
        },
      }),
      this.prisma.projectComment.groupBy({
        by: ['taskId'],
        where: { businessId: { in: ids }, taskId: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.projectFavorite.findMany({
        where: { businessId: { in: ids }, userId: actor.sub },
        select: { projectId: true },
      }),
      this.prisma.projectMember.findMany({
        where: { businessId: { in: ids } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.staffShift.findMany({
        where: {
          businessId: { in: ids },
          status: { not: 'cancelled' },
          startsAt: {
            gte: new Date(weekStart + 'T00:00:00Z'),
            lt: new Date(addDays(weekEnd, 1) + 'T00:00:00Z'),
          },
        },
        select: { staffUserId: true, startsAt: true, endsAt: true },
      }),
    ]);

    const customerIds = [
      ...new Set(projects.map((p) => p.customerId).filter(Boolean) as string[]),
    ];
    const customers = customerIds.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true, email: true, phone: true },
        })
      : [];
    const custMap = new Map(customers.map((c) => [c.id, c]));

    const depMap = new Map<string, string[]>();
    deps.forEach((d) =>
      depMap.set(d.taskId, [
        ...(depMap.get(d.taskId) ?? []),
        d.dependsOnTaskId,
      ]),
    );
    const logged = new Map<string, number>();
    const consumed = new Map<string, number>();
    entries.forEach((e) => {
      if (e.taskId)
        logged.set(e.taskId, (logged.get(e.taskId) ?? 0) + e.minutes);
      if (e.status === 'approved' && e.rateSnapshot != null)
        consumed.set(
          e.projectId,
          (consumed.get(e.projectId) ?? 0) +
            (e.minutes / 60) * Number(e.rateSnapshot),
        );
    });
    const msTaskMap = new Map<string, string[]>();
    const taskMsMap = new Map<string, string[]>();
    msLinks.forEach((l) => {
      msTaskMap.set(l.milestoneId, [
        ...(msTaskMap.get(l.milestoneId) ?? []),
        l.taskId,
      ]);
      taskMsMap.set(l.taskId, [
        ...(taskMsMap.get(l.taskId) ?? []),
        l.milestoneId,
      ]);
    });
    const commentCount = new Map(
      comments.map((c) => [c.taskId as string, c._count._all]),
    );

    const mTasks: MTask[] = tasks.map((t) => ({
      id: t.id,
      number: t.number,
      projectId: t.projectId,
      title: t.title,
      assigneeId: t.assigneeId,
      status: t.status,
      priority: t.priority,
      startDate: isoDay(t.startDate),
      dueDate: isoDay(t.dueDate),
      estimateMins: t.estimateMins,
      loggedMins: logged.get(t.id) ?? 0,
      blocked: t.blocked,
      blockType: t.blockType,
      deps: depMap.get(t.id) ?? [],
      parentTaskId: t.parentTaskId,
    }));
    const taskMap = new Map(mTasks.map((t) => [t.id, t]));
    const mMilestones: MMilestone[] = milestones.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      name: m.name,
      plannedDate: isoDay(m.plannedDate)!,
      status: m.status,
      approvalMode: m.approvalMode,
      taskIds: msTaskMap.get(m.id) ?? [],
    }));
    const apprRows = approvals.map((a) => ({
      projectId: a.projectId,
      type: a.type,
      status: a.status,
      approverKind: a.approverKind,
      dueDate: isoDay(a.dueDate),
      milestoneId: a.milestoneId,
      requestedAt: a.requestedAt,
    }));

    // Workload — remaining estimate on open tasks due by the end of this week, vs scheduled shifts.
    const capMap = new Map<string, number>();
    shifts.forEach((s) =>
      capMap.set(
        s.staffUserId,
        (capMap.get(s.staffUserId) ?? 0) +
          (s.endsAt.getTime() - s.startsAt.getTime()) / 3.6e6,
      ),
    );
    const capacityKnown = capMap.size > 0;
    const workload: WorkloadRow[] = people
      .filter((p) => p.active)
      .map((p) => {
        const mine = mTasks.filter(
          (t) => t.assigneeId === p.id && isOpenTask(t),
        );
        const dueThisWeek = mine.filter(
          (t) => !t.dueDate || t.dueDate <= weekEnd,
        );
        const hours =
          dueThisWeek.reduce(
            (a, t) => a + Math.max(t.estimateMins - t.loggedMins, 0),
            0,
          ) / 60;
        return {
          id: p.id,
          name: p.name,
          hours,
          capacity: capMap.has(p.id) ? capMap.get(p.id)! : null,
          tasks: mine.length,
          overdue: mine.filter((t) => isOverdue(t, today)).length,
        };
      })
      .filter((w) => w.tasks > 0 || w.capacity != null);
    const overCap = new Set(
      workload
        .filter((w) => w.capacity != null && w.hours > w.capacity)
        .map((w) => w.id),
    );

    const crit = criticalPath(mTasks);
    const favSet = new Set(favorites.map((f) => f.projectId));
    const memberMap = new Map<
      string,
      Array<{ personId: string; roleLabel: string; allocationPct: number }>
    >();
    members.forEach((m) =>
      memberMap.set(m.projectId, [
        ...(memberMap.get(m.projectId) ?? []),
        {
          personId: m.businessUserId,
          roleLabel: m.roleLabel,
          allocationPct: m.allocationPct,
        },
      ]),
    );
    const peopleName = new Map(people.map((p) => [p.id, p.name]));
    const canFin = acc.can['View financials'];

    let projectRows: ProjectRow[] = projects.map((p) => {
      const pt = mTasks.filter((t) => t.projectId === p.id);
      const pm = mMilestones.filter((m) => m.projectId === p.id);
      const statusCat = statusCategory(cfg.statuses, p.status);
      const progress = progressOf(pt, statusCat);
      const cons = consumed.get(p.id) ?? 0;
      const involvedIds = new Set(
        [
          p.managerId,
          ...pt.map((t) => t.assigneeId),
          ...(memberMap.get(p.id) ?? []).map((m) => m.personId),
        ].filter(Boolean) as string[],
      );
      const project: MProject = {
        id: p.id,
        name: p.name,
        status: p.status,
        startDate: isoDay(p.startDate),
        dueDate: isoDay(p.dueDate),
        budget: p.budget == null ? null : Number(p.budget),
        managerId: p.managerId,
      };
      const h = healthOf({
        project,
        statusCat,
        tasks: pt,
        milestones: pm,
        taskMap,
        approvals: apprRows.filter((a) => a.projectId === p.id),
        consumed: cons,
        progress,
        overCapacity: [...involvedIds]
          .filter((id) => overCap.has(id))
          .map((id) => peopleName.get(id) ?? ''),
        capacityKnown,
        today,
      });
      const next = pm
        .filter((m) => m.status !== 'Completed' && m.status !== 'Cancelled')
        .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))[0];
      const c = p.customerId ? custMap.get(p.customerId) : undefined;
      return {
        id: p.id,
        businessId: p.businessId,
        number: p.number,
        name: p.name,
        customerId: p.customerId,
        customerName: c?.name ?? null,
        customerContact: c ? (c.email ?? c.phone) : null,
        managerId: p.managerId,
        type: p.type,
        status: p.status,
        statusCat,
        priority: p.priority,
        visibility: p.visibility,
        health: h.health,
        healthWhy: canFin
          ? h.why
          : h.why.replace(/, \d+% of budget used at \d+% progress/, ''),
        dims: h.dims.map((d) =>
          d.dim === 'Budget' && !canFin ? { dim: 'Budget', v: 'No Data' } : d,
        ),
        progress,
        startDate: project.startDate,
        dueDate: project.dueDate,
        dueLocked: p.dueLocked,
        baselineDueDate: isoDay(p.baselineDueDate),
        taskCount: pt.length,
        openCount: pt.filter(isOpenTask).length,
        doneCount: pt.filter((t) => t.status === 'Done').length,
        overdueCount: pt.filter((t) => isOverdue(t, today)).length,
        blockedCount: pt.filter(isBlocked).length,
        nextMilestone: next
          ? { id: next.id, name: next.name, date: next.plannedDate }
          : null,
        budget: canFin ? project.budget : null,
        consumed: canFin ? Math.round(cons * 100) / 100 : null,
        billingType: p.billingType,
        description: p.description,
        objective: p.objective,
        deliverables: p.deliverables,
        exclusions: p.exclusions,
        requireClientApproval: p.requireClientApproval,
        lastActivityAt: p.lastActivityAt.toISOString(),
        completedAt: p.completedAt?.toISOString() ?? null,
        archivedAt: p.archivedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        favorite: favSet.has(p.id),
        members: memberMap.get(p.id) ?? [],
        customFields: (p.customFields ?? {}) as Record<string, unknown>,
        automationRefs: Array.isArray(p.automationRefs)
          ? (p.automationRefs as string[])
          : [],
        templateId: p.templateId,
        _involved: involvedIds,
        _createdById: p.createdById,
      };
    });

    projectRows = projectRows.filter((row) => {
      const r = row as ProjectRow & {
        _involved: Set<string>;
        _createdById: string | null;
      };
      const ok = ProjectsPermissionsService.canSeeProject(
        acc,
        {
          managerId: r.managerId,
          visibility: r.visibility,
          createdById: r._createdById,
        },
        !!acc.personId && r._involved.has(acc.personId),
        actor.sub,
      );
      delete (r as Partial<typeof r>)._involved;
      delete (r as Partial<typeof r>)._createdById;
      return ok;
    });
    const visible = new Set(projectRows.map((p) => p.id));

    const subCounts = new Map<string, { d: number; t: number }>();
    tasks.forEach((t) => {
      if (!t.parentTaskId || t.status === 'Cancelled') return;
      const s = subCounts.get(t.parentTaskId) ?? { d: 0, t: 0 };
      s.t++;
      if (t.status === 'Done') s.d++;
      subCounts.set(t.parentTaskId, s);
    });

    const taskRows: TaskRow[] = tasks
      .filter((t) => visible.has(t.projectId))
      .map((t) => ({
        id: t.id,
        number: t.number,
        projectId: t.projectId,
        parentTaskId: t.parentTaskId,
        title: t.title,
        description: t.description,
        assigneeId: t.assigneeId,
        priority: t.priority,
        status: t.status,
        startDate: isoDay(t.startDate),
        dueDate: isoDay(t.dueDate),
        baselineStart: isoDay(t.baselineStart),
        baselineDue: isoDay(t.baselineDue),
        estimateMins: t.estimateMins,
        loggedMins: logged.get(t.id) ?? 0,
        checklist: Array.isArray(t.checklist)
          ? (t.checklist as TaskRow['checklist'])
          : [],
        blocked: t.blocked,
        blockType: t.blockType,
        blockerNote: t.blockerNote,
        clientVisible: t.clientVisible,
        customFields: (t.customFields ?? {}) as Record<string, unknown>,
        deps: depMap.get(t.id) ?? [],
        subDone: subCounts.get(t.id)?.d ?? 0,
        subTotal: subCounts.get(t.id)?.t ?? 0,
        commentCount: commentCount.get(t.id) ?? 0,
        milestoneIds: taskMsMap.get(t.id) ?? [],
        critical: crit.has(t.id),
        createdById: t.createdById,
        completedAt: t.completedAt?.toISOString() ?? null,
      }));

    const milestoneRows: MilestoneRow[] = milestones
      .filter((m) => visible.has(m.projectId))
      .map((m) => {
        const mm = mMilestones.find((x) => x.id === m.id)!;
        const linkedAppr = apprRows
          .filter((a) => a.milestoneId === m.id)
          .sort(
            (a, b) =>
              (b.requestedAt?.getTime() ?? 0) - (a.requestedAt?.getTime() ?? 0),
          )[0];
        return {
          id: m.id,
          number: m.number,
          projectId: m.projectId,
          name: m.name,
          ownerId: m.ownerId,
          plannedDate: mm.plannedDate,
          actualDate: isoDay(m.actualDate),
          status: milestoneStatus(mm, taskMap, today),
          storedStatus: m.status,
          pct: milestonePct(mm, taskMap),
          description: m.description,
          approvalMode: m.approvalMode,
          approval: approvalLabel(m.approvalMode, linkedAppr?.status),
          taskIds: mm.taskIds,
        };
      });

    void businessId;
    return {
      today,
      weekStart,
      weekEnd,
      cfg,
      acc,
      people,
      projects: projectRows,
      tasks: taskRows,
      milestones: milestoneRows,
      workload,
      capacityKnown,
      mTasks,
      mMilestones,
      taskMap,
      approvals: apprRows,
    };
  }

  private async peopleFor(ids: string[]): Promise<Person[]> {
    const lists = await Promise.all(ids.map((id) => this.ctx.people(id)));
    return lists.flat();
  }
}

export function approvalLabel(mode: string, status?: string): string {
  if (mode === 'not_required') return 'Not required';
  if (status === 'Approved') return 'Approved';
  if (status === 'Rejected') return 'Rejected';
  if (status === 'Changes Requested') return 'Changes requested';
  if (status === 'Sent' || status === 'Viewed')
    return mode === 'client' ? 'Awaiting client' : 'Awaiting internal';
  return mode === 'client' ? 'Client approval needed' : 'Internal';
}

export function mondayOf(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const wd = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -wd);
}
