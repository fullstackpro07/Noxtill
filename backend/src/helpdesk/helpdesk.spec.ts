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
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { EmailService } from '../messaging/channels/email.service';
import type { S3Service } from '../common/storage/s3.service';
import type { InboxSendService } from '../unified-inbox/inbox-send.service';
import type { InboxChannelsService } from '../unified-inbox/inbox-channels.service';
import { InboxHooksService } from '../unified-inbox/inbox-hooks.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { HdActor, HelpdeskContextService } from './helpdesk-context.service';
import { HelpdeskLoaderService } from './helpdesk-loader.service';
import { HelpdeskOpsService } from './helpdesk-ops.service';
import { HelpdeskDeliveryService } from './helpdesk-delivery.service';
import { HelpdeskTicketsService } from './helpdesk-tickets.service';
import { HelpdeskJobsService, csatInvite } from './helpdesk-jobs.service';
import { HelpdeskAdminService } from './helpdesk-admin.service';
import { HelpdeskContentService } from './helpdesk-content.service';
import { HelpdeskViewsService } from './helpdesk-views.service';
import { HelpdeskPortalService } from './helpdesk-portal.service';
import {
  addWorkMinutes,
  calendarOf,
  evaluateSla,
  pickPolicy,
  workMinutes,
  SlaPolicyLite,
  SlaTicketInput,
} from './helpdesk-sla.util';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
  run<T>(fn: () => T): T {
    return fn();
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

const pol = (o: Partial<SlaPolicyLite>): SlaPolicyLite => ({
  id: 'p',
  name: 'P',
  applies: 'All Tickets',
  scope: '',
  priority: 'Normal',
  fr: 60,
  res: 480,
  hours: '24/7',
  pause: ['Waiting on Customer'],
  warn: 75,
  active: true,
  order: 1,
  ...o,
});

describe('Helpdesk SLA engine', () => {
  const cal = calendarOf({
    tz: 'UTC',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    open: '09:00',
    close: '17:00',
    holidays: '2026-10-02',
  })!;

  it('counts only working hours, skipping weekends and holidays', () => {
    // Thu 2026-10-01 16:00 → Mon 2026-10-05 10:00: Thu 1h + Fri holiday 0 + weekend 0 + Mon 1h.
    expect(
      workMinutes(
        new Date('2026-10-01T16:00:00Z'),
        new Date('2026-10-05T10:00:00Z'),
        cal,
      ),
    ).toBe(120);
    expect(
      addWorkMinutes(new Date('2026-10-01T16:30:00Z'), 60, cal).toISOString(),
    ).toBe('2026-10-05T09:30:00.000Z');
    expect(
      workMinutes(
        new Date('2026-10-01T16:00:00Z'),
        new Date('2026-10-01T18:00:00Z'),
        null,
      ),
    ).toBe(120);
  });

  it('picks the first matching policy: segment → queue → category → branch → priority → all', () => {
    const t = {
      segments: ['vip'],
      queueName: 'Billing',
      category: 'Billing',
      branchName: 'Main',
      priority: 'High',
    } as SlaTicketInput;
    const P = [
      pol({ id: 'all' }),
      pol({ id: 'pri', applies: 'Specific Priority', priority: 'High' }),
      pol({ id: 'cat', applies: 'Category', scope: 'Billing' }),
      pol({ id: 'seg', applies: 'Customer Segment', scope: 'VIP' }),
    ];
    expect(pickPolicy(t, P)!.id).toBe('seg');
    expect(pickPolicy({ ...t, segments: [] }, P)!.id).toBe('cat');
    expect(pickPolicy({ ...t, segments: [], category: 'Other' }, P)!.id).toBe(
      'pri',
    );
    expect(
      pickPolicy({ ...t, segments: [], category: 'Other', priority: 'Low' }, P)!
        .id,
    ).toBe('all');
  });

  it('reports healthy, at risk, breached and paused, excluding paused time', () => {
    const now = new Date('2026-10-01T12:00:00Z');
    const base: SlaTicketInput = {
      status: 'Open',
      priority: 'Normal',
      category: 'General',
      queueName: null,
      branchName: null,
      segments: [],
      createdAt: new Date('2026-10-01T11:30:00Z'),
      firstResponseAt: null,
      slaMissed: false,
      pauses: [],
      pausedSince: null,
    };
    expect(evaluateSla(base, [pol({})], null, now).k).toBe('Healthy');
    expect(
      evaluateSla(
        { ...base, createdAt: new Date('2026-10-01T11:10:00Z') },
        [pol({})],
        null,
        now,
      ).k,
    ).toBe('At Risk');
    expect(
      evaluateSla(
        { ...base, createdAt: new Date('2026-10-01T10:00:00Z') },
        [pol({})],
        null,
        now,
      ).k,
    ).toBe('Breached');
    // 2h old but paused (waiting on customer) for 90 minutes → 30 minutes used → healthy.
    const paused = {
      ...base,
      createdAt: new Date('2026-10-01T10:00:00Z'),
      pauses: [
        ['2026-10-01T10:15:00Z', '2026-10-01T11:45:00Z', 'Waiting on Customer'],
      ] as Array<[string, string, string]>,
    };
    expect(evaluateSla(paused, [pol({})], null, now).k).toBe('Healthy');
    expect(
      evaluateSla(
        {
          ...base,
          status: 'Waiting on Customer',
          pausedSince: new Date('2026-10-01T11:40:00Z'),
        },
        [pol({})],
        null,
        now,
      ).k,
    ).toBe('Paused');
    expect(
      evaluateSla(
        { ...base, status: 'Resolved', slaMissed: true },
        [pol({})],
        null,
        now,
      ).k,
    ).toBe('Missed');
  });
});

describe('Helpdesk (real DB)', () => {
  let prisma: PrismaService;
  let cls: FakeClsService;
  let businessId: string;
  let ownerUserId: string;
  let agentUserId: string;
  let agent2UserId: string;
  let customerId: string;
  let customer2Id: string;
  let owner: HdActor;
  let agent: HdActor;
  let ctx: HelpdeskContextService;
  let tickets: HelpdeskTicketsService;
  let ops: HelpdeskOpsService;
  let jobs: HelpdeskJobsService;
  let admin: HelpdeskAdminService;
  let content: HelpdeskContentService;
  let views: HelpdeskViewsService;
  let portal: HelpdeskPortalService;
  const sent: string[] = [];
  const sender = {
    cannotSendReason: jest.fn(() => Promise.resolve(null)),
    send: jest.fn((_c: unknown, text: string) => {
      sent.push(text);
      return Promise.resolve({ id: `im-${sent.length}-${Date.now()}` });
    }),
  };
  const stamp = Date.now();

  const au = (sub: string, role: Role): AuthenticatedUser => ({
    sub,
    businessId,
    role,
    capabilities: [],
  });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const business = await prisma.business.create({
      data: {
        name: 'Helpdesk Test Biz',
        slug: `helpdesk-test-${stamp}`,
        currency: 'USD',
        timezone: 'UTC',
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const mk = (name: string, tag: string) =>
      prisma.user.create({
        data: {
          name,
          email: `hd-${tag}-${stamp}@example.com`,
          passwordHash: 'x',
        },
      });
    const [o, a, a2] = await Promise.all([
      mk('Olive Owner', 'o'),
      mk('Agnes Agent', 'a'),
      mk('Bea Backup', 'b'),
    ]);
    ownerUserId = o.id;
    agentUserId = a.id;
    agent2UserId = a2.id;
    await prisma.businessUser.createMany({
      data: [
        { businessId, userId: o.id, role: Role.owner },
        { businessId, userId: a.id, role: Role.staff },
        { businessId, userId: a2.id, role: Role.staff },
      ],
    });
    customerId = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Casey Customer',
          phone: `+1555${String(stamp).slice(-7)}`,
          email: `casey-${stamp}@example.com`,
        },
      })
    ).id;
    customer2Id = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Dana Other',
          phone: `+1556${String(stamp).slice(-7)}`,
        },
      })
    ).id;

    const env = {
      get: (k: string) => ({ FRONTEND_URL: 'http://localhost:3000' })[k],
    } as unknown as ConfigService;
    const email = {
      send: jest.fn(() => Promise.resolve({ providerRef: 'x' })),
    } as unknown as EmailService;
    const s3 = {
      upload: jest.fn(),
      getSignedDownloadUrl: jest.fn(() => Promise.resolve('http://files')),
      delete: jest.fn(() => Promise.resolve()),
    } as unknown as S3Service;
    const channels = {
      states: jest.fn(() => Promise.resolve(new Map())),
    } as unknown as InboxChannelsService;
    ctx = new HelpdeskContextService(
      prisma,
      new CapabilitiesService(prisma),
      new AuditService(tenant, cls as unknown as ClsService),
      new NotificationsService(tenant),
      email,
      env,
    );
    const loader = new HelpdeskLoaderService(prisma, ctx);
    ops = new HelpdeskOpsService(prisma, ctx, loader);
    const delivery = new HelpdeskDeliveryService(
      prisma,
      cls as unknown as ClsService,
      sender as unknown as InboxSendService,
      channels,
      env,
    );
    tickets = new HelpdeskTicketsService(
      prisma,
      ctx,
      loader,
      ops,
      delivery,
      s3,
      new InboxHooksService(),
    );
    jobs = new HelpdeskJobsService(prisma, ctx, ops, delivery, s3);
    admin = new HelpdeskAdminService(prisma, ctx, ops, jobs);
    content = new HelpdeskContentService(prisma, ctx, ops, tickets, delivery);
    views = new HelpdeskViewsService(
      prisma,
      ctx,
      loader,
      ops,
      channels,
      delivery,
    );
    portal = new HelpdeskPortalService(prisma, ctx, ops, tickets, s3);
    cls.set(CLS_KEY_USER_ID, ownerUserId);
    owner = await ctx.actor(au(ownerUserId, Role.owner));
    agent = await ctx.actor(au(agentUserId, Role.staff));
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      for (const t of [
        'helpdesk_messages',
        'helpdesk_links',
        'helpdesk_tickets',
        'helpdesk_settings',
        'helpdesk_agents',
        'helpdesk_queues',
        'helpdesk_audit',
        'helpdesk_sla_policies',
        'helpdesk_escalation_rules',
        'helpdesk_escalations',
        'helpdesk_articles',
        'helpdesk_article_versions',
        'helpdesk_article_events',
        'helpdesk_saved_replies',
        'helpdesk_macros',
        'helpdesk_csat',
      ])
        await tx.$executeRawUnsafe(
          `DELETE FROM ${t} WHERE business_id = ?`,
          businessId,
        );
      await tx.inboxMessage.deleteMany({ where: { businessId } });
      await tx.inboxConversation.deleteMany({ where: { businessId } });
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
        where: { id: { in: [ownerUserId, agentUserId, agent2UserId] } },
      });
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  const newTicket = (
    o: Partial<Parameters<HelpdeskTicketsService['create']>[2]> = {},
    by: HdActor = owner,
  ) =>
    tickets.create(by, businessId, {
      customerId,
      subject: 'Charged twice',
      description: 'Two charges on my card',
      channel: 'Portal',
      category: 'General',
      priority: 'Normal',
      ...o,
    });

  it('seeds queues and SLA policies on first use and numbers tickets uniquely under concurrency', async () => {
    const [a, b, c] = await Promise.all([
      newTicket(),
      newTicket(),
      newTicket(),
    ]);
    const nums = [a.number, b.number, c.number].sort();
    expect(new Set(nums).size).toBe(3);
    expect(nums[0]).toMatch(/^HD-\d{5}$/);
    expect(
      await prisma.helpdeskQueue.count({ where: { businessId } }),
    ).toBeGreaterThanOrEqual(4);
    const msgs = await prisma.helpdeskMessage.findMany({
      where: { ticketId: a.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(msgs.map((m) => m.kind)).toEqual(
      expect.arrayContaining(['sys', 'cust']),
    );
    expect(
      msgs.some((m) => m.body.startsWith('SLA policy “Standard” applied')),
    ).toBe(true);
  });

  it('routes a new ticket to the queue whose categories match', async () => {
    const t = await newTicket({ category: 'Billing' });
    const q = await prisma.helpdeskQueue.findUnique({
      where: { id: t.queueId! },
    });
    expect(q!.name).toBe('Billing');
  });

  it('lets an agent see only unassigned-queue, own and followed tickets', async () => {
    const mine = await newTicket();
    await ops.assign(mine, agentUserId, owner, await ctx.config(businessId));
    const theirs = await newTicket();
    await ops.assign(theirs, agent2UserId, owner, await ctx.config(businessId));
    const list = await tickets.list(agent, {});
    const numbers = list.rows.map((r) => r.number);
    expect(numbers).toContain(mine.number);
    expect(numbers).not.toContain(theirs.number);
    await expectCode(
      tickets.detail(agent, theirs.number),
      'HELPDESK_FORBIDDEN',
    );
    // Agents can't close (default matrix).
    await expectCode(
      tickets.setField(agent, mine.number, {
        field: 'status',
        value: 'Closed',
      }),
      'HELPDESK_FORBIDDEN',
    );
  });

  it('records SLA pause intervals and schedules CSAT on resolve', async () => {
    const cfg = await ctx.config(businessId);
    let t = await newTicket();
    t = await ops.setStatus(t, 'Waiting on Customer', owner, cfg);
    expect(t.pausedSince).not.toBeNull();
    t = await ops.setStatus(t, 'Open', owner, cfg);
    expect(t.pausedSince).toBeNull();
    expect((t.pauses as unknown[]).length).toBe(1);
    t = await ops.setStatus(t, 'Resolved', owner, cfg);
    expect(t.resolvedAt).not.toBeNull();
    const csat = await prisma.helpdeskCsat.findUnique({
      where: { ticketId: t.id },
    });
    expect(csat!.status).toBe('scheduled');
    expect(csat!.channel).toBe('Portal');
  });

  it('shows customers only public messages and records a poor rating with a follow-up', async () => {
    const cfg = await ctx.config(businessId);
    let t = await newTicket();
    await tickets.reply(owner, t.number, {
      mode: 'note',
      text: 'internal only',
    });
    const r = await tickets.reply(owner, t.number, {
      mode: 'public',
      text: 'We are on it',
    });
    expect(r.delivery).toBe('portal');
    t = await ops.fresh(t.id);
    expect(t.firstResponseAt).not.toBeNull();
    const view = await portal.view(t.portalToken);
    expect(view.messages.some((m) => m.body.includes('internal only'))).toBe(
      false,
    );
    // The customer's own opening message (delivery NULL) must be shown too.
    expect(
      view.messages.some((m) => m.mine && m.body === 'Two charges on my card'),
    ).toBe(true);
    expect(view.messages.some((m) => m.body.startsWith('We are on it'))).toBe(
      true,
    );
    await ops.setStatus(t, 'Resolved', owner, cfg);
    await portal.rate(t.portalToken, { rating: 1, comment: 'slow' });
    const csat = await prisma.helpdeskCsat.findUnique({
      where: { ticketId: t.id },
    });
    expect(csat).toMatchObject({
      status: 'responded',
      rating: 1,
      followUp: 'Open',
    });
    await expectCode(
      portal.rate(t.portalToken, { rating: 5 }),
      'HELPDESK_CONFLICT',
    );
  });

  it('reopens a resolved ticket when the customer replies inside the window', async () => {
    const cfg = await ctx.config(businessId);
    const t = await ops.setStatus(await newTicket(), 'Resolved', owner, cfg);
    await portal.reply(t.portalToken, 'Still broken');
    const n = await ops.fresh(t.id);
    expect(n.status).toBe('Open');
    expect(n.reopenCount).toBe(1);
  });

  it('merges only same-customer tickets and keeps the history', async () => {
    const a = await newTicket();
    const b = await newTicket({ subject: 'Duplicate' });
    const other = await newTicket({ customerId: customer2Id });
    await expectCode(
      tickets.merge(owner, { target: a.number, sources: [other.number] }),
      'HELPDESK_CONFLICT',
    );
    await tickets.merge(owner, { target: a.number, sources: [b.number] });
    const src = await ops.fresh(b.id);
    expect(src.status).toBe('Closed');
    expect(src.mergedIntoId).toBe(a.id);
    const copied = await prisma.helpdeskMessage.count({
      where: { ticketId: a.id, fromLabel: `From ${b.number}` },
    });
    expect(copied).toBeGreaterThan(0);
  });

  it('sends email-channel replies through the Unified Inbox and marks first response', async () => {
    const t = await newTicket({ channel: 'Email' });
    const r = await tickets.reply(owner, t.number, {
      mode: 'public',
      text: 'Hello from support',
    });
    expect(r.delivery).toBe('sent');
    expect(sender.send).toHaveBeenCalled();
    const n = await ops.fresh(t.id);
    expect(n.conversationId).not.toBeNull();
    expect(n.firstResponseAt).not.toBeNull();
  });

  it('fires an escalation rule once when SLA breaches, and logs the real outcome', async () => {
    await admin.saveRule(owner, null, {
      name: 'Breach raises priority',
      trigger: 'SLA Breached',
      action: 'Raise priority',
      target: `user:${ownerUserId}`,
      active: true,
    });
    const t = await newTicket({ priority: 'Low' });
    await prisma.helpdeskTicket.update({
      where: { id: t.id },
      data: { createdAt: new Date(Date.now() - 30 * 86400000) },
    });
    await jobs.run(businessId);
    await jobs.run(businessId);
    const n = await ops.fresh(t.id);
    expect(n.priority).toBe('Normal');
    const logs = await prisma.helpdeskEscalation.findMany({
      where: { ticketId: t.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      status: 'Succeeded',
      result: 'Priority raised to Normal',
    });
    expect((n.fired as Record<string, number>).breach).toBe(1);
  });

  it('rejects stale settings saves and removing a category that open tickets use', async () => {
    const ws = await views.workspace(owner);
    const cfg = ws.settings.config;
    await expectCode(
      admin.saveSettings(
        owner,
        ws.settings.version + 5,
        cfg as unknown as Record<string, unknown>,
      ),
      'HELPDESK_CONFLICT',
    );
    await expectCode(
      admin.saveSettings(owner, ws.settings.version, {
        ...cfg,
        categories: cfg.categories.filter((c) => c !== 'General'),
      }),
      'HELPDESK_CONFLICT',
    );
    const res = await admin.saveSettings(owner, ws.settings.version, {
      ...cfg,
      sla: { ...cfg.sla, warn: 80 },
    });
    expect(res.changed).toEqual(['sla']);
    await expectCode(
      admin.saveSettings(
        agent,
        res.version,
        cfg as unknown as Record<string, unknown>,
      ),
      'HELPDESK_FORBIDDEN',
    );
  });

  it('links only real records and discloses unavailable types', async () => {
    const t = await newTicket();
    await expectCode(
      tickets.link(owner, t.number, { type: 'Invoice', ref: 'INV-1' }),
      'HELPDESK_INVALID',
    );
    await expectCode(
      tickets.link(owner, t.number, { type: 'Order', ref: 'ORD-999999' }),
      'HELPDESK_INVALID',
    );
  });

  it('runs macros with the agent’s own permissions, skipping what they can’t do', async () => {
    await content.saveMacro(owner, null, {
      name: 'Close it',
      conditions: '',
      actions: [
        ['Set status', 'Closed'],
        ['Add tag', 'handled'],
      ],
      status: 'Active',
    });
    const m = await prisma.helpdeskMacro.findFirstOrThrow({
      where: { businessId, name: 'Close it' },
    });
    const t = await newTicket();
    await ops.assign(t, agentUserId, owner, await ctx.config(businessId));
    const r = await content.apply(agent, t.number, `m:${m.id}`, 'public');
    expect(r.skipped).toEqual(['status Closed (needs Close)']);
    expect(r.done).toEqual(['tag handled']);
    expect((await ops.fresh(t.id)).status).not.toBe('Closed');
  });

  it('only offers and runs a macro on tickets matching its conditions', async () => {
    await expectCode(
      content.saveMacro(owner, null, {
        name: 'Bad',
        conditions: 'Colour = red',
        actions: [['Add tag', 'x']],
        status: 'Active',
      }),
      'HELPDESK_INVALID',
    );
    await content.saveMacro(owner, null, {
      name: 'Billing only',
      conditions: 'Category = Billing AND Tag != vip',
      actions: [['Add tag', 'billed']],
      status: 'Active',
    });
    const m = await prisma.helpdeskMacro.findFirstOrThrow({
      where: { businessId, name: 'Billing only' },
    });
    const general = await newTicket({ category: 'General' });
    await expectCode(
      content.apply(owner, general.number, `m:${m.id}`, 'public'),
      'HELPDESK_INVALID',
    );
    const billing = await newTicket({ category: 'Billing' });
    const r = await content.apply(owner, billing.number, `m:${m.id}`, 'public');
    expect(r.done).toEqual(['tag billed']);
  });

  it('re-times surveys still waiting to go out when the delay changes', async () => {
    const cfg = await ctx.config(businessId);
    const t = await ops.setStatus(await newTicket(), 'Resolved', owner, cfg);
    const before = await prisma.helpdeskCsat.findUniqueOrThrow({
      where: { ticketId: t.id },
    });
    await admin.saveCsatSettings(owner, { ...cfg.csat, delay: 'Immediately' });
    const after = await prisma.helpdeskCsat.findUniqueOrThrow({
      where: { ticketId: t.id },
    });
    expect(before.sendAt.getTime() - after.sendAt.getTime()).toBe(120 * 60000);
    await admin.saveCsatSettings(owner, { ...cfg.csat, delay: '2 hours' });
  });

  it('writes the survey invitation in the configured language', () => {
    expect(csatInvite('English', 'HD-1', 'from 1 to 5 stars', 'L')).toBe(
      'How did we do with HD-1? Rate us from 1 to 5 stars: L',
    );
    expect(csatInvite('Urdu', 'HD-1', 'x', 'L')).not.toContain('How did we do');
    expect(csatInvite('English + Urdu', 'HD-1', 'x', 'L')).toContain(
      'How did we do',
    );
    expect(csatInvite('English + Urdu', 'HD-1', 'x', 'L')).toContain('ریٹنگ');
  });

  it('creates a Web ticket from the public help center request form', async () => {
    const r = await portal.helpRequest(`helpdesk-test-${stamp}`, {
      name: 'New Person',
      phone: `+1557${String(stamp).slice(-7)}`,
      subject: 'Question',
      description: 'How do I …?',
    });
    expect(r.number).toMatch(/^HD-/);
    const t = await prisma.helpdeskTicket.findUniqueOrThrow({
      where: { portalToken: r.token! },
    });
    expect(t.channel).toBe('Web');
    const c = await prisma.customer.findUniqueOrThrow({
      where: { id: t.customerId },
    });
    expect(c.name).toBe('New Person');
  });

  it('computes overview KPIs from the real tickets', async () => {
    const o = await views.overview(owner, '30 days');
    const open = await prisma.helpdeskTicket.count({
      where: { businessId, status: { notIn: ['Resolved', 'Closed'] } },
    });
    expect(o.kpis.open).toBe(open);
    expect(o.trend.labels).toHaveLength(14);
  });
});
