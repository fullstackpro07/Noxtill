import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { SystemRoleOverridesService } from '../roles/system-role-overrides.service';
import { CustomRolesService } from '../roles/custom-roles.service';
import { AmActor, AmContextService, amErr } from './am-context.service';
import { AM_ERRORS, AmConfig, PERM_ROWS, mergeConfig } from './am.constants';

const LISTS = [
  'meters',
  'mtypes',
  'priorities',
  'dreasons',
  'wtypes',
  'issueTypes',
] as const;

/** Versioned asset settings + the real role-capability matrix behind Settings › Permissions. */
@Injectable()
export class AmSettingsService {
  constructor(
    private readonly ctx: AmContextService,
    private readonly overrides: SystemRoleOverridesService,
    private readonly customRoles: CustomRolesService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  /** Role columns for the matrix: Manager, Staff and this business's custom roles. Owner is always allowed. */
  async perms(a: AmActor) {
    const sys = await this.overrides.list(a.businessId);
    const custom = await this.db.customRole.findMany({
      where: { businessId: a.businessId },
      orderBy: { createdAt: 'asc' },
    });
    const roles = [
      ...sys.map((r) => ({
        key: r.role,
        label: r.role === Role.manager ? 'Manager' : 'Staff',
        caps: r.capabilities,
      })),
      ...custom.map((c) => ({
        key: `custom:${c.id}`,
        label: c.name,
        caps: c.capabilities as unknown as string[],
      })),
    ];
    const matrix: Record<string, string[]> = {};
    for (const [, cap] of PERM_ROWS)
      matrix[cap] = roles.filter((r) => r.caps.includes(cap)).map((r) => r.key);
    return { roles: roles.map(({ key, label }) => ({ key, label })), matrix };
  }

  /** What is still in use, so an option can't be removed while records reference it. */
  private async inUse(rootId: string) {
    const [meters, mtypes, statuses, wpri, rpri, dreasons, wtypes, issues] =
      await Promise.all([
        this.db.amAsset.findMany({
          where: { businessId: rootId, meterType: { not: null } },
          distinct: ['meterType'],
          select: { meterType: true },
        }),
        this.db.amWorkOrder.findMany({
          where: { businessId: rootId },
          distinct: ['type'],
          select: { type: true },
        }),
        this.db.amAsset.findMany({
          where: { businessId: rootId },
          distinct: ['status'],
          select: { status: true },
        }),
        this.db.amWorkOrder.findMany({
          where: { businessId: rootId },
          distinct: ['priority'],
          select: { priority: true },
        }),
        this.db.amRequest.findMany({
          where: { businessId: rootId },
          distinct: ['priority'],
          select: { priority: true },
        }),
        this.db.amDowntime.findMany({
          where: { businessId: rootId },
          distinct: ['reason'],
          select: { reason: true },
        }),
        this.db.amAsset.findMany({
          where: { businessId: rootId, warrantyType: { not: null } },
          distinct: ['warrantyType'],
          select: { warrantyType: true },
        }),
        this.db.amRequest.findMany({
          where: { businessId: rootId },
          distinct: ['issueType'],
          select: { issueType: true },
        }),
      ]);
    return {
      meters: meters.map((x) => x.meterType!),
      mtypes: mtypes.map((x) => x.type),
      statuses: statuses.map((x) => x.status),
      priorities: [
        ...new Set([
          ...wpri.map((x) => x.priority),
          ...rpri.map((x) => x.priority),
        ]),
      ],
      dreasons: dreasons.map((x) => x.reason),
      wtypes: wtypes.map((x) => x.warrantyType!),
      issueTypes: issues.map((x) => x.issueType),
    } as Record<string, string[]>;
  }

  async save(
    a: AmActor,
    b: {
      expectedVersion: number;
      config?: Partial<AmConfig>;
      perms?: Record<string, string[]>;
    },
  ) {
    this.ctx.need(a, 'settings', 'Changing asset settings');
    const s = await this.ctx.ensure(a.rootId);
    if (b.expectedVersion !== s.version)
      throw amErr(
        AM_ERRORS.VERSION,
        `VERSION_CONFLICT — settings are now v${s.version}. Reload and re-apply your changes.`,
        HttpStatus.CONFLICT,
      );
    const cur = mergeConfig(s.config);
    const next = mergeConfig({ ...cur, ...(b.config ?? {}) });
    // Validation (mirrors the design's saveSettings + server-side rules).
    if (
      !next.statuses.allowed.includes('Active') ||
      !next.statuses.allowed.includes('Archived')
    )
      throw amErr(
        AM_ERRORS.INVALID,
        'Validation failed — Active and Archived statuses are required.',
      );
    if (!next.numbering.prefix.trim() || next.numbering.prefix.length > 10)
      throw amErr(AM_ERRORS.INVALID, 'Prefix must be 1–10 characters.');
    if (!(
      Number.isInteger(next.numbering.pad) &&
      next.numbering.pad >= 1 &&
      next.numbering.pad <= 8
    ))
      throw amErr(AM_ERRORS.INVALID, 'Digits must be 1–8.');
    for (const [c, v] of next.condition)
      if (c !== 'Unknown' && !(typeof v === 'number' && v >= 0 && v <= 100))
        throw amErr(AM_ERRORS.INVALID, `${c} needs a score from 0 to 100.`);
    if (next.condition.find((c) => c[0] === 'Unknown')?.[1] != null)
      throw amErr(AM_ERRORS.INVALID, 'Unknown is never scored.');
    for (const r of next.criticality) {
      if (r.escalateHours != null && !(r.escalateHours > 0))
        throw amErr(
          AM_ERRORS.INVALID,
          `${r.level}: escalation hours must be above zero (or blank for none).`,
        );
      if (!(r.approvalAbove >= 0))
        throw amErr(
          AM_ERRORS.INVALID,
          `${r.level}: approval threshold must be zero or more.`,
        );
      if (!['Owner', 'Manager', 'Team', 'None'].includes(r.escalateTo))
        throw amErr(
          AM_ERRORS.INVALID,
          `${r.level}: unknown escalation target.`,
        );
    }
    if (!(
      Number.isInteger(next.pm.lead) &&
      next.pm.lead >= 0 &&
      next.pm.lead <= 90
    ))
      throw amErr(AM_ERRORS.INVALID, 'Lead time must be 0–90 days.');
    for (const k of LISTS)
      if (!next[k].length)
        throw amErr(AM_ERRORS.INVALID, `Keep at least one option in ${k}.`);
    const used = await this.inUse(a.rootId);
    const removed = (k: string, before: string[], after: string[]) =>
      before.filter((x) => !after.includes(x) && (used[k] ?? []).includes(x));
    for (const k of LISTS) {
      const r = removed(k, cur[k], next[k]);
      if (r.length)
        throw amErr(
          AM_ERRORS.CONFLICT,
          `“${r.join('”, “')}” is in use — records still reference it, so it can’t be removed.`,
          HttpStatus.CONFLICT,
        );
    }
    const rs = removed('statuses', cur.statuses.allowed, next.statuses.allowed);
    if (rs.length)
      throw amErr(
        AM_ERRORS.CONFLICT,
        `“${rs.join('”, “')}” is in use by assets and can’t be removed.`,
        HttpStatus.CONFLICT,
      );
    const changed = (Object.keys(next) as (keyof AmConfig)[]).filter(
      (k) => JSON.stringify(cur[k]) !== JSON.stringify(next[k]),
    );

    // Permissions → real role capabilities (Manager/Staff overrides and custom roles).
    let permChanged = false;
    if (b.perms) {
      const now = await this.perms(a);
      const keys = now.roles.map((r) => r.key);
      for (const roleKey of keys) {
        const want = new Set(
          PERM_ROWS.filter(([, cap]) =>
            (b.perms![cap] ?? now.matrix[cap]).includes(roleKey),
          ).map(([, cap]) => cap),
        );
        const had = new Set(
          PERM_ROWS.filter(([, cap]) => now.matrix[cap].includes(roleKey)).map(
            ([, cap]) => cap,
          ),
        );
        if ([...want].sort().join() === [...had].sort().join()) continue;
        permChanged = true;
        if (roleKey.startsWith('custom:')) {
          const id = roleKey.slice(7);
          const role = await this.db.customRole.findFirst({
            where: { id, businessId: a.businessId },
          });
          if (!role) continue;
          const caps = (role.capabilities as unknown as string[])
            .filter((c) => !c.startsWith('assets.'))
            .concat([...want]);
          await this.customRoles.update(id, { capabilities: caps });
        } else {
          const base = (await this.overrides.list(a.businessId)).find(
            (r) => r.role === roleKey,
          );
          const caps = ((base?.capabilities as string[]) ?? [])
            .filter((c) => !c.startsWith('assets.'))
            .concat([...want]);
          await this.overrides.update(a.businessId, roleKey, caps);
        }
      }
    }
    if (!changed.length && !permChanged)
      return { version: s.version, changed: [] };
    const version = s.version + 1;
    await this.db.$transaction([
      this.db.amSettings.update({
        where: { businessId: a.rootId },
        data: { config: next as unknown as Prisma.InputJsonValue, version },
      }),
      this.db.amSettingsVersion.create({
        data: {
          businessId: a.rootId,
          version,
          config: next as unknown as Prisma.InputJsonValue,
          changed: [...changed, ...(permChanged ? ['perms'] : [])],
          byUserId: a.userId,
        },
      }),
    ]);
    for (const c of [...changed, ...(permChanged ? ['perms'] : [])])
      await this.ctx.audit(
        a.rootId,
        a,
        'Asset settings changed',
        'settings',
        a.rootId,
        `${c} · v${version}`,
        {
          before: c === 'perms' ? undefined : cur[c as keyof AmConfig],
          after: c === 'perms' ? b.perms : next[c as keyof AmConfig],
        },
      );
    return {
      version,
      changed: [...changed, ...(permChanged ? ['perms'] : [])],
    };
  }
}
