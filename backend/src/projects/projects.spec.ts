import { ClsService } from 'nestjs-cls';
import { Role } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { AuditService } from '../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import type { AiInfraService } from '../ai/ai-infra.service';
import type { S3Service } from '../common/storage/s3.service';
import type { EmailService } from '../messaging/channels/email.service';
import type { InboxAutomationService } from '../unified-inbox/inbox-automation.service';
import {
  ProjectsContextService,
  addDays,
  todayIn,
} from './projects-context.service';
import { ProjectsPermissionsService } from './projects-permissions.service';
import { ProjectsLoaderService } from './projects-loader.service';
import { ProjectsService } from './projects.service';
import { ProjectTasksService } from './project-tasks.service';
import { ProjectMilestonesService } from './project-milestones.service';
import { ProjectTimeService } from './project-time.service';
import { ProjectApprovalsService } from './project-approvals.service';
import { ProjectPortalService } from './project-portal.service';
import { ProjectSettingsService } from './project-settings.service';
import { ProjectAiService } from './project-ai.service';
import { ProjectReportsService } from './project-reports.service';
import { ProjectsDailyProcessor } from './projects-daily.processor';
import { ProjectHooksService } from './project-hooks.service';
import type { ReviewRequestsService } from '../reviews/review-requests.service';
import {
  criticalPath,
  healthOf,
  progressOf,
  wouldCycle,
} from './projects-metrics';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const codeOf = (e: unknown) =>
  ((e as { getResponse?: () => { code?: string } }).getResponse?.() ?? {}).code;
async function expectCode(p: Promise<unknown>, code: string) {
  let caught: unknown = null;
  try {
    await p;
  } catch (e) {
    caught = e;
  }
  expect(caught).not.toBeNull();
  expect(codeOf(caught)).toBe(code);
}

describe('Projects & Tasks (real DB)', () => {
  let prisma: PrismaService;
  let cls: FakeClsService;
  let businessId: string;
  let ownerUserId: string;
  let staffUserId: string;
  let ownerBu: string;
  let staffBu: string;
  let customerId: string;
  let owner: AuthenticatedUser;
  let staff: AuthenticatedUser;
  let ctx: ProjectsContextService;
  let projects: ProjectsService;
  let tasks: ProjectTasksService;
  let milestones: ProjectMilestonesService;
  let time: ProjectTimeService;
  let approvals: ProjectApprovalsService;
  let portal: ProjectPortalService;
  let settings: ProjectSettingsService;
  let ai: ProjectAiService;
  let reports: ProjectReportsService;
  let loader: ProjectsLoaderService;
  let daily: ProjectsDailyProcessor;
  let hooks: ProjectHooksService;
  const reviewsMock = { create: jest.fn(() => Promise.resolve({ id: 'r1' })) };
  const email = { send: jest.fn(() => Promise.resolve({ providerRef: 'x' })) };
  const inbox = { ingest: jest.fn(() => Promise.resolve(null)) };
  const aiInfra = {
    createMessage: jest.fn(() =>
      Promise.reject(new Error('ANTHROPIC_API_KEY is not configured')),
    ),
  };
  let today: string;

  const as = (u: AuthenticatedUser) => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, u.sub);
    return u;
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const stamp = Date.now();
    const business = await prisma.business.create({
      data: {
        name: 'Projects Test Biz',
        slug: `projects-test-${stamp}`,
        currency: 'USD',
        timezone: 'UTC',
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const o = await prisma.user.create({
      data: {
        name: 'Pat Owner',
        email: `proj-owner-${stamp}@example.com`,
        passwordHash: 'x',
      },
    });
    const s = await prisma.user.create({
      data: {
        name: 'Sam Staff',
        email: `proj-staff-${stamp}@example.com`,
        passwordHash: 'x',
      },
    });
    ownerUserId = o.id;
    staffUserId = s.id;
    ownerBu = (
      await prisma.businessUser.create({
        data: {
          businessId,
          userId: ownerUserId,
          role: Role.owner,
          hourlyRate: 80,
        },
      })
    ).id;
    staffBu = (
      await prisma.businessUser.create({
        data: {
          businessId,
          userId: staffUserId,
          role: Role.staff,
          hourlyRate: 50,
        },
      })
    ).id;
    customerId = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Luna Client',
          phone: `+1555${String(stamp).slice(-7)}`,
        },
      })
    ).id;
    owner = {
      sub: ownerUserId,
      businessId,
      role: Role.owner,
      capabilities: [],
    };
    staff = {
      sub: staffUserId,
      businessId,
      role: Role.staff,
      capabilities: [],
    };
    today = todayIn('UTC');

    const audit = new AuditService(tenant, cls as unknown as ClsService);
    const notifications = new NotificationsService(tenant);
    ctx = new ProjectsContextService(
      prisma,
      tenant,
      cls as unknown as ClsService,
      audit,
      notifications,
    );
    const perms = new ProjectsPermissionsService(prisma, ctx);
    loader = new ProjectsLoaderService(prisma, ctx, perms);
    hooks = new ProjectHooksService(
      prisma,
      ctx,
      reviewsMock as unknown as ReviewRequestsService,
    );
    projects = new ProjectsService(
      prisma,
      ctx,
      loader,
      perms,
      hooks,
      aiInfra as unknown as AiInfraService,
    );
    tasks = new ProjectTasksService(prisma, ctx, loader, perms);
    milestones = new ProjectMilestonesService(
      prisma,
      ctx,
      loader,
      perms,
      hooks,
    );
    time = new ProjectTimeService(prisma, ctx, loader, perms);
    const config = {
      get: (k: string) => ({ FRONTEND_URL: 'http://localhost:3000' })[k],
    } as unknown as ConfigService;
    portal = new ProjectPortalService(
      prisma,
      ctx,
      loader,
      perms,
      {} as S3Service,
      email as unknown as EmailService,
      inbox as unknown as InboxAutomationService,
      config,
    );
    approvals = new ProjectApprovalsService(prisma, ctx, loader, perms, portal);
    settings = new ProjectSettingsService(prisma, ctx, perms);
    ai = new ProjectAiService(
      aiInfra as unknown as AiInfraService,
      ctx,
      loader,
      perms,
    );
    reports = new ProjectReportsService(prisma, ctx, loader, perms);
    daily = new ProjectsDailyProcessor(prisma, ctx, hooks);
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      for (const t of [
        'project_activities',
        'project_comments',
        'project_timers',
        'project_saved_views',
        'project_saved_reports',
        'project_settings',
        'project_role_assignments',
        'project_notify_prefs',
        'project_templates',
      ]) {
        await tx.$executeRawUnsafe(
          `DELETE FROM ${t} WHERE business_id = ?`,
          businessId,
        );
      }
      await tx.project.deleteMany({ where: { businessId } });
      await tx.notification.deleteMany({ where: { businessId } });
      await tx
        .$executeRawUnsafe(
          'DELETE FROM audit_logs WHERE business_id = ?',
          businessId,
        )
        .catch(() => undefined);
      await tx.customer.deleteMany({ where: { businessId } });
      await tx.businessUser.deleteMany({ where: { businessId } });
      await tx.user.deleteMany({
        where: { id: { in: [ownerUserId, staffUserId] } },
      });
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('allocates unique, sequential project numbers even when created concurrently', async () => {
    as(owner);
    const [a, b] = await Promise.all([
      projects.create(owner, { name: 'Alpha' }),
      projects.create(owner, { name: 'Beta' }),
    ]);
    expect(a.number).not.toBe(b.number);
    const nums = [a.number, b.number].sort();
    expect(nums[0]).toBe(`PRJ-${today.slice(0, 4)}-00001`);
    expect(nums[1]).toBe(`PRJ-${today.slice(0, 4)}-00002`);
  });

  it('rejects a project without a name or with an end before its start', async () => {
    as(owner);
    await expectCode(
      projects.create(owner, { name: '  ' }),
      'PROJECT_NAME_REQUIRED',
    );
    await expectCode(
      projects.create(owner, {
        name: 'X',
        startDate: '2026-10-10',
        dueDate: '2026-10-01',
      }),
      'PROJECT_DATES_INVALID',
    );
  });

  it('enforces the project-role matrix: Staff cannot create projects or approve time', async () => {
    as(staff);
    await expectCode(
      projects.create(staff, { name: 'Nope' }),
      'PROJECT_FORBIDDEN',
    );
  });

  it('blocks Done while required checklist items or dependencies are open, and detects cycles', async () => {
    as(owner);
    const p = await projects.create(owner, { name: 'Rules', status: 'Active' });
    const a = await tasks.create(owner, {
      projectId: p.id,
      title: 'A',
      dueDate: addDays(today, 2),
      checklist: [{ t: 'QA', done: false, req: true }],
    });
    const b = await tasks.create(owner, {
      projectId: p.id,
      title: 'B',
      dueDate: addDays(today, 4),
    });
    await expectCode(
      tasks.setStatus(owner, a.id, 'Done'),
      'PROJECT_TASK_CHECKLIST_INCOMPLETE',
    );
    await tasks.addDependency(owner, b.id, a.id);
    await expectCode(
      tasks.addDependency(owner, a.id, b.id),
      'PROJECT_DEP_CYCLE',
    );
    await expectCode(
      tasks.setStatus(owner, b.id, 'Done'),
      'PROJECT_TASK_DEPENDENCIES_OPEN',
    );
    await tasks.update(owner, a.id, {
      checklist: [{ t: 'QA', done: true, req: true }],
    });
    await tasks.setStatus(owner, a.id, 'Done');
    await tasks.setStatus(owner, b.id, 'Done');
    const ws = await projects.workspace(owner);
    const row = ws.projects.find((x) => x.id === p.id)!;
    expect(row.progress).toBe(100);
    expect(row.doneCount).toBe(2);
  });

  it('reschedules with dependents and refuses to move later without them', async () => {
    as(owner);
    const p = await projects.create(owner, { name: 'Gantt', status: 'Active' });
    const a = await tasks.create(owner, {
      projectId: p.id,
      title: 'First',
      startDate: addDays(today, 1),
      dueDate: addDays(today, 3),
    });
    const b = await tasks.create(owner, {
      projectId: p.id,
      title: 'Second',
      startDate: addDays(today, 4),
      dueDate: addDays(today, 6),
    });
    await tasks.addDependency(owner, b.id, a.id);
    const plan = await tasks.reschedulePlan(owner, a.id, addDays(today, 5));
    expect(plan.delta).toBe(2);
    expect(plan.dependents).toBe(1);
    expect(plan.onlyAllowed).toBe(false);
    await expectCode(
      tasks.reschedule(owner, a.id, addDays(today, 5), false),
      'PROJECT_RESCHEDULE_BREAKS_DEPS',
    );
    await tasks.reschedule(owner, a.id, addDays(today, 5), true);
    const moved = await prisma.projectTask.findUniqueOrThrow({
      where: { id: b.id },
    });
    expect(moved.dueDate!.toISOString().slice(0, 10)).toBe(addDays(today, 8));
    expect(moved.baselineDue!.toISOString().slice(0, 10)).toBe(
      addDays(today, 6),
    );
    const crit = (await projects.workspace(owner)).tasks.filter(
      (t) => t.projectId === p.id && t.critical,
    );
    expect(crit).toHaveLength(2);
  });

  it('only completes a milestone when linked tasks are done and the client approved it', async () => {
    as(owner);
    const p = await projects.create(owner, {
      name: 'Milestones',
      status: 'Active',
      customerId,
    });
    const t = await tasks.create(owner, {
      projectId: p.id,
      title: 'Deliverable',
      dueDate: addDays(today, 1),
    });
    const m = await milestones.create(owner, {
      projectId: p.id,
      name: 'Sign-off',
      plannedDate: addDays(today, 3),
      approvalMode: 'client',
      taskIds: [t.id],
    });
    await expectCode(
      milestones.complete(owner, m.id),
      'PROJECT_MILESTONE_TASKS_OPEN',
    );
    await tasks.setStatus(owner, t.id, 'Done');
    await expectCode(
      milestones.complete(owner, m.id),
      'PROJECT_MILESTONE_NEEDS_CLIENT',
    );
    const ap = await approvals.create(owner, {
      projectId: p.id,
      type: 'Milestone',
      item: 'Sign-off',
      approver: 'client',
      milestoneId: m.id,
      dueDate: addDays(today, 2),
    });
    // Staff can never decide a client approval for them.
    await expectCode(
      approvals.decide(owner, ap.id, 'Approved'),
      'PROJECT_APPROVAL_CLIENT_ONLY',
    );
    expect(ap.delivery?.emailed).toBe(false);

    // Real portal round trip — codes off so no email is needed.
    const cfg = (await settings.get(owner)).config;
    await settings.save(owner, { ...cfg, portalMfa: false });
    const inv = await portal.invite(owner, p.id);
    expect(inv.emailed).toBe(false);
    const token = inv.link!.split('/portal/p/')[1];
    const r = await portal.redeem(token);
    expect(r.needsCode).toBe(false);
    const view = await portal.publicView(r.session);
    const flat = JSON.stringify(view);
    expect(flat).not.toMatch(/budget|rateSnapshot|consumed|health/i);
    expect(view.approvals[0].status).toBe('Viewed');
    await expectCode(
      portal.publicDecide(r.session, ap.id, 'Rejected', ''),
      'PROJECT_COMMENT_REQUIRED',
    );
    as(owner);
    await portal.publicDecide(r.session, ap.id, 'Approved');
    as(owner);
    await milestones.complete(owner, m.id);
    const done = await prisma.projectMilestone.findUniqueOrThrow({
      where: { id: m.id },
    });
    expect(done.status).toBe('Completed');
    expect(done.actualDate!.toISOString().slice(0, 10)).toBe(today);
  });

  it('keeps unshared tasks and internal files out of the client view', async () => {
    as(owner);
    const p = await projects.create(owner, {
      name: 'Portal Scope',
      customerId,
      budget: 5000,
    });
    await tasks.create(owner, {
      projectId: p.id,
      title: 'Secret internal task',
    });
    await tasks.create(owner, {
      projectId: p.id,
      title: 'Shared task',
      clientVisible: true,
    });
    const v = await portal.clientView(businessId, p.id);
    expect(v.tasks.map((t) => t.title)).toEqual(['Shared task']);
    expect(v.invoices).toBeNull(); // Client "View financials" is off by default
  });

  it('logs time with validation, rate snapshots, approval and reject-with-reason', async () => {
    as(owner);
    const p = await projects.create(owner, {
      name: 'Timed',
      status: 'Active',
      budget: 1000,
    });
    as(staff);
    await expectCode(
      time.add(staff, { projectId: p.id, date: today, hours: 0.1 }),
      'PROJECT_TIME_INVALID',
    );
    await expectCode(
      time.add(staff, { projectId: p.id, date: addDays(today, 1), hours: 2 }),
      'PROJECT_TIME_INVALID',
    );
    const e = await time.add(staff, {
      projectId: p.id,
      date: today,
      hours: 2,
      billable: true,
    });
    const row = await prisma.projectTimeEntry.findUniqueOrThrow({
      where: { id: e.id },
    });
    expect(Number(row.rateSnapshot)).toBe(50);
    expect(row.status).toBe('draft');
    await time.submit(staff, e.id);
    await expectCode(
      time.decide(staff, [e.id], 'approved'),
      'PROJECT_FORBIDDEN',
    );
    as(owner);
    await expectCode(
      time.decide(owner, [e.id], 'rejected', ' '),
      'PROJECT_COMMENT_REQUIRED',
    );
    await time.decide(owner, [e.id], 'approved');
    const ws = await projects.workspace(owner);
    expect(ws.projects.find((x) => x.id === p.id)!.consumed).toBe(100);
    // The staff member cannot see budgets (View financials is off for Staff).
    as(staff);
    const staffWs = await projects.workspace(staff);
    expect(
      staffWs.projects.every((x) => x.budget === null && x.consumed === null),
    ).toBe(true);
  });

  it('timer stop saves a draft entry', async () => {
    as(owner);
    const p = await projects.create(owner, { name: 'Timer' });
    await time.start(owner, p.id);
    await prisma.projectTimer.updateMany({
      where: { businessId },
      data: { startedAt: new Date(Date.now() - 30 * 60000) },
    });
    const r = await time.stop(owner);
    expect(r.minutes).toBeGreaterThanOrEqual(30);
    const e = await prisma.projectTimeEntry.findFirst({
      where: { projectId: p.id },
    });
    expect(e?.source).toBe('timer');
    await expectCode(time.stop(owner), 'PROJECT_TIMER_NONE');
  });

  it('falls back to the rule-based planner and accepting a plan creates chained tasks and milestones', async () => {
    as(owner);
    const p = await projects.create(owner, {
      name: 'AI Plan',
      status: 'Active',
    });
    const gen = await ai.generatePlan(owner, {
      projectId: p.id,
      goal: 'Launch a new website',
      due: addDays(today, 60),
    });
    expect(gen.source).toMatch(/rule-based/);
    const n = gen.plan.phases.reduce((a, ph) => a + ph.tasks.length, 0);
    const res = await ai.acceptPlan(owner, {
      projectId: p.id,
      plan: gen.plan,
      due: addDays(today, 60),
    });
    expect(res.tasks).toBe(n);
    expect(res.milestones).toBe(gen.plan.ms.length);
    const deps = await prisma.projectTaskDependency.count({
      where: { task: { projectId: p.id } },
    });
    expect(deps).toBeGreaterThan(0);
    const st = await ai.statusDraft(owner, p.id, 'Client');
    expect(st.text).not.toMatch(/Budget:/);
  });

  it('creates a project from a template with phases, tasks and milestones', async () => {
    as(owner);
    const t = await prisma.projectTemplate.create({
      data: {
        businessId,
        name: 'Mini',
        category: 'Internal',
        status: 'Published',
        phases: [
          { name: 'One', days: 3, tasks: ['Plan', 'Do > Sub'] },
          { name: 'Two', days: 2, tasks: ['Check'] },
        ],
        milestones: ['Done'],
        chain: true,
      },
    });
    const p = await projects.create(owner, {
      name: 'From template',
      templateId: t.id,
      startDate: today,
    });
    const rows = await prisma.projectTask.findMany({
      where: { projectId: p.id },
    });
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.parentTaskId)).toHaveLength(1);
    expect(
      await prisma.projectMilestone.count({ where: { projectId: p.id } }),
    ).toBe(1);
  });

  it('reports and overview KPIs are computed from records', async () => {
    as(owner);
    const r = await reports.run(owner, 'Task Completion');
    expect(r.rows.length).toBeGreaterThan(0);
    const o = await projects.overview(owner, 'This Month');
    expect(o.kpis).toHaveLength(8);
    expect(o.kpis[4].value).toBe('—'); // no shifts scheduled → utilization honestly not tracked
    as(staff);
    const hidden = await reports.run(staff, 'Budget vs Actual');
    expect(hidden.rows).toHaveLength(0);
    expect(hidden.table[0][0]).toMatch(/View financials/);
  });

  it('settings: next number cannot go backwards and system statuses stay', async () => {
    as(owner);
    const cfg = (await settings.get(owner)).config;
    await expectCode(
      settings.save(owner, { ...cfg, nextNo: 1 }),
      'PROJECT_SETTINGS_INVALID',
    );
    await expectCode(
      settings.save(owner, {
        ...cfg,
        statuses: cfg.statuses.filter((s) => s.name !== 'Completed'),
      }),
      'PROJECT_SETTINGS_INVALID',
    );
    as(staff);
    await expectCode(settings.save(staff, cfg), 'PROJECT_FORBIDDEN');
  });

  it('a Contractor only sees projects they are involved in', async () => {
    as(owner);
    await settings.setRole(owner, staffBu, 'Contractor');
    as(staff);
    const ws = await projects.workspace(staff);
    expect(ws.me.role).toBe('Contractor');
    expect(ws.projects.length).toBe(0);
    as(owner);
    const p = await projects.create(owner, {
      name: 'Contractor job',
      team: [staffBu],
    });
    as(staff);
    const ws2 = await projects.workspace(staff);
    expect(ws2.projects.map((x) => x.id)).toEqual([p.id]);
    as(owner);
    await settings.setRole(owner, staffBu, 'Staff');
  });

  it('daily job notifies about overdue tasks once per day', async () => {
    as(owner);
    const p = await projects.create(owner, { name: 'Overdue' });
    await tasks.create(owner, {
      projectId: p.id,
      title: 'Late one',
      assigneeId: ownerBu,
      dueDate: addDays(today, -1),
    });
    const before = await prisma.notification.count({
      where: {
        businessId,
        userId: ownerUserId,
        title: { startsWith: 'Overdue:' },
      },
    });
    const row = await prisma.projectSettings.findUniqueOrThrow({
      where: { businessId },
    });
    await daily.runFor(businessId, row.config);
    await daily.runFor(businessId, row.config);
    const after = await prisma.notification.count({
      where: {
        businessId,
        userId: ownerUserId,
        title: { startsWith: 'Overdue:' },
      },
    });
    expect(after - before).toBe(1);
  });
});

describe('Projects & Tasks — rates, hooks, links, fields (real DB)', () => {
  // Own business, so ordering with the suite above cannot interfere.
  let prisma: PrismaService;
  let cls: FakeClsService;
  let businessId: string;
  let ownerUserId: string;
  let ownerBu: string;
  let customerId: string;
  let owner: AuthenticatedUser;
  let ctx: ProjectsContextService;
  let projects: ProjectsService;
  let tasks: ProjectTasksService;
  let time: ProjectTimeService;
  let settings: ProjectSettingsService;
  let reports: ProjectReportsService;
  const reviews = { create: jest.fn(() => Promise.resolve({ id: 'r' })) };
  const ai = {
    createMessage: jest.fn(() => Promise.reject(new Error('AI off'))),
  };
  let today: string;
  const as = () => {
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, ownerUserId);
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const stamp = Date.now();
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Projects Rates Biz',
          slug: `projects-rates-${stamp}`,
          currency: 'USD',
          timezone: 'UTC',
        },
      })
    ).id;
    ownerUserId = (
      await prisma.user.create({
        data: {
          name: 'Rae Owner',
          email: `proj-rates-${stamp}@example.com`,
          passwordHash: 'x',
        },
      })
    ).id;
    ownerBu = (
      await prisma.businessUser.create({
        data: {
          businessId,
          userId: ownerUserId,
          role: Role.owner,
          hourlyRate: 40,
        },
      })
    ).id;
    customerId = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Rate Client',
          phone: `+1666${String(stamp).slice(-7)}`,
        },
      })
    ).id;
    owner = {
      sub: ownerUserId,
      businessId,
      role: Role.owner,
      capabilities: [],
    };
    today = todayIn('UTC');
    as();
    ctx = new ProjectsContextService(
      prisma,
      tenant,
      cls as unknown as ClsService,
      new AuditService(tenant, cls as unknown as ClsService),
      new NotificationsService(tenant),
    );
    const perms = new ProjectsPermissionsService(prisma, ctx);
    const loader = new ProjectsLoaderService(prisma, ctx, perms);
    const hooks = new ProjectHooksService(
      prisma,
      ctx,
      reviews as unknown as ReviewRequestsService,
    );
    projects = new ProjectsService(
      prisma,
      ctx,
      loader,
      perms,
      hooks,
      ai as unknown as AiInfraService,
    );
    tasks = new ProjectTasksService(prisma, ctx, loader, perms);
    time = new ProjectTimeService(prisma, ctx, loader, perms);
    settings = new ProjectSettingsService(prisma, ctx, perms);
    reports = new ProjectReportsService(prisma, ctx, loader, perms);
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      for (const t of [
        'project_activities',
        'project_comments',
        'project_timers',
        'project_settings',
        'project_role_assignments',
        'project_notify_prefs',
        'project_templates',
      ])
        await tx.$executeRawUnsafe(
          `DELETE FROM ${t} WHERE business_id = ?`,
          businessId,
        );
      await tx.project.deleteMany({ where: { businessId } });
      await tx.notification.deleteMany({ where: { businessId } });
      await tx.order.deleteMany({ where: { businessId } });
      await tx.customer.deleteMany({ where: { businessId } });
      await tx.businessUser.deleteMany({ where: { businessId } });
      await tx.user.deleteMany({ where: { id: ownerUserId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('snapshots the bill rate and computes a real margin (bill value minus labour cost)', async () => {
    as();
    await settings.setBillRate(owner, ownerBu, 100);
    const p = await projects.create(owner, {
      name: 'Margin',
      status: 'Active',
    });
    const e1 = await time.add(owner, {
      projectId: p.id,
      date: today,
      hours: 2,
      billable: true,
    });
    const e2 = await time.add(owner, {
      projectId: p.id,
      date: today,
      hours: 1,
      billable: false,
    });
    for (const e of [e1, e2]) {
      await time.submit(owner, e.id);
      await time.decide(owner, [e.id], 'approved');
    }
    const row = await prisma.projectTimeEntry.findUniqueOrThrow({
      where: { id: e1.id },
    });
    expect(Number(row.billRateSnapshot)).toBe(100);
    expect(Number(row.rateSnapshot)).toBe(40);
    const r = await reports.run(owner, 'Project Profitability');
    const line = r.table.find((x) => x[0] === 'Margin')!;
    // value 2h x 100 = 200; cost 3h x 40 = 120; margin 80 (40%)
    expect(line.slice(1, 5)).toEqual(['USD 200', 'USD 120', 'USD 80', '40%']);
    const list = await time.list(owner);
    expect(list.entries.find((x) => x.id === e1.id)!.value).toBe(200);
  });

  it('project hooks run real actions: team notice on create, review request on completion', async () => {
    as();
    const su = await prisma.user.create({
      data: {
        name: 'Sid Staff',
        email: `proj-hook-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    const sbu = await prisma.businessUser.create({
      data: { businessId, userId: su.id, role: Role.staff },
    });
    const p = await projects.create(owner, {
      name: 'Hooked',
      customerId,
      team: [sbu.id],
      automationRefs: ['project.created', 'project.completed'],
    });
    const n = await prisma.notification.count({
      where: { businessId, title: { startsWith: 'You’re on a new project' } },
    });
    expect(n).toBe(1);
    await projects.complete(owner, p.id);
    expect(reviews.create).toHaveBeenCalledWith(businessId, {
      customerId,
      source: 'project',
      sourceId: p.id,
    });
    const act = await prisma.projectActivity.findFirst({
      where: {
        projectId: p.id,
        event: 'automation.ran',
        text: { contains: 'review request' },
      },
    });
    expect(act).not.toBeNull();
  });

  it('links returns this customer quotations, invoices and payments since the project started', async () => {
    as();
    const p = await projects.create(owner, {
      name: 'Linked',
      customerId,
      startDate: addDays(today, -5),
    });
    const o = await prisma.order.create({
      data: {
        businessId,
        orderNo: 90001,
        customerId,
        status: 'completed',
        total: 300,
      },
    });
    await prisma.payment.create({
      data: { orderId: o.id, method: 'cash', amount: 120 },
    });
    await prisma.order.create({
      data: {
        businessId,
        orderNo: 90002,
        customerId,
        isQuotation: true,
        quotationStatus: 'sent',
        total: 900,
      },
    });
    const l = await projects.links(owner, p.id);
    expect(l.invoices).toEqual({
      count: 1,
      latestNo: 90001,
      invoiced: 300,
      paid: 120,
    });
    expect(l.quotations!.count).toBe(1);
    expect(l.quotations!.latest!.status).toBe('sent');
    await prisma.payment.deleteMany({ where: { orderId: o.id } });
  });

  it('task custom fields keep only fields defined for tasks; WIP limit is configurable', async () => {
    as();
    const cfg = (await settings.get(owner)).config;
    await settings.save(owner, {
      ...cfg,
      wipLimit: 1,
      fields: [
        {
          name: 'QA reviewer',
          type: 'Text',
          applies: 'Task',
          client: 'Internal only',
        },
      ],
    });
    const p = await projects.create(owner, { name: 'Fields' });
    const t = await tasks.create(owner, {
      projectId: p.id,
      title: 'X',
      customFields: { 'QA reviewer': 'Pat', Bogus: 'no' },
    });
    const row = await prisma.projectTask.findUniqueOrThrow({
      where: { id: t.id },
    });
    expect(row.customFields).toEqual({ 'QA reviewer': 'Pat' });
    const t2 = await tasks.create(owner, { projectId: p.id, title: 'Y' });
    await tasks.setStatus(owner, t.id, 'In Progress');
    const r = await tasks.setStatus(owner, t2.id, 'In Progress');
    expect(r.warning).toMatch(/WIP limit \(1\)/);
  });

  it('the overview insight is labelled as rule-based when AI is unavailable', async () => {
    as();
    const o = await projects.overview(owner, 'This Month');
    expect(o.insightSource).toBe('rules');
    expect(o.kpis[6].value).toMatch(/^\$/);
  });
});

describe('projects-metrics (pure)', () => {
  const T = (
    id: string,
    extra: Partial<Parameters<typeof progressOf>[0][number]> = {},
  ) => ({
    id,
    number: id,
    projectId: 'p',
    title: id,
    assigneeId: null,
    status: 'To Do',
    priority: 'Medium',
    startDate: '2026-01-01',
    dueDate: '2026-01-05',
    estimateMins: 60,
    loggedMins: 0,
    blocked: false,
    blockType: null,
    deps: [] as string[],
    parentTaskId: null,
    ...extra,
  });

  it('progress is Done ÷ non-cancelled', () => {
    expect(
      progressOf(
        [T('a', { status: 'Done' }), T('b'), T('c', { status: 'Cancelled' })],
        'In progress',
      ),
    ).toBe(50);
    expect(progressOf([], 'In progress')).toBe(0);
  });

  it('health is No Data without tasks and worsens with overdue work and budget overrun', () => {
    const base = {
      project: {
        id: 'p',
        name: 'P',
        status: 'Active',
        startDate: null,
        dueDate: '2027-01-01',
        budget: 1000,
        managerId: null,
      },
      statusCat: 'In progress',
      milestones: [],
      taskMap: new Map(),
      approvals: [],
      overCapacity: [],
      capacityKnown: false,
      today: '2026-02-01',
    };
    expect(
      healthOf({ ...base, tasks: [], consumed: 0, progress: 0 }).health,
    ).toBe('No Data');
    const t = [T('a'), T('b', { dueDate: '2026-03-01' })];
    expect(
      healthOf({ ...base, tasks: t, consumed: 0, progress: 0 }).health,
    ).toBe('Watch');
    expect(
      healthOf({
        ...base,
        tasks: [T('b', { dueDate: '2026-03-01' })],
        consumed: 900,
        progress: 20,
      }).health,
    ).toBe('Critical');
  });

  it('cycle detection and critical path', () => {
    expect(
      wouldCycle('a', 'b', [
        { id: 'b', deps: ['a'] },
        { id: 'a', deps: [] },
      ]),
    ).toBe(true);
    expect(
      wouldCycle('a', 'b', [
        { id: 'b', deps: [] },
        { id: 'a', deps: [] },
      ]),
    ).toBe(false);
    const cp = criticalPath([T('a'), T('b', { deps: ['a'] }), T('c')]);
    expect([...cp].sort()).toEqual(['a', 'b']);
  });
});
