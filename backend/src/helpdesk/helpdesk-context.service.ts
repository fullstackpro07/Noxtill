import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AuditService } from '../common/audit/audit.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { NOTIFICATION_EVENT_PRIORITY } from '../notifications/notification-preferences.constants';
import { EmailService } from '../messaging/channels/email.service';
import { rulesToWhere, SegmentRules } from '../customers/segment-rules.util';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  HD_CAPS,
  HD_ERRORS,
  HdCap,
  HelpdeskConfig,
  NotifyEvent,
  SEED_QUEUES,
  SEED_SLAS,
  defaultConfig,
  mergeConfig,
} from './helpdesk.constants';
import { Calendar, SlaPolicyLite, calendarOf } from './helpdesk-sla.util';

export type HdRole = 'Owner' | 'Manager' | 'Agent';

export interface HdActor {
  userId: string;
  name: string;
  role: HdRole;
  /** 0 Owner, 1 Manager, 2 Agent — the Permissions matrix column. */
  ri: number;
  /** The helpdesk (group root business) id. */
  rootId: string;
  /** The business the actor is signed into. */
  businessId: string;
}

export interface Agent {
  /** User id — agents are group-wide, so they are keyed by user rather than per-branch Staff row. */
  id: string;
  name: string;
  title: string;
  role: HdRole;
  skills: string[];
  cap: number;
  /** Online = clocked in (Staff › Attendance), Away = on approved leave now, Offline otherwise. */
  status: 'Online' | 'Away' | 'Offline';
  homeBusinessId: string;
  email: string | null;
}

export interface Branch {
  id: string;
  name: string;
}

const ROLE_RANK: Record<Role, number> = { owner: 0, manager: 1, staff: 2 };
const ROLE_LABEL: Record<Role, HdRole> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Agent',
};

export function tokenOf(bytes = 24): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('crypto') as typeof import('crypto'))
    .randomBytes(bytes)
    .toString('base64url');
}

/**
 * Shared plumbing for every Helpdesk service: the helpdesk a request belongs to (the business
 * group's root), versioned settings and the ticket number sequence, the agent directory (real
 * Staff records, never copies), permissions, audit and internal notifications.
 */
@Injectable()
export class HelpdeskContextService {
  private readonly logger = new Logger(HelpdeskContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly caps: CapabilitiesService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly env: ConfigService,
  ) {}

  get db() {
    return this.prisma;
  }

  // ── helpdesk identity ────────────────────────────────────────────────────

  async rootOf(businessId: string): Promise<string> {
    const b = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    if (!b)
      throw new AppException(
        HD_ERRORS.NOT_FOUND,
        'Business not found',
        HttpStatus.NOT_FOUND,
      );
    return b.parentId ?? b.id;
  }

  async branches(rootId: string): Promise<Branch[]> {
    const rows = await this.prisma.business.findMany({
      where: { OR: [{ id: rootId }, { parentId: rootId }] },
      select: { id: true, name: true, parentId: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows
      .sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0))
      .map((r) => ({ id: r.id, name: r.name }));
  }

  async timezone(rootId: string): Promise<string> {
    const b = await this.prisma.business.findUnique({
      where: { id: rootId },
      select: { timezone: true },
    });
    return b?.timezone || 'UTC';
  }

  /** The signed-in person as a Helpdesk actor, or 403 when their role has no Helpdesk access. */
  async actor(user: AuthenticatedUser): Promise<HdActor> {
    const rootId = await this.rootOf(user.businessId);
    const groupIds = (await this.branches(rootId)).map((b) => b.id);
    const memberships = await this.prisma.businessUser.findMany({
      where: { userId: user.sub, active: true, businessId: { in: groupIds } },
      include: { user: { select: { name: true } } },
    });
    const here =
      memberships.find((m) => m.businessId === user.businessId) ??
      memberships[0];
    if (!here)
      throw new AppException(
        HD_ERRORS.FORBIDDEN,
        'You are not a member of this business.',
        HttpStatus.FORBIDDEN,
      );
    const role = user.role ?? here.role;
    if (role !== Role.owner) {
      const caps = await this.caps.resolve({
        businessId: here.businessId,
        role: here.role,
        customRoleId: here.customRoleId,
      });
      if (!(caps as string[]).includes(CAPABILITIES.HELPDESK_ACCESS))
        throw new AppException(
          HD_ERRORS.FORBIDDEN,
          'Your role in this business doesn’t include Helpdesk. Ask an Owner to grant Helpdesk access in Staff › Roles.',
          HttpStatus.FORBIDDEN,
        );
    }
    return {
      userId: user.sub,
      name: here.user.name,
      role: ROLE_LABEL[role],
      ri: ROLE_RANK[role],
      rootId,
      businessId: user.businessId,
    };
  }

  /** "Request access" on the no-access screen: tells the business owners in-app who asked. */
  async requestAccess(user: AuthenticatedUser): Promise<{ notified: number }> {
    const rootId = await this.rootOf(user.businessId);
    const groupIds = (await this.branches(rootId)).map((b) => b.id);
    const [me, owners] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.sub },
        select: { name: true },
      }),
      this.prisma.businessUser.findMany({
        where: { businessId: { in: groupIds }, role: Role.owner, active: true },
        select: { userId: true, businessId: true },
      }),
    ]);
    const seen = new Set<string>();
    for (const o of owners) {
      if (seen.has(o.userId) || o.userId === user.sub) continue;
      seen.add(o.userId);
      await this.prisma.notification.create({
        data: {
          businessId: o.businessId,
          userId: o.userId,
          title: 'Helpdesk access requested',
          body: `${me?.name ?? 'A team member'} asked for access to Helpdesk. Grant “helpdesk.access” to their role in Staff › Roles.`,
          link: '/staff/roles',
          priority: NOTIFICATION_EVENT_PRIORITY.helpdesk_update,
        },
      });
    }
    return { notified: seen.size };
  }

  can(actor: HdActor, cfg: HelpdeskConfig, cap: HdCap): boolean {
    if (actor.ri === 0) return true;
    return !!cfg.perms[cap]?.[actor.ri];
  }

  assert(actor: HdActor, cfg: HelpdeskConfig, cap: HdCap, what?: string) {
    if (!this.can(actor, cfg, cap))
      throw new AppException(
        HD_ERRORS.FORBIDDEN,
        `${what ?? 'This'} needs the “${cap}” permission, which your role doesn’t have.`,
        HttpStatus.FORBIDDEN,
      );
  }

  /** Owners and managers: queue edits, KB publishing, macros, CSAT survey settings. */
  assertManager(actor: HdActor, what: string) {
    if (actor.ri > 1)
      throw new AppException(
        HD_ERRORS.FORBIDDEN,
        `${what} requires an Owner or Manager.`,
        HttpStatus.FORBIDDEN,
      );
  }

  capMap(actor: HdActor, cfg: HelpdeskConfig): Record<string, boolean> {
    return Object.fromEntries(HD_CAPS.map((c) => [c, this.can(actor, cfg, c)]));
  }

  // ── settings, seeding, numbering ─────────────────────────────────────────

  async settingsRow(rootId: string) {
    const existing = await this.prisma.helpdeskSettings.findUnique({
      where: { businessId: rootId },
    });
    if (existing) return existing;
    const tz = await this.timezone(rootId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.helpdeskSettings.create({
          data: {
            businessId: rootId,
            config: defaultConfig(tz) as unknown as Prisma.InputJsonValue,
          },
        });
        if (!(await tx.helpdeskQueue.count({ where: { businessId: rootId } })))
          await tx.helpdeskQueue.createMany({
            data: SEED_QUEUES.map((q, i) => ({
              businessId: rootId,
              name: q.name,
              description: q.description,
              systemKey: q.systemKey,
              categories: q.categories,
              method: q.method,
              sortOrder: i,
            })),
          });
        if (
          !(await tx.helpdeskSlaPolicy.count({ where: { businessId: rootId } }))
        )
          await tx.helpdeskSlaPolicy.createMany({
            data: SEED_SLAS.map((p, i) => ({
              businessId: rootId,
              name: p.name,
              applies: p.applies,
              scope: p.scope,
              priority: p.priority,
              firstResponseMins: p.fr,
              resolutionMins: p.res,
              hours: p.hours,
              pauseStatuses: ['Waiting on Customer'],
              warnPct: 75,
              sortOrder: i + 1,
            })),
          });
        return row;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        return this.prisma.helpdeskSettings.findUniqueOrThrow({
          where: { businessId: rootId },
        });
      throw e;
    }
  }

  async config(rootId: string): Promise<HelpdeskConfig> {
    const row = await this.settingsRow(rootId);
    return mergeConfig(row.config, await this.timezone(rootId));
  }

  async calendar(
    rootId: string,
    cfg?: HelpdeskConfig,
  ): Promise<Calendar | null> {
    return calendarOf((cfg ?? (await this.config(rootId))).hours);
  }

  /** Allocates the next ticket number under a row lock, so concurrent creates never share one. */
  async nextNumber(
    rootId: string,
    tx: Prisma.TransactionClient,
  ): Promise<{ number: string; seq: number }> {
    await tx.$queryRaw`SELECT id FROM helpdesk_settings WHERE business_id = ${rootId} FOR UPDATE`;
    const row = await tx.helpdeskSettings.findUniqueOrThrow({
      where: { businessId: rootId },
    });
    const cfg = mergeConfig(row.config);
    let seq = row.ticketSeq + 1;
    for (;;) {
      const number = formatNumber(cfg.general.numberFormat, seq);
      // A format change can make a new number collide with one issued under the old format.
      if (
        !(await tx.helpdeskTicket.findUnique({
          where: { businessId_number: { businessId: rootId, number } },
          select: { id: true },
        }))
      ) {
        await tx.helpdeskSettings.update({
          where: { businessId: rootId },
          data: { ticketSeq: seq },
        });
        return { number, seq };
      }
      seq++;
    }
  }

  async previewNumber(rootId: string, cfg: HelpdeskConfig): Promise<string> {
    const row = await this.settingsRow(rootId);
    return formatNumber(cfg.general.numberFormat, row.ticketSeq + 1);
  }

  async policies(rootId: string): Promise<SlaPolicyLite[]> {
    const rows = await this.prisma.helpdeskSlaPolicy.findMany({
      where: { businessId: rootId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      applies: p.applies,
      scope: p.scope,
      priority: p.priority,
      fr: p.firstResponseMins,
      res: p.resolutionMins,
      hours: p.hours,
      pause: (p.pauseStatuses as string[]) ?? [],
      warn: p.warnPct,
      active: p.active,
      order: p.sortOrder,
    }));
  }

  // ── agents (Staff) ───────────────────────────────────────────────────────

  /** Everyone in the business group whose role has Helpdesk access, with live presence and load. */
  async agents(rootId: string): Promise<Agent[]> {
    const groupIds = (await this.branches(rootId)).map((b) => b.id);
    const rows = await this.prisma.businessUser.findMany({
      where: { businessId: { in: groupIds }, active: true },
      include: {
        user: { select: { name: true, email: true } },
        customRole: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const byUser = new Map<string, typeof rows>();
    for (const r of rows)
      byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
    const now = new Date();
    const buIds = rows.map((r) => r.id);
    const [profiles, attendance, leave] = await Promise.all([
      this.prisma.helpdeskAgent.findMany({ where: { businessId: rootId } }),
      this.prisma.attendance.findMany({
        where: {
          staffUserId: { in: buIds },
          checkOut: null,
          checkIn: { gte: new Date(now.getTime() - 20 * 3600000) },
        },
        select: { staffUserId: true },
      }),
      this.prisma.timeOff.findMany({
        where: {
          staffUserId: { in: buIds },
          approved: true,
          startsAt: { lte: now },
          endsAt: { gte: now },
        },
        select: { staffUserId: true },
      }),
    ]);
    const prof = new Map(profiles.map((p) => [p.userId, p]));
    const online = new Set(attendance.map((a) => a.staffUserId));
    const away = new Set(leave.map((a) => a.staffUserId));
    const out: Agent[] = [];
    for (const [userId, list] of byUser) {
      const best = [...list].sort(
        (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role],
      )[0];
      let access = best.role === Role.owner;
      for (const m of list) {
        if (access) break;
        const c = await this.caps.resolve({
          businessId: m.businessId,
          role: m.role,
          customRoleId: m.customRoleId,
        });
        access = (c as string[]).includes(CAPABILITIES.HELPDESK_ACCESS);
      }
      if (!access) continue;
      const p = prof.get(userId);
      const ids = list.map((m) => m.id);
      out.push({
        id: userId,
        name: best.user.name,
        title:
          best.customRole?.name ??
          (best.role === Role.owner
            ? 'Owner'
            : best.role === Role.manager
              ? 'Manager'
              : 'Staff'),
        role: ROLE_LABEL[best.role],
        skills: ((p?.skills as string[]) ?? []).map(String),
        cap: p?.capacity ?? 10,
        status: ids.some((i) => away.has(i))
          ? 'Away'
          : ids.some((i) => online.has(i))
            ? 'Online'
            : 'Offline',
        homeBusinessId: best.businessId,
        email: best.user.email,
      });
    }
    return out.sort(
      (a, b) =>
        ROLE_RANK[roleKey(a.role)] - ROLE_RANK[roleKey(b.role)] ||
        a.name.localeCompare(b.name),
    );
  }

  async assertAgent(
    rootId: string,
    userId: string | null | undefined,
  ): Promise<Agent | null> {
    if (!userId) return null;
    const a = (await this.agents(rootId)).find((x) => x.id === userId);
    if (!a)
      throw new AppException(
        HD_ERRORS.INVALID,
        'That person isn’t a Helpdesk agent (no active Staff record with Helpdesk access).',
        HttpStatus.BAD_REQUEST,
      );
    return a;
  }

  async userName(userId: string | null | undefined): Promise<string> {
    if (!userId) return 'Unassigned';
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return u?.name ?? 'Former staff member';
  }

  // ── customers (CRM) ──────────────────────────────────────────────────────

  /** Lower-cased CRM segment names (rule-based segments) and tags each customer belongs to. */
  async segmentsOf(customerIds: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!customerIds.length) return out;
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, businessId: true, tags: true },
    });
    for (const c of customers)
      out.set(
        c.id,
        (Array.isArray(c.tags) ? (c.tags as unknown[]) : []).map((t) =>
          String(t).toLowerCase(),
        ),
      );
    const bizIds = [...new Set(customers.map((c) => c.businessId))];
    const segments = await this.prisma.segment.findMany({
      where: { businessId: { in: bizIds } },
      select: { businessId: true, name: true, rules: true },
    });
    for (const s of segments) {
      const ids = customers
        .filter((c) => c.businessId === s.businessId)
        .map((c) => c.id);
      if (!ids.length) continue;
      let hits: Array<{ id: string }> = [];
      try {
        hits = await this.prisma.customer.findMany({
          where: {
            AND: [
              rulesToWhere(s.rules as unknown as SegmentRules),
              { id: { in: ids } },
            ],
          },
          select: { id: true },
        });
      } catch {
        continue;
      }
      for (const h of hits)
        out.set(h.id, [
          ...new Set([s.name.toLowerCase(), ...(out.get(h.id) ?? [])]),
        ]);
    }
    return out;
  }

  /** Display segment: the first rule-based CRM segment name, else a VIP/B2B tag, else "No segment". */
  async segmentLabel(customerId: string): Promise<string> {
    const c = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { businessId: true, tags: true },
    });
    if (!c) return 'No segment';
    const segments = await this.prisma.segment.findMany({
      where: { businessId: c.businessId },
      select: { name: true, rules: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const s of segments) {
      try {
        const n = await this.prisma.customer.count({
          where: {
            AND: [
              rulesToWhere(s.rules as unknown as SegmentRules),
              { id: customerId },
            ],
          },
        });
        if (n) return s.name;
      } catch {
        /* a segment with rules this build can't evaluate is skipped, never guessed */
      }
    }
    const tags = (Array.isArray(c.tags) ? (c.tags as unknown[]) : []).map(
      String,
    );
    return tags.find((t) => /^(vip|b2b)$/i.test(t)) ?? 'No segment';
  }

  // ── audit & notifications ────────────────────────────────────────────────

  async log(
    rootId: string,
    actor: { name: string; userId?: string | null; role?: string },
    action: string,
    detail: string,
    ticketId?: string | null,
  ) {
    await this.prisma.helpdeskAudit.create({
      data: {
        businessId: rootId,
        ticketId: ticketId ?? null,
        actorUserId: actor.userId ?? null,
        actorName: (actor.role
          ? `${actor.name} (${actor.role})`
          : actor.name
        ).slice(0, 191),
        action: action.slice(0, 80),
        detail: detail.slice(0, 500),
      },
    });
  }

  /** Also records admin changes in the app-wide audit log (request context only). */
  async appAudit(
    action: string,
    entity: string,
    entityId: string,
    before?: unknown,
    after?: unknown,
  ) {
    try {
      await this.audit.log({ action, entity, entityId, before, after });
    } catch (e) {
      this.logger.warn(
        `audit log failed for ${action}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * Internal alert to agents, on the channels Settings › Notifications chose for this event.
   * In-app honours the person's own notification preference. Email goes through the platform
   * email provider. There is no staff SMS transport, so SMS is reported as not sent.
   * Returns a plain summary of what really happened (used by the escalation log).
   */
  async notify(
    rootId: string,
    userIds: Array<string | null | undefined>,
    event: NotifyEvent,
    input: { title: string; body: string; link?: string },
    opts: { except?: string | null; cfg?: HelpdeskConfig } = {},
  ): Promise<{ ok: boolean; summary: string }> {
    const cfg = opts.cfg ?? (await this.config(rootId));
    const chans = cfg.notify[event] ?? [];
    const ids = [
      ...new Set(userIds.filter((x): x is string => !!x && x !== opts.except)),
    ];
    if (!ids.length) return { ok: true, summary: 'Nobody to notify' };
    if (!chans.length)
      return {
        ok: true,
        summary: `${event} notifications are turned off in Settings`,
      };
    const groupIds = (await this.branches(rootId)).map((b) => b.id);
    let inApp = 0;
    let emailed = 0;
    const notes: string[] = [];
    for (const userId of ids) {
      const bu = await this.prisma.businessUser.findFirst({
        where: { userId, active: true, businessId: { in: groupIds } },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { email: true, name: true } } },
      });
      if (!bu) continue;
      if (chans.includes('In-app')) {
        try {
          if (
            await this.notifications.isEnabled(
              bu.businessId,
              userId,
              'helpdesk_update',
              'in_app',
            )
          ) {
            await this.prisma.notification.create({
              data: {
                businessId: bu.businessId,
                userId,
                title: input.title.slice(0, 191),
                body: input.body,
                link: input.link ?? null,
                priority: NOTIFICATION_EVENT_PRIORITY.helpdesk_update,
              },
            });
            inApp++;
          }
        } catch (e) {
          notes.push(
            `in-app to ${bu.user.name} failed: ${(e as Error).message}`,
          );
        }
      }
      if (chans.includes('Email')) {
        if (!this.env.get<string>('EMAIL_PROVIDER_KEY'))
          notes.push('email not sent — no email provider is configured');
        else if (!bu.user.email)
          notes.push(`email not sent — ${bu.user.name} has no email address`);
        else {
          try {
            await this.email.send({
              to: bu.user.email,
              text: `${input.title}\n\n${input.body}`,
              templateKey: 'helpdesk_alert',
              locale: 'en',
              businessId: bu.businessId,
            });
            emailed++;
          } catch (e) {
            notes.push(
              `email to ${bu.user.name} failed: ${(e as Error).message}`,
            );
          }
        }
      }
    }
    if (chans.includes('SMS'))
      notes.push(
        'SMS not sent — Noxtill has no SMS transport for staff alerts',
      );
    const parts = [
      chans.includes('In-app') ? `in-app delivered to ${inApp}` : null,
      chans.includes('Email') ? `email sent to ${emailed}` : null,
      ...[...new Set(notes)],
    ].filter(Boolean);
    const ok = inApp + emailed > 0;
    return {
      ok,
      summary: (parts.join(' · ') || 'Nothing delivered').replace(/^./, (c) =>
        c.toUpperCase(),
      ),
    };
  }
}

function roleKey(r: HdRole): Role {
  return r === 'Owner'
    ? Role.owner
    : r === 'Manager'
      ? Role.manager
      : Role.staff;
}

export function formatNumber(fmt: string, seq: number): string {
  const f = /\{#+\}/.test(fmt) ? fmt : 'HD-{#####}';
  return f.replace(/\{(#+)\}/, (_m, h: string) =>
    String(seq).padStart(h.length, '0'),
  );
}
