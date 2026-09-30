import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  ProjectsContextService,
  branchCodeOf,
  formatProjectNumber,
  mergeConfig,
} from './projects-context.service';
import { ProjectsPermissionsService } from './projects-permissions.service';
import {
  ARCHIVE_DAYS,
  CLIENT_APPLICABLE_AREAS,
  DEFAULT_STATUSES,
  INVITE_DAYS,
  NOTIFY_KEYS,
  PERMISSION_AREAS,
  PRIORITIES,
  PROJECT_ERRORS,
  PROJECT_ROLES,
  ProjectConfig,
} from './projects.constants';

const FIELD_TYPES = [
  'Text',
  'Long Text',
  'Number',
  'Currency',
  'Percentage',
  'Date',
  'Date Time',
  'Dropdown',
  'Multi-select',
  'Checkbox',
  'User',
  'Customer',
  'URL',
];
const CATS = ['Not started', 'In progress', 'Paused', 'Done', 'Closed'];

@Injectable()
export class ProjectSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ctx: ProjectsContextService,
    private readonly perms: ProjectsPermissionsService,
  ) {}

  async get(actor: AuthenticatedUser) {
    const acc = await this.perms.access(actor);
    const cfg = await this.ctx.config();
    const biz = await this.ctx.business();
    const people = await this.ctx.people(undefined, false);
    const roles = await this.prisma.projectRoleAssignment.findMany({
      where: { businessId: this.ctx.businessId() },
    });
    const roleMap = new Map(roles.map((r) => [r.businessUserId, r.role]));
    const billMap = new Map(
      roles
        .filter((r) => r.billRate != null)
        .map((r) => [r.businessUserId, Number(r.billRate)]),
    );
    const prefs = await this.ctx.notifyPrefs(actor.sub);
    return {
      config: cfg,
      canManage: acc.can['Manage settings'],
      canManageBudgets: acc.can['Manage budgets'],
      numberPreview: formatProjectNumber(
        cfg,
        cfg.nextNo,
        (await this.ctx.today()).slice(0, 4),
        branchCodeOf(biz.name),
      ),
      roles: PROJECT_ROLES,
      areas: PERMISSION_AREAS,
      clientAreas: CLIENT_APPLICABLE_AREAS,
      fieldTypes: FIELD_TYPES,
      people: people.map((p) => ({
        id: p.id,
        name: p.name,
        systemRole: p.role,
        projectRole:
          p.role === Role.owner
            ? 'Owner'
            : (roleMap.get(p.id) ??
              (p.role === Role.manager ? 'Project Manager' : 'Staff')),
        locked: p.role === Role.owner,
        costRate: p.hourlyRate,
        billRate: billMap.get(p.id) ?? null,
      })),
      notify: prefs,
    };
  }

  async save(actor: AuthenticatedUser, next: Partial<ProjectConfig>) {
    await this.perms.assert(actor, 'Manage settings');
    const row = await this.ctx.settingsRow();
    const cur = mergeConfig(row.config);
    const cfg = mergeConfig({ ...cur, ...next });
    // Validate everything the UI can send.
    if (
      !/^[A-Za-z0-9]{1,8}$/.test(cfg.prefix) ||
      !/^[A-Za-z0-9]{1,8}$/.test(cfg.tprefix)
    )
      throw bad('Prefixes must be 1–8 letters or digits.');
    cfg.nextNo = Math.round(Number(cfg.nextNo));
    if (!(cfg.nextNo >= cur.nextNo))
      throw bad(
        `Next number can’t go below ${cur.nextNo} — issued IDs never change.`,
      );
    if (!(PRIORITIES as readonly string[]).includes(cfg.defPri))
      throw bad('Unknown default priority.');
    if (!['Private', 'Team', 'Organization'].includes(cfg.defVis))
      throw bad('Unknown visibility.');
    cfg.wipLimit = Math.round(Number(cfg.wipLimit));
    if (!(cfg.wipLimit >= 1 && cfg.wipLimit <= 50))
      throw bad('WIP limit must be between 1 and 50.');
    if (!(cfg.archiveDays in ARCHIVE_DAYS))
      throw bad('Unknown archive period.');
    if (!(cfg.inviteExp in INVITE_DAYS)) throw bad('Unknown invite expiry.');
    // Statuses: system ones stay, names unique and non-empty.
    const names = cfg.statuses.map((s) => (s.name || '').trim());
    if (
      names.some((n) => !n) ||
      new Set(names.map((n) => n.toLowerCase())).size !== names.length
    )
      throw bad('Status names must be unique and not empty.');
    for (const sys of DEFAULT_STATUSES.filter((s) => s.locked)) {
      const found = cfg.statuses.find((s) => s.name === sys.name);
      if (!found)
        throw bad(
          `“${sys.name}” is a system status and can’t be renamed or removed.`,
        );
      found.locked = true;
      found.cat = sys.cat;
    }
    cfg.statuses = cfg.statuses.map((s) => ({
      name: s.name.trim().slice(0, 40),
      cat: CATS.includes(s.cat) ? s.cat : 'In progress',
      c: /^#[0-9A-Fa-f]{6}$/.test(s.c) ? s.c : '#12A150',
      locked: !!DEFAULT_STATUSES.find((d) => d.locked && d.name === s.name),
    }));
    const removed = cur.statuses
      .filter((s) => !cfg.statuses.some((n) => n.name === s.name))
      .map((s) => s.name);
    if (removed.length) {
      const inUse = await this.ctx.db.project.count({
        where: { status: { in: removed } },
      });
      if (inUse)
        throw bad(
          `Can’t remove ${removed.join(', ')} — ${inUse} project${inUse > 1 ? 's use' : ' uses'} it.`,
        );
    }
    if (!cfg.statuses.some((s) => s.name === cfg.defStatus))
      throw bad('Default status must be one of the statuses.');
    cfg.fields = cfg.fields
      .filter((f) => f && f.name?.trim())
      .map((f) => ({
        name: f.name.trim().slice(0, 60),
        type: FIELD_TYPES.includes(f.type) ? f.type : 'Text',
        applies: f.applies === 'Task' ? 'Task' : 'Project',
        client:
          f.client === 'Client visible' ? 'Client visible' : 'Internal only',
      }));
    for (const a of PERMISSION_AREAS) {
      cfg.perms[a].Owner = true;
      if (!CLIENT_APPLICABLE_AREAS.includes(a)) cfg.perms[a].Client = false;
    }
    if (cfg.defMgr) {
      const ok = await this.prisma.businessUser.findFirst({
        where: {
          id: cfg.defMgr,
          businessId: this.ctx.businessId(),
          active: true,
        },
      });
      if (!ok) cfg.defMgr = null;
    }
    await this.ctx.db.projectSettings.update({
      where: { businessId: this.ctx.businessId() },
      data: { config: cfg as unknown as Prisma.InputJsonValue },
    });
    await this.ctx.auditLog(
      'project_settings.updated',
      'ProjectSettings',
      row.id,
      cur,
      cfg,
    );
    await this.ctx.activity(
      actor,
      'settings.updated',
      'updated project settings',
      {},
    );
    return { ok: true };
  }

  async setRole(
    actor: AuthenticatedUser,
    businessUserId: string,
    role: string,
  ) {
    await this.perms.assert(actor, 'Manage settings');
    if (
      !(PROJECT_ROLES as readonly string[]).includes(role) ||
      role === 'Client' ||
      role === 'Owner'
    )
      throw bad('Pick a staff project role.');
    const bu = await this.prisma.businessUser.findFirst({
      where: { id: businessUserId, businessId: this.ctx.businessId() },
    });
    if (!bu) throw bad('That person is not on this business’s staff.');
    if (bu.role === Role.owner)
      throw bad('The business owner always holds the Owner project role.');
    await this.ctx.db.projectRoleAssignment.upsert({
      where: {
        businessId_businessUserId: {
          businessId: this.ctx.businessId(),
          businessUserId,
        },
      },
      update: { role },
      create: { businessId: this.ctx.businessId(), businessUserId, role },
    });
    await this.ctx.auditLog(
      'project_role.assigned',
      'BusinessUser',
      businessUserId,
      undefined,
      { role },
    );
    return { ok: true };
  }

  /** Project bill rate per person — what their billable project hours are charged at. */
  async setBillRate(
    actor: AuthenticatedUser,
    businessUserId: string,
    rate: number | null,
  ) {
    await this.perms.assert(actor, 'Manage budgets');
    if (rate != null && (!Number.isFinite(rate) || rate < 0 || rate > 100000))
      throw bad('Enter a bill rate between 0 and 100,000 per hour.');
    const bu = await this.prisma.businessUser.findFirst({
      where: { id: businessUserId, businessId: this.ctx.businessId() },
    });
    if (!bu) throw bad('That person is not on this business’s staff.');
    const role =
      bu.role === Role.owner
        ? 'Owner'
        : bu.role === Role.manager
          ? 'Project Manager'
          : 'Staff';
    const billRate = rate == null ? null : new Prisma.Decimal(rate);
    await this.ctx.db.projectRoleAssignment.upsert({
      where: {
        businessId_businessUserId: {
          businessId: this.ctx.businessId(),
          businessUserId,
        },
      },
      update: { billRate },
      create: {
        businessId: this.ctx.businessId(),
        businessUserId,
        role,
        billRate,
      },
    });
    await this.ctx.auditLog(
      'project_rate.set',
      'BusinessUser',
      businessUserId,
      undefined,
      { billRate: rate },
    );
    return { ok: true };
  }

  async setNotify(actor: AuthenticatedUser, prefs: Record<string, boolean>) {
    const clean = Object.fromEntries(NOTIFY_KEYS.map((k) => [k, !!prefs[k]]));
    await this.ctx.db.projectNotifyPref.upsert({
      where: {
        businessId_userId: {
          businessId: this.ctx.businessId(),
          userId: actor.sub,
        },
      },
      update: { prefs: clean },
      create: {
        businessId: this.ctx.businessId(),
        userId: actor.sub,
        prefs: clean,
      },
    });
    return { ok: true };
  }
}

function bad(msg: string) {
  return new AppException(
    PROJECT_ERRORS.SETTINGS_INVALID,
    msg,
    HttpStatus.BAD_REQUEST,
  );
}
