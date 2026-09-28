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
import {
  ProjectsLoaderService,
  ProjectRow,
  mondayOf,
} from './projects-loader.service';
import { ProjectsPermissionsService } from './projects-permissions.service';
import {
  BILLING_TYPES,
  PRIORITIES,
  PROJECT_ERRORS,
  PROJECT_TYPES,
  PROJECT_AUTOMATION_HOOKS,
} from './projects.constants';
import {
  isBlocked,
  isOpenTask,
  riskList,
  round1,
  statusCategory,
} from './projects-metrics';

export interface CreateProjectInput {
  name: string;
  customerId?: string | null;
  type?: string;
  description?: string;
  managerId?: string | null;
  team?: string[];
  startDate?: string | null;
  dueDate?: string | null;
  dueLocked?: boolean;
  objective?: string;
  deliverables?: string;
  exclusions?: string;
  budget?: number | null;
  billingType?: string;
  status?: string;
  priority?: string;
  templateId?: string | null;
  requireClientApproval?: boolean;
  automationRefs?: string[];
  visibility?: string;
}

export type UpdateProjectInput = Partial<CreateProjectInput> & {
  customFields?: Record<string, unknown>;
  confirmDueChange?: boolean;
};

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: ProjectsContextService,
    private readonly loader: ProjectsLoaderService,
    private readonly perms: ProjectsPermissionsService,
  ) {}

  // ── workspace (the shared read model most screens filter client-side) ────

  async workspace(actor: AuthenticatedUser, scope?: string) {
    const L = await this.loader.load(actor, scope);
    const business = await this.ctx.business();
    const personId = L.acc.personId;
    const [timer, customers, templates, roleRows, me] = await Promise.all([
      personId
        ? this.prisma.projectTimer.findUnique({
            where: {
              businessId_businessUserId: {
                businessId: this.ctx.businessId(),
                businessUserId: personId,
              },
            },
          })
        : null,
      this.prisma.customer.findMany({
        where: { businessId: this.ctx.businessId() },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
        take: 1000,
      }),
      this.prisma.projectTemplate.findMany({
        where: { businessId: this.ctx.businessId(), status: 'Published' },
        select: { id: true, name: true, category: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.projectRoleAssignment.findMany({
        where: { businessId: this.ctx.businessId() },
      }),
      this.ctx.actorName(actor),
    ]);
    const roleMap = new Map(roleRows.map((r) => [r.businessUserId, r.role]));
    const defaultRole = (r: string) =>
      r === 'owner' ? 'Owner' : r === 'manager' ? 'Project Manager' : 'Staff';
    return {
      today: L.today,
      weekStart: L.weekStart,
      currency: business.currency,
      businessId: this.ctx.businessId(),
      businessName: business.name,
      me: {
        userId: actor.sub,
        personId,
        name: me,
        role: L.acc.role,
        can: L.acc.can,
      },
      config: {
        statuses: L.cfg.statuses,
        fields: L.cfg.fields,
        defMgr: L.cfg.defMgr,
        defStatus: L.cfg.defStatus,
        defPri: L.cfg.defPri,
        defVis: L.cfg.defVis,
        defView: L.cfg.defView,
        defDays: L.cfg.defDays,
        portalOn: L.cfg.portalOn,
        types: PROJECT_TYPES,
        billing: BILLING_TYPES,
        priorities: PRIORITIES,
        hooks: PROJECT_AUTOMATION_HOOKS.map(([k, wf]) => ({ k, wf })),
        wipLimit: 5,
      },
      people: L.people
        .filter((p) => p.active)
        .map((p) => ({
          id: p.id,
          name: p.name,
          systemRole: p.role,
          projectRole:
            p.role === 'owner'
              ? 'Owner'
              : (roleMap.get(p.id) ?? defaultRole(p.role)),
          hasRate: p.hourlyRate != null,
          businessId: undefined,
        })),
      customers,
      templates,
      projects: L.projects,
      tasks: L.tasks,
      milestones: L.milestones,
      workload: L.workload.map((w) => ({
        ...w,
        hours: Math.round(w.hours * 10) / 10,
      })),
      capacityKnown: L.capacityKnown,
      timer: timer
        ? {
            projectId: timer.projectId,
            taskId: timer.taskId,
            startedAt: timer.startedAt.toISOString(),
          }
        : null,
    };
  }

  // ── overview ─────────────────────────────────────────────────────────────

  async overview(
    actor: AuthenticatedUser,
    period = 'This Month',
    scope?: string,
  ) {
    const L = await this.loader.load(actor, scope);
    const ids = await this.loader.scopeIds(actor, scope);
    const today = L.today;
    const [from, prevFrom, prevTo] = periodRange(period, today);
    const live = L.projects.filter(
      (p) => !p.archivedAt && p.status !== 'Archived',
    );
    const visible = new Set(live.map((p) => p.id));
    const activeCats = new Set(['In progress']);
    const isActiveNow = (p: ProjectRow) =>
      activeCats.has(p.statusCat) ||
      (p.statusCat === 'Paused' && p.status === 'Blocked');
    const active = live.filter(isActiveNow);
    // Active at the start of the period ≈ created before it and not completed/archived before it.
    const activeAtStart = live.filter(
      (p) =>
        isActiveNow(p) &&
        p.createdAt.slice(0, 10) < from &&
        (!p.completedAt || p.completedAt.slice(0, 10) >= from),
    ).length;
    const atRisk = live.filter(
      (p) => p.health === 'At Risk' || p.health === 'Critical',
    );
    const overdueNow = L.tasks.filter(
      (t) => isOpenTask(t) && t.dueDate && t.dueDate < today,
    ).length;
    const weekAgo = addDays(today, -7);
    const overdueWeekAgo = L.tasks.filter(
      (t) =>
        t.status !== 'Cancelled' &&
        t.dueDate &&
        t.dueDate < weekAgo &&
        (!t.completedAt || t.completedAt.slice(0, 10) >= weekAgo),
    ).length;
    const upMs = L.milestones.filter(
      (m) =>
        visible.has(m.projectId) &&
        m.status !== 'Completed' &&
        m.status !== 'Cancelled' &&
        m.plannedDate >= today &&
        m.plannedDate <= addDays(today, 14),
    );

    const entries = await this.prisma.projectTimeEntry.findMany({
      where: {
        businessId: { in: ids },
        status: 'approved',
        billable: true,
        date: { gte: new Date(prevFrom + 'T00:00:00Z') },
      },
      select: { minutes: true, date: true, projectId: true },
    });
    const inVisible = entries.filter((e) => visible.has(e.projectId));
    const billNow =
      inVisible
        .filter((e) => isoDay(e.date)! >= from)
        .reduce((a, e) => a + e.minutes, 0) / 60;
    const billPrev =
      inVisible
        .filter((e) => isoDay(e.date)! >= prevFrom && isoDay(e.date)! <= prevTo)
        .reduce((a, e) => a + e.minutes, 0) / 60;

    const util = L.workload.filter((w) => w.capacity != null);
    const utilHours = util.reduce((a, w) => a + w.hours, 0);
    const utilCap = util.reduce((a, w) => a + (w.capacity ?? 0), 0);
    const over = util.filter((w) => w.hours > (w.capacity ?? 0)).length;

    const canFin = L.acc.can['View financials'];
    const budgetRisk = live.filter(
      (p) =>
        p.budget != null &&
        p.budget > 0 &&
        p.statusCat !== 'Done' &&
        (p.consumed ?? 0) / p.budget > p.progress / 100 + 0.15,
    );
    const noBudget = live.filter(
      (p) =>
        p.budget == null && p.statusCat !== 'Done' && p.statusCat !== 'Closed',
    ).length;
    const completedNow = L.projects.filter(
      (p) => p.completedAt && p.completedAt.slice(0, 10) >= from,
    ).length;
    const completedPrev = L.projects.filter(
      (p) =>
        p.completedAt &&
        p.completedAt.slice(0, 10) >= prevFrom &&
        p.completedAt.slice(0, 10) <= prevTo,
    ).length;
    const hasHistory = L.projects.some(
      (p) => p.createdAt.slice(0, 10) < prevFrom,
    );

    const diff = (n: number, label: string) =>
      n === 0
        ? `No change vs ${label}`
        : `${n > 0 ? '+' : '−'}${Math.abs(n)} vs ${label}`;
    const prevLabel =
      {
        Today: 'yesterday',
        'This Week': 'last week',
        'This Month': 'last month',
        Quarter: 'last quarter',
      }[period] ?? 'last period';

    const kpis = [
      {
        label: 'Active Projects',
        value: String(active.length),
        cmp: hasHistory
          ? diff(active.length - activeAtStart, 'period start')
          : 'Insufficient history to compare',
        cmpTone: !hasHistory
          ? 'muted'
          : active.length >= activeAtStart
            ? 'good'
            : 'neutral',
        period,
        fresh: 'Live · from project records',
        go: 'projects',
        f: 'Active',
      },
      {
        label: 'Projects At Risk',
        value: String(atRisk.length),
        cmp: atRisk.length
          ? `${atRisk.length} require attention`
          : 'None need attention',
        cmpTone: atRisk.length ? 'bad' : 'good',
        period: 'Now',
        fresh: 'Live',
        go: 'projects',
        f: 'At Risk',
      },
      {
        label: 'Overdue Tasks',
        value: String(overdueNow),
        cmp: hasHistory
          ? diff(overdueNow - overdueWeekAgo, 'last week')
          : 'Insufficient history to compare',
        cmpTone: !hasHistory
          ? 'muted'
          : overdueNow <= overdueWeekAgo
            ? 'good'
            : 'bad',
        period: 'Now',
        fresh: 'Live',
        go: 'tasks',
        f: 'Overdue',
      },
      {
        label: 'Upcoming Milestones',
        value: String(upMs.length),
        cmp: 'Next 14 days',
        cmpTone: 'neutral',
        period: '14 days',
        fresh: 'Live',
        go: 'milestones',
        f: 'Upcoming',
      },
      util.length
        ? {
            label: 'Team Utilization',
            value: utilCap
              ? Math.round((utilHours / utilCap) * 100) + '%'
              : '0%',
            cmp: over
              ? `${over} ${over > 1 ? 'people' : 'person'} over capacity`
              : 'Nobody over capacity',
            cmpTone: over ? 'warn' : 'good',
            period: 'This week',
            fresh: 'Task estimates vs scheduled shifts',
            go: 'tasks',
            f: 'All Tasks',
          }
        : {
            label: 'Team Utilization',
            value: '—',
            cmp: 'Not tracked — no shifts scheduled this week',
            cmpTone: 'muted',
            period: 'This week',
            fresh: 'Needs shifts in Staff',
            go: 'tasks',
            f: 'All Tasks',
          },
      {
        label: 'Billable Hours',
        value: `${round1(billNow)} h`,
        cmp: billPrev
          ? `${billNow >= billPrev ? '+' : '−'}${Math.abs(Math.round(((billNow - billPrev) / billPrev) * 100))}% vs ${prevLabel}`
          : billNow
            ? `No approved hours ${prevLabel}`
            : 'No approved billable time yet',
        cmpTone: billNow >= billPrev ? 'good' : 'warn',
        period,
        fresh: 'Approved time only',
        go: 'time',
        f: '',
      },
      canFin
        ? {
            label: 'Budget At Risk',
            value: money(budgetRisk.reduce((a, p) => a + (p.budget ?? 0), 0)),
            cmp: noBudget
              ? `Partial data — ${noBudget} project${noBudget > 1 ? 's have' : ' has'} no budget`
              : `${budgetRisk.length} project${budgetRisk.length === 1 ? '' : 's'} spending ahead of progress`,
            cmpTone: noBudget ? 'warn' : budgetRisk.length ? 'bad' : 'good',
            period: 'Now',
            fresh: 'Approved time at snapshot rates',
            go: 'projects',
            f: 'At Risk',
            money: true,
          }
        : {
            label: 'Budget At Risk',
            value: '—',
            cmp: 'Needs “View financials” permission',
            cmpTone: 'muted',
            period: 'Now',
            fresh: 'Hidden for your project role',
            go: 'projects',
            f: 'At Risk',
          },
      {
        label:
          period === 'This Month'
            ? 'Completed This Month'
            : `Completed · ${period}`,
        value: String(completedNow),
        cmp: hasHistory
          ? diff(completedNow - completedPrev, prevLabel)
          : 'Insufficient history to compare',
        cmpTone: hasHistory ? 'neutral' : 'muted',
        period,
        fresh: 'Live',
        go: 'projects',
        f: 'Completed',
      },
    ];

    const healthSeg = [
      'Healthy',
      'Watch',
      'At Risk',
      'Critical',
      'No Data',
    ].map((h) => ({ label: h, n: live.filter((p) => p.health === h).length }));
    const risks = riskList({
      projects: live.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        startDate: p.startDate,
        dueDate: p.dueDate,
        budget: p.budget,
        managerId: p.managerId,
        progress: p.progress,
        consumed: p.consumed ?? 0,
        statusCat: p.statusCat,
      })),
      tasks: L.mTasks.filter((t) => visible.has(t.projectId)),
      milestones: L.mMilestones.filter((m) => visible.has(m.projectId)),
      taskMap: L.taskMap,
      workload: L.workload,
      today,
      canSeeFinancials: canFin,
    });
    const soon = live.filter(
      (p) =>
        L.milestones.some(
          (m) =>
            m.projectId === p.id &&
            m.status !== 'Completed' &&
            m.plannedDate >= today &&
            dayDiff(m.plannedDate, today) <= 7,
        ) && L.tasks.some((t) => t.projectId === p.id && isBlocked(t)),
    );
    const aiInsight = soon.length
      ? `${soon.length} project${soon.length > 1 ? 's have' : ' has'} a milestone due within 7 days and unresolved blockers.`
      : 'No project has a milestone due within 7 days with open blockers.';
    const aiEvidence = soon.length
      ? `Evidence: milestone dates and open blocked tasks on ${soon.map((p) => p.name).join(' and ')}. Confidence: high — counts come straight from task records.`
      : 'Evidence: every milestone due in the next 7 days was checked against open blocked tasks. Confidence: high — counts come straight from task records.';

    const people = new Map(L.people.map((p) => [p.id, p.name]));
    const upcoming = L.milestones
      .filter(
        (m) =>
          visible.has(m.projectId) &&
          m.status !== 'Completed' &&
          m.status !== 'Cancelled',
      )
      .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))
      .slice(0, 6)
      .map((m) => {
        const p = live.find((x) => x.id === m.projectId)!;
        return {
          id: m.id,
          name: m.name,
          projectName: p?.name ?? '—',
          projectHealth: p?.health ?? 'No Data',
          owner: people.get(m.ownerId ?? '') ?? 'Unassigned',
          date: m.plannedDate,
          status: m.status,
        };
      });

    const activity = await this.recentActivity(ids, visible, 7);
    return {
      today,
      generatedAt: new Date().toISOString(),
      kpis,
      projectCount: live.length,
      healthSeg,
      progress: live.map((p) => ({
        id: p.id,
        name: p.name,
        progress: p.progress,
        health: p.health,
      })),
      risks,
      aiInsight,
      aiEvidence,
      milestones: upcoming,
      workload: L.workload.map((w) => ({
        ...w,
        hours: Math.round(w.hours * 10) / 10,
      })),
      capacityKnown: L.capacityKnown,
      activity,
    };
  }

  async recentActivity(ids: string[], visible: Set<string>, take: number) {
    const rows = await this.prisma.projectActivity.findMany({
      where: { businessId: { in: ids }, event: { not: 'system.daily' } },
      orderBy: { createdAt: 'desc' },
      take: take * 4,
    });
    return rows
      .filter((r) => !r.projectId || visible.has(r.projectId))
      .slice(0, take)
      .map((r) => ({
        id: r.id,
        who: r.actorName,
        what: r.text,
        when: r.createdAt.toISOString(),
        ev: r.event,
        projectId: r.projectId,
        taskId: r.taskId,
      }));
  }

  // ── create / update ──────────────────────────────────────────────────────

  async create(actor: AuthenticatedUser, input: CreateProjectInput) {
    const acc = await this.perms.assert(actor, 'Create projects');
    const name = (input.name ?? '').trim();
    if (!name)
      throw new AppException(
        PROJECT_ERRORS.NAME_REQUIRED,
        'Project name is required.',
        HttpStatus.BAD_REQUEST,
      );
    const start = parseDay(input.startDate ?? null);
    const due = parseDay(input.dueDate ?? null);
    if (start && due && due < start)
      throw new AppException(
        PROJECT_ERRORS.DATES_INVALID,
        'End date must be after the start date.',
        HttpStatus.BAD_REQUEST,
      );
    if (input.budget != null && input.budget !== undefined)
      ProjectsPermissionsService.check(acc, 'Manage budgets');
    const cfg = await this.ctx.config();
    const status =
      input.status && cfg.statuses.some((s) => s.name === input.status)
        ? input.status
        : cfg.defStatus;
    await this.assertCustomer(input.customerId);
    const people = await this.ctx.people();
    const validPerson = (id?: string | null) =>
      id && people.some((p) => p.id === id && p.active) ? id : null;
    const managerId =
      validPerson(input.managerId) ?? validPerson(cfg.defMgr) ?? acc.personId;
    const team = [
      ...new Set(
        [managerId, ...(input.team ?? []).map(validPerson)].filter(
          Boolean,
        ) as string[],
      ),
    ];
    const template = input.templateId
      ? await this.prisma.projectTemplate.findFirst({
          where: {
            id: input.templateId,
            businessId: this.ctx.businessId(),
            status: 'Published',
          },
        })
      : null;
    const today = await this.ctx.today();

    const project = await this.prisma.$transaction(
      async (tx) => {
        const number = await this.ctx.nextNumber('project', tx);
        const p = await tx.project.create({
          data: {
            businessId: this.ctx.businessId(),
            number,
            name,
            customerId: input.customerId || null,
            managerId,
            type: PROJECT_TYPES.includes(input.type ?? '')
              ? input.type!
              : 'Client',
            status,
            priority: (PRIORITIES as readonly string[]).includes(
              input.priority ?? '',
            )
              ? input.priority!
              : cfg.defPri,
            visibility: ['Private', 'Team', 'Organization'].includes(
              input.visibility ?? '',
            )
              ? input.visibility!
              : cfg.defVis,
            description: input.description?.trim() || null,
            objective: input.objective?.trim() || null,
            deliverables: input.deliverables?.trim() || null,
            exclusions: input.exclusions?.trim() || null,
            startDate: start,
            dueDate: due,
            dueLocked: !!input.dueLocked,
            baselineDueDate:
              statusCategory(cfg.statuses, status) === 'In progress'
                ? due
                : null,
            budget:
              input.budget != null ? new Prisma.Decimal(input.budget) : null,
            billingType: BILLING_TYPES.includes(input.billingType ?? '')
              ? input.billingType!
              : 'Fixed',
            requireClientApproval: !!input.requireClientApproval,
            templateId: template?.id ?? null,
            automationRefs: (input.automationRefs ?? []).filter((k) =>
              PROJECT_AUTOMATION_HOOKS.some(([h]) => h === k),
            ),
            createdById: actor.sub,
          },
        });
        if (team.length) {
          await tx.projectMember.createMany({
            data: team.map((id) => ({
              businessId: this.ctx.businessId(),
              projectId: p.id,
              businessUserId: id,
              roleLabel: id === managerId ? 'Project Manager' : 'Team member',
            })),
          });
        }
        if (template)
          await this.applyTemplate(
            tx,
            p.id,
            template,
            start ? isoDay(start)! : today,
            managerId,
            cfg.defDays,
          );
        return p;
      },
      { timeout: 60000 },
    );
    await this.ctx.activity(
      actor,
      'project.created',
      `created ${project.name}${template ? ` from template ${template.name}` : ''}`,
      { projectId: project.id },
    );
    await this.ctx.auditLog(
      'project.created',
      'Project',
      project.id,
      undefined,
      { number: project.number, name: project.name, status },
    );
    return { id: project.id, number: project.number, status };
  }

  /** Phases → tasks (chained Finish-to-Start when the template says so) and milestones at phase ends. */
  private async applyTemplate(
    tx: Prisma.TransactionClient,
    projectId: string,
    t: {
      phases: Prisma.JsonValue;
      milestones: Prisma.JsonValue;
      chain: boolean;
      taskChain: boolean;
    },
    startIso: string,
    ownerId: string | null,
    workingDays: string,
  ) {
    const phases = (Array.isArray(t.phases) ? t.phases : []) as Array<{
      name: string;
      days: number;
      tasks: string[];
    }>;
    const msNames = (
      Array.isArray(t.milestones) ? t.milestones : []
    ) as string[];
    let cursor = startIso;
    let prevPhaseLast: string | null = null;
    const phaseEnds: Array<{ end: string; taskIds: string[] }> = [];
    let order = 0;
    for (const ph of phases) {
      const days = Math.max(1, Number(ph.days) || 5);
      const phStart = cursor;
      const phEnd = addWorkingDays(phStart, days - 1, workingDays);
      const list = (ph.tasks ?? []).filter(Boolean);
      const ids: string[] = [];
      let prevTask: string | null = null;
      for (let i = 0; i < list.length; i++) {
        const [title, ...subs] = String(list[i])
          .split('>')
          .map((x) => x.trim());
        const s = addDays(
          phStart,
          Math.floor((i * dayDiff(phEnd, phStart)) / Math.max(list.length, 1)),
        );
        const d = addDays(
          phStart,
          Math.max(
            Math.floor(
              ((i + 1) * dayDiff(phEnd, phStart)) / Math.max(list.length, 1),
            ),
            dayDiff(s, phStart),
          ),
        );
        const number = await this.ctx.nextNumber('taskSeq', tx);
        const task = await tx.projectTask.create({
          data: {
            businessId: this.ctx.businessId(),
            number,
            projectId,
            title: title.slice(0, 255),
            description: `${ph.name} phase · from template.`,
            assigneeId: ownerId,
            status: 'To Do',
            startDate: parseDay(s),
            dueDate: parseDay(d),
            baselineStart: parseDay(s),
            baselineDue: parseDay(d),
            sortOrder: order++,
          },
        });
        for (const sub of subs.filter(Boolean)) {
          const sn = await this.ctx.nextNumber('taskSeq', tx);
          await tx.projectTask.create({
            data: {
              businessId: this.ctx.businessId(),
              number: sn,
              projectId,
              parentTaskId: task.id,
              title: sub.slice(0, 255),
              assigneeId: ownerId,
              status: 'To Do',
              dueDate: parseDay(d),
              sortOrder: order++,
            },
          });
        }
        const dep = t.taskChain
          ? prevTask
          : i === 0 && t.chain
            ? prevPhaseLast
            : null;
        if (dep)
          await tx.projectTaskDependency.create({
            data: {
              businessId: this.ctx.businessId(),
              taskId: task.id,
              dependsOnTaskId: dep,
            },
          });
        prevTask = task.id;
        ids.push(task.id);
      }
      if (t.chain && ids.length) prevPhaseLast = ids[ids.length - 1];
      phaseEnds.push({ end: phEnd, taskIds: ids });
      cursor = addWorkingDays(phEnd, 1, workingDays);
    }
    for (let i = 0; i < msNames.length; i++) {
      const at = phaseEnds.length
        ? phaseEnds[
            Math.min(
              phaseEnds.length - 1,
              Math.round(((i + 1) * phaseEnds.length) / msNames.length) - 1,
            )
          ]
        : { end: startIso, taskIds: [] };
      const number = await this.ctx.nextNumber('msSeq', tx);
      const ms = await tx.projectMilestone.create({
        data: {
          businessId: this.ctx.businessId(),
          number,
          projectId,
          name: String(msNames[i]).slice(0, 191),
          ownerId,
          plannedDate: parseDay(at.end)!,
          description: 'Created from template.',
        },
      });
      if (at.taskIds.length)
        await tx.projectMilestoneTask.createMany({
          data: at.taskIds.map((taskId) => ({
            businessId: this.ctx.businessId(),
            milestoneId: ms.id,
            taskId,
          })),
        });
    }
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateProjectInput,
  ) {
    const acc = await this.perms.assert(actor, 'Edit projects');
    const p = await this.loader.project(id);
    const cfg = await this.ctx.config();
    const data: Prisma.ProjectUpdateInput = {};
    if (input.name !== undefined) {
      if (!input.name.trim())
        throw new AppException(
          PROJECT_ERRORS.NAME_REQUIRED,
          'Project name is required.',
          HttpStatus.BAD_REQUEST,
        );
      data.name = input.name.trim();
    }
    if (input.customerId !== undefined) {
      await this.assertCustomer(input.customerId);
      data.customerId = input.customerId || null;
    }
    if (input.managerId !== undefined) data.managerId = input.managerId || null;
    if (input.type !== undefined && PROJECT_TYPES.includes(input.type))
      data.type = input.type;
    if (
      input.priority !== undefined &&
      (PRIORITIES as readonly string[]).includes(input.priority)
    )
      data.priority = input.priority;
    if (
      input.visibility !== undefined &&
      ['Private', 'Team', 'Organization'].includes(input.visibility)
    )
      data.visibility = input.visibility;
    for (const k of [
      'description',
      'objective',
      'deliverables',
      'exclusions',
    ] as const)
      if (input[k] !== undefined) data[k] = input[k]?.trim() || null;
    if (
      input.billingType !== undefined &&
      BILLING_TYPES.includes(input.billingType)
    )
      data.billingType = input.billingType;
    if (input.requireClientApproval !== undefined)
      data.requireClientApproval = !!input.requireClientApproval;
    if (input.dueLocked !== undefined) data.dueLocked = !!input.dueLocked;
    if (input.customFields !== undefined) {
      const allowed = new Set(
        cfg.fields.filter((f) => f.applies === 'Project').map((f) => f.name),
      );
      data.customFields = Object.fromEntries(
        Object.entries(input.customFields).filter(([k]) => allowed.has(k)),
      ) as Prisma.InputJsonValue;
    }
    if (input.budget !== undefined) {
      ProjectsPermissionsService.check(acc, 'Manage budgets');
      if (
        input.budget != null &&
        (isNaN(Number(input.budget)) || Number(input.budget) < 0)
      )
        throw new AppException(
          PROJECT_ERRORS.INVALID,
          'Budget must be a positive amount.',
          HttpStatus.BAD_REQUEST,
        );
      data.budget =
        input.budget == null ? null : new Prisma.Decimal(input.budget);
    }
    const start =
      input.startDate !== undefined ? parseDay(input.startDate) : p.startDate;
    const due =
      input.dueDate !== undefined ? parseDay(input.dueDate) : p.dueDate;
    if (start && due && due < start)
      throw new AppException(
        PROJECT_ERRORS.DATES_INVALID,
        'End date must be after the start date.',
        HttpStatus.BAD_REQUEST,
      );
    if (
      input.dueDate !== undefined &&
      isoDay(due) !== isoDay(p.dueDate) &&
      p.dueLocked &&
      !input.confirmDueChange
    ) {
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'This deadline is locked — confirm the change to move it.',
        HttpStatus.CONFLICT,
      );
    }
    if (input.startDate !== undefined) data.startDate = start;
    if (input.dueDate !== undefined) data.dueDate = due;
    if (input.status !== undefined && input.status !== p.status) {
      if (!cfg.statuses.some((s) => s.name === input.status))
        throw new AppException(
          PROJECT_ERRORS.INVALID,
          `Unknown status “${input.status}”.`,
          HttpStatus.BAD_REQUEST,
        );
      Object.assign(
        data,
        this.statusSideEffects(cfg.statuses, input.status, p),
      );
    }
    const updated = await this.ctx.db.project.update({ where: { id }, data });
    if (input.status !== undefined && input.status !== p.status) {
      await this.ctx.activity(
        actor,
        'status.changed',
        `changed ${p.name} to ${input.status}`,
        { projectId: id },
      );
      await this.notifyTeam(
        p.id,
        'Project status changed',
        {
          title: `${p.name}: ${input.status}`,
          body: `Status changed from ${p.status} to ${input.status}.`,
          link: `/projects/${p.id}`,
        },
        actor.sub,
      );
    } else {
      await this.ctx.activity(actor, 'project.updated', `updated ${p.name}`, {
        projectId: id,
      });
    }
    if (input.dueDate !== undefined && isoDay(due) !== isoDay(p.dueDate)) {
      await this.notifyTeam(
        p.id,
        'Deadline changed',
        {
          title: `${p.name}: deadline moved`,
          body: `Due date is now ${isoDay(due) ?? 'not set'}.`,
          link: `/projects/${p.id}`,
        },
        actor.sub,
      );
    }
    await this.ctx.auditLog(
      'project.updated',
      'Project',
      id,
      pick(p, Object.keys(data)),
      pick(updated, Object.keys(data)),
    );
    return { ok: true };
  }

  private statusSideEffects(
    statuses: { name: string; cat: string }[],
    status: string,
    p: {
      dueDate: Date | null;
      baselineDueDate: Date | null;
      completedAt: Date | null;
    },
  ) {
    const cat = statusCategory(statuses as never, status);
    const out: Prisma.ProjectUpdateInput = { status };
    if (cat === 'In progress' && !p.baselineDueDate && p.dueDate)
      out.baselineDueDate = p.dueDate;
    if (cat === 'Done') out.completedAt = p.completedAt ?? new Date();
    else out.completedAt = null;
    if (status === 'Archived') out.archivedAt = new Date();
    else out.archivedAt = null;
    return out;
  }

  async notifyTeam(
    projectId: string,
    key: Parameters<ProjectsContextService['notifyPerson']>[1],
    input: { title: string; body: string; link?: string },
    exceptUserId?: string,
  ) {
    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: { businessUserId: true },
    });
    const p = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { managerId: true },
    });
    const ids = new Set(
      [p?.managerId, ...members.map((m) => m.businessUserId)].filter(
        Boolean,
      ) as string[],
    );
    for (const id of ids)
      await this.ctx.notifyPerson(id, key, input, exceptUserId);
  }

  async setMembers(
    actor: AuthenticatedUser,
    id: string,
    members: Array<{
      personId: string;
      roleLabel?: string;
      allocationPct?: number;
    }>,
  ) {
    await this.perms.assert(actor, 'Edit projects');
    const p = await this.loader.project(id);
    const people = await this.ctx.people();
    const valid = members.filter((m) =>
      people.some((x) => x.id === m.personId),
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({ where: { projectId: id } });
      if (valid.length) {
        await tx.projectMember.createMany({
          data: valid.map((m) => ({
            businessId: this.ctx.businessId(),
            projectId: id,
            businessUserId: m.personId,
            roleLabel: (
              m.roleLabel ||
              (m.personId === p.managerId ? 'Project Manager' : 'Team member')
            ).slice(0, 60),
            allocationPct: Math.max(
              0,
              Math.min(100, Math.round(m.allocationPct ?? 0)),
            ),
          })),
        });
      }
    });
    await this.ctx.activity(
      actor,
      'project.updated',
      `updated the team on ${p.name}`,
      { projectId: id },
    );
    return { ok: true };
  }

  async bulk(
    actor: AuthenticatedUser,
    ids: string[],
    action: 'status' | 'archive',
    status?: string,
  ) {
    await this.perms.assert(
      actor,
      action === 'archive' ? 'Archive projects' : 'Edit projects',
    );
    const cfg = await this.ctx.config();
    if (action === 'status' && !cfg.statuses.some((s) => s.name === status))
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Pick a valid status.',
        HttpStatus.BAD_REQUEST,
      );
    const target = action === 'archive' ? 'Archived' : status!;
    let n = 0;
    for (const id of ids) {
      const p = await this.loader.project(id);
      if (p.status === target) continue;
      await this.ctx.db.project.update({
        where: { id },
        data: this.statusSideEffects(cfg.statuses, target, p),
      });
      await this.ctx.activity(
        actor,
        'status.changed',
        `changed ${p.name} to ${target}`,
        { projectId: id },
      );
      await this.ctx.auditLog(
        'project.status_changed',
        'Project',
        id,
        { status: p.status },
        { status: target },
      );
      n++;
    }
    return { updated: n };
  }

  async toggleFavorite(actor: AuthenticatedUser, id: string) {
    await this.loader.project(id);
    const existing = await this.ctx.db.projectFavorite.findUnique({
      where: { projectId_userId: { projectId: id, userId: actor.sub } },
    });
    if (existing)
      await this.ctx.db.projectFavorite.delete({ where: { id: existing.id } });
    else
      await this.ctx.db.projectFavorite.create({
        data: {
          businessId: this.ctx.businessId(),
          projectId: id,
          userId: actor.sub,
        },
      });
    return { favorite: !existing };
  }

  /** What stands between this project and "Completed" — shown before anything changes. */
  async readiness(actor: AuthenticatedUser, id: string) {
    const p = await this.loader.project(id);
    const [open, blocked, openMs, timers, pendingClient] = await Promise.all([
      this.prisma.projectTask.count({
        where: { projectId: id, status: { notIn: ['Done', 'Cancelled'] } },
      }),
      this.prisma.projectTask.count({
        where: {
          projectId: id,
          status: { notIn: ['Done', 'Cancelled'] },
          OR: [{ blocked: true }, { status: 'Blocked' }],
        },
      }),
      this.prisma.projectMilestone.findMany({
        where: { projectId: id, status: { notIn: ['Completed', 'Cancelled'] } },
        select: { name: true },
      }),
      this.prisma.projectTimer.count({ where: { projectId: id } }),
      p.requireClientApproval
        ? this.prisma.projectApproval.count({
            where: {
              projectId: id,
              type: 'Project Completion',
              status: 'Approved',
            },
          })
        : Promise.resolve(1),
    ]);
    const items: string[] = [];
    if (open) items.push(`${open} task${open > 1 ? 's' : ''} not done`);
    if (blocked)
      items.push(`${blocked} unresolved blocker${blocked > 1 ? 's' : ''}`);
    openMs.forEach((m) => items.push(`Milestone “${m.name}” not complete`));
    if (timers)
      items.push(
        timers > 1
          ? `${timers} timers are still running`
          : 'A timer is still running',
      );
    if (!pendingClient)
      items.push('Client approval of project completion has not been given');
    return { ready: !items.length, items, name: p.name };
  }

  async complete(actor: AuthenticatedUser, id: string) {
    await this.perms.assert(actor, 'Edit projects');
    const r = await this.readiness(actor, id);
    if (!r.ready)
      throw new AppException(
        PROJECT_ERRORS.NOT_READY,
        `This project isn’t ready to complete: ${r.items.join('; ')}.`,
        HttpStatus.CONFLICT,
      );
    const cfg = await this.ctx.config();
    const doneStatus =
      cfg.statuses.find((s) => s.cat === 'Done')?.name ?? 'Completed';
    await this.ctx.db.project.update({
      where: { id },
      data: { status: doneStatus, completedAt: new Date() },
    });
    await this.ctx.activity(actor, 'project.completed', `completed ${r.name}`, {
      projectId: id,
    });
    await this.ctx.auditLog('project.completed', 'Project', id, undefined, {
      status: doneStatus,
    });
    return { ok: true };
  }

  async remove(actor: AuthenticatedUser, id: string) {
    await this.perms.assert(actor, 'Archive projects');
    const p = await this.loader.project(id);
    const cfg = await this.ctx.config();
    if (cfg.noHardDelete) {
      const [time, appr, portal] = await Promise.all([
        this.prisma.projectTimeEntry.count({ where: { projectId: id } }),
        this.prisma.projectApproval.count({
          where: { projectId: id, status: { not: 'Draft' } },
        }),
        this.prisma.projectPortalAccess.count({ where: { projectId: id } }),
      ]);
      if (time || appr || portal || p.budget != null) {
        throw new AppException(
          PROJECT_ERRORS.DELETE_BLOCKED,
          'This project has financial references, approvals or client history, so it can only be archived.',
          HttpStatus.CONFLICT,
        );
      }
    }
    await this.ctx.db.project.delete({ where: { id } });
    await this.ctx.auditLog('project.deleted', 'Project', id, {
      number: p.number,
      name: p.name,
    });
    return { ok: true };
  }

  // ── saved views ──────────────────────────────────────────────────────────

  async savedViews(actor: AuthenticatedUser) {
    const rows = await this.ctx.db.projectSavedView.findMany({
      where: {
        OR: [
          { userId: actor.sub },
          { visibility: { in: ['Team', 'Organization'] } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      visibility: r.visibility,
      filters: r.filters,
      mine: r.userId === actor.sub,
    }));
  }

  async saveView(
    actor: AuthenticatedUser,
    name: string,
    visibility: string,
    filters: Record<string, unknown>,
  ) {
    if (!name?.trim())
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'Name the view.',
        HttpStatus.BAD_REQUEST,
      );
    const row = await this.ctx.db.projectSavedView.create({
      data: {
        businessId: this.ctx.businessId(),
        userId: actor.sub,
        name: name.trim().slice(0, 80),
        visibility: ['Private', 'Team', 'Organization'].includes(visibility)
          ? visibility
          : 'Private',
        filters: filters as Prisma.InputJsonValue,
      },
    });
    return { id: row.id };
  }

  async deleteView(actor: AuthenticatedUser, id: string) {
    const row = await this.ctx.db.projectSavedView.findFirst({ where: { id } });
    if (!row)
      throw new AppException(
        PROJECT_ERRORS.NOT_FOUND,
        'View not found',
        HttpStatus.NOT_FOUND,
      );
    if (row.userId !== actor.sub)
      await this.perms.assert(actor, 'Manage settings');
    await this.ctx.db.projectSavedView.delete({ where: { id } });
    return { ok: true };
  }

  // ── export ───────────────────────────────────────────────────────────────

  async exportCsv(
    actor: AuthenticatedUser,
    ids: string[] | null,
    scope?: string,
  ) {
    await this.perms.assert(actor, 'Export');
    const L = await this.loader.load(actor, scope);
    const people = new Map(L.people.map((p) => [p.id, p.name]));
    const rows = L.projects.filter((p) => !ids || ids.includes(p.id));
    const head = [
      'Project ID',
      'Name',
      'Customer',
      'Manager',
      'Status',
      'Health',
      'Progress',
      'Due',
    ];
    const body = rows.map((r) => [
      r.number,
      r.name,
      r.customerName ?? 'Internal',
      people.get(r.managerId ?? '') ?? '',
      r.status,
      r.health,
      r.progress + '%',
      r.dueDate ?? '',
    ]);
    return {
      filename: 'projects.csv',
      csv: toCsv(head, body),
      count: rows.length,
    };
  }

  private async assertCustomer(id?: string | null) {
    if (!id) return;
    const c = await this.prisma.customer.findFirst({
      where: { id, businessId: this.ctx.businessId() },
      select: { id: true },
    });
    if (!c)
      throw new AppException(
        PROJECT_ERRORS.INVALID,
        'That customer is not in this business.',
        HttpStatus.BAD_REQUEST,
      );
  }
}

export function toCsv(
  head: string[],
  rows: Array<Array<string | number>>,
): string {
  const q = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [head.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join(
    '\n',
  );
}

export function money(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function pick(o: object, keys: string[]) {
  const src = o as Record<string, unknown>;
  return Object.fromEntries(
    keys.map((k) => [
      k,
      src[k] instanceof Prisma.Decimal ? Number(src[k]) : src[k],
    ]),
  );
}

/** [from, prevFrom, prevTo] for the overview period switcher. */
export function periodRange(
  period: string,
  today: string,
): [string, string, string] {
  if (period === 'Today')
    return [today, addDays(today, -1), addDays(today, -1)];
  if (period === 'This Week') {
    const m = mondayOf(today);
    return [m, addDays(m, -7), addDays(m, -1)];
  }
  if (period === 'Quarter') {
    const y = +today.slice(0, 4);
    const q = Math.floor((+today.slice(5, 7) - 1) / 3);
    const from = `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`;
    const pq = q === 0 ? 3 : q - 1;
    const py = q === 0 ? y - 1 : y;
    return [
      from,
      `${py}-${String(pq * 3 + 1).padStart(2, '0')}-01`,
      addDays(from, -1),
    ];
  }
  const from = today.slice(0, 8) + '01';
  const prevTo = addDays(from, -1);
  return [from, prevTo.slice(0, 8) + '01', prevTo];
}

/** Adds n working days (Mon–Fri / Mon–Sat / every day, from project settings). */
export function addWorkingDays(
  iso: string,
  n: number,
  workingDays: string,
): string {
  if (workingDays === 'Every day' || n <= 0)
    return addDays(iso, Math.max(n, 0));
  const off = workingDays === 'Mon–Sat' ? [0] : [0, 6];
  let d = iso;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (!off.includes(new Date(d + 'T00:00:00Z').getUTCDay())) left--;
  }
  return d;
}
