import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AuditService } from '../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  DEFAULT_NOTIFY,
  NOTIFY_KEYS,
  NotifyKey,
  PROJECT_ERRORS,
  ProjectConfig,
  defaultConfig,
  defaultPermissionMatrix,
} from './projects.constants';

export interface Person {
  /** BusinessUser id — the id every project row stores. */
  id: string;
  userId: string;
  name: string;
  role: string;
  active: boolean;
  hourlyRate: number | null;
}

type SeqField = 'taskSeq' | 'msSeq' | 'apprSeq' | 'timeSeq';

/** Date-only helpers. Every project date is a calendar day, stored as a MySQL DATE (UTC midnight). */
export function isoDay(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}
export function parseDay(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new AppException(
      PROJECT_ERRORS.INVALID,
      `"${s}" is not a valid date`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return new Date(s + 'T00:00:00.000Z');
}
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dayDiff(a: string, b: string): number {
  return Math.round(
    (new Date(a + 'T00:00:00Z').getTime() -
      new Date(b + 'T00:00:00Z').getTime()) /
      864e5,
  );
}

/**
 * Shared plumbing for every Projects service: the business config row (with the number
 * sequences), the people directory (Staff records — never duplicated), today's date in the
 * business timezone, the activity feed, audit and in-app notifications.
 */
@Injectable()
export class ProjectsContextService {
  private readonly logger = new Logger(ProjectsContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  get db() {
    return this.tenant.client;
  }

  /** Un-scoped client for interactive transactions (callers always set businessId explicitly). */
  get raw() {
    return this.prisma;
  }

  businessId(): string {
    return this.cls.get<string>(CLS_KEY_BUSINESS_ID);
  }

  async business(businessId = this.businessId()) {
    return this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        currency: true,
        timezone: true,
        parentId: true,
      },
    });
  }

  /** Today as YYYY-MM-DD in the business timezone. */
  async today(businessId = this.businessId()): Promise<string> {
    const b = await this.business(businessId);
    return todayIn(b.timezone);
  }

  // ── config ───────────────────────────────────────────────────────────────

  async settingsRow(businessId = this.businessId()) {
    const existing = await this.prisma.projectSettings.findUnique({
      where: { businessId },
    });
    if (existing) return existing;
    try {
      return await this.prisma.projectSettings.create({
        data: {
          businessId,
          config: defaultConfig() as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      // Two first-ever requests raced to create the row — the other one won; use it.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return this.prisma.projectSettings.findUniqueOrThrow({
          where: { businessId },
        });
      }
      throw e;
    }
  }

  /** Stored config merged over defaults, so a key added later never comes back undefined. */
  async config(businessId = this.businessId()): Promise<ProjectConfig> {
    const row = await this.settingsRow(businessId);
    return mergeConfig(row.config);
  }

  /**
   * Allocates the next number of a sequence under a row lock (SELECT … FOR UPDATE inside a
   * transaction — the DATABASE.md serialization pattern), so two concurrent creates can never be
   * handed the same number. Issued numbers never change.
   */
  async nextNumber(
    kind: 'project' | SeqField,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const businessId = this.businessId();
    await this.settingsRow(businessId);
    const run = async (t: Prisma.TransactionClient) => {
      const rows = await t.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM project_settings WHERE business_id = ${businessId} FOR UPDATE`;
      if (!rows.length)
        throw new AppException(
          PROJECT_ERRORS.SETTINGS_INVALID,
          'Project settings missing',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      const row = await t.projectSettings.findUniqueOrThrow({
        where: { businessId },
      });
      const cfg = mergeConfig(row.config);
      if (kind === 'project') {
        const n = Number(cfg.nextNo) || 1;
        await t.projectSettings.update({
          where: { businessId },
          data: {
            config: {
              ...cfg,
              nextNo: n + 1,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        const biz = await t.business.findUniqueOrThrow({
          where: { id: businessId },
          select: { name: true, timezone: true },
        });
        return formatProjectNumber(
          cfg,
          n,
          todayIn(biz.timezone).slice(0, 4),
          branchCodeOf(biz.name),
        );
      }
      const next = row[kind] + 1;
      await t.projectSettings.update({
        where: { businessId },
        data: { [kind]: next },
      });
      if (kind === 'taskSeq')
        return `${cfg.tprefix || 'TSK'}-${String(next).padStart(5, '0')}`;
      if (kind === 'msSeq') return `MS-${String(next).padStart(5, '0')}`;
      if (kind === 'apprSeq') return `APR-${String(next).padStart(4, '0')}`;
      return `TE-${String(next).padStart(4, '0')}`;
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  // ── people ───────────────────────────────────────────────────────────────

  async people(
    businessId = this.businessId(),
    includeInactive = true,
  ): Promise<Person[]> {
    const rows = await this.prisma.businessUser.findMany({
      where: { businessId, ...(includeInactive ? {} : { active: true }) },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.user.name,
      role: r.role,
      active: r.active,
      hourlyRate: r.hourlyRate == null ? null : Number(r.hourlyRate),
    }));
  }

  async actorPerson(actor: AuthenticatedUser): Promise<Person | null> {
    const bu = await this.prisma.businessUser.findFirst({
      where: {
        userId: actor.sub,
        businessId: { in: await this.groupIds(actor.businessId) },
      },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (!bu) return null;
    return {
      id: bu.id,
      userId: bu.userId,
      name: bu.user.name,
      role: bu.role,
      active: bu.active,
      hourlyRate: bu.hourlyRate == null ? null : Number(bu.hourlyRate),
    };
  }

  /** The BusinessUser row of the actor inside the *current* (possibly branch) business, created
   * on demand for an owner/manager switching into a branch they have no row in yet is NOT done —
   * we fall back to their home row id so ids stay real Staff records. */
  async actorPersonId(actor: AuthenticatedUser): Promise<string | null> {
    const local = await this.prisma.businessUser.findFirst({
      where: { userId: actor.sub, businessId: this.businessId() },
      select: { id: true },
    });
    if (local) return local.id;
    return (await this.actorPerson(actor))?.id ?? null;
  }

  async actorName(actor: AuthenticatedUser): Promise<string> {
    const u = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: { name: true },
    });
    return u?.name ?? 'Someone';
  }

  async groupIds(businessId: string): Promise<string[]> {
    const b = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    if (!b) return [businessId];
    const root = b.parentId ?? b.id;
    const group = await this.prisma.business.findMany({
      where: { OR: [{ id: root }, { parentId: root }] },
      select: { id: true },
    });
    return group.map((g) => g.id);
  }

  // ── feed / audit / notify ────────────────────────────────────────────────

  async activity(
    actor: AuthenticatedUser | { name: string },
    event: string,
    text: string,
    refs: { projectId?: string | null; taskId?: string | null } = {},
    businessId = this.businessId(),
  ) {
    const actorUserId = 'sub' in actor ? actor.sub : null;
    const actorName = 'sub' in actor ? await this.actorName(actor) : actor.name;
    await this.prisma.projectActivity.create({
      data: {
        businessId,
        projectId: refs.projectId ?? null,
        taskId: refs.taskId ?? null,
        actorUserId,
        actorName,
        event,
        text: text.slice(0, 500),
      },
    });
    if (refs.projectId) {
      await this.prisma.project.updateMany({
        where: { id: refs.projectId, businessId },
        data: { lastActivityAt: new Date() },
      });
    }
  }

  async auditLog(
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
   * In-app notification to a staff member (by BusinessUser id), honouring both their per-module
   * "Notify me about" toggle and their global in-app preference for `project_update`.
   */
  async notifyPerson(
    businessUserId: string | null | undefined,
    key: NotifyKey | null,
    input: { title: string; body: string; link?: string },
    exceptUserId?: string,
    businessId = this.businessId(),
  ) {
    if (!businessUserId) return;
    try {
      const bu = await this.prisma.businessUser.findFirst({
        where: {
          id: businessUserId,
          businessId: { in: await this.groupIds(businessId) },
        },
        select: { userId: true, businessId: true, active: true },
      });
      if (!bu || !bu.active || bu.userId === exceptUserId) return;
      if (key) {
        const prefs = await this.notifyPrefs(bu.userId, bu.businessId);
        if (!prefs[key]) return;
      }
      await this.notifications.create(
        bu.businessId,
        bu.userId,
        input,
        'project_update',
      );
    } catch (e) {
      this.logger.warn(`project notification failed: ${(e as Error).message}`);
    }
  }

  async notifyPrefs(
    userId: string,
    businessId = this.businessId(),
  ): Promise<Record<NotifyKey, boolean>> {
    const row = await this.prisma.projectNotifyPref.findUnique({
      where: { businessId_userId: { businessId, userId } },
    });
    const stored = (row?.prefs ?? {}) as Record<string, unknown>;
    const out = { ...DEFAULT_NOTIFY };
    for (const k of NOTIFY_KEYS)
      if (typeof stored[k] === 'boolean') out[k] = stored[k];
    return out;
  }
}

export function todayIn(timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function branchCodeOf(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'BR').padEnd(3, 'X');
}

export function formatProjectNumber(
  cfg: Pick<ProjectConfig, 'prefix' | 'year' | 'branchCode'>,
  n: number,
  year: string,
  branchCode: string,
): string {
  return `${cfg.prefix || 'PRJ'}${cfg.year ? '-' + year : ''}${cfg.branchCode ? '-' + branchCode : ''}-${String(n).padStart(5, '0')}`;
}

export function mergeConfig(raw: unknown): ProjectConfig {
  const d = defaultConfig();
  const s = (
    raw && typeof raw === 'object' ? raw : {}
  ) as Partial<ProjectConfig>;
  const perms = defaultPermissionMatrix();
  const sp = s.perms ?? {};
  for (const a of Object.keys(perms)) {
    for (const r of Object.keys(perms[a])) {
      if (typeof sp[a]?.[r] === 'boolean') perms[a][r] = sp[a][r];
    }
    perms[a].Owner = true;
  }
  return {
    ...d,
    ...s,
    statuses:
      Array.isArray(s.statuses) && s.statuses.length ? s.statuses : d.statuses,
    fields: Array.isArray(s.fields) ? s.fields : d.fields,
    perms,
  };
}
