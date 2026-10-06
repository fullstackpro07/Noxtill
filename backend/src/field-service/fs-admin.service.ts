import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FsActor,
  FsContextService,
  dec,
  fsErr,
  notFound,
} from './fs-context.service';
import { FS_ERRORS, FsConfig, PRIORITIES, mergeFsConfig } from './fs.constants';

/** A setting value for the change log (absent values read “(not set)”). */
const show = (v: unknown) =>
  v === undefined ? '(not set)' : JSON.stringify(v);

/** Sections whose changes need a reason (fs-ui.js saveSettings high-impact list). */
const HIGH_RISK = ['approvals', 'proof', 'sla', 'labor', 'tech', 'offline'];

export interface ServiceTypeIn {
  code: string;
  name: string;
  skill: string;
  cert?: string | null;
  durMin: number;
  priority: string;
  proof: string;
  partProductIds: string[];
  laborProductId?: string | null;
  active?: boolean;
}

/**
 * Field Service settings (versioned config with validation and audit) and the records the
 * settings screen manages directly: service types, technician profiles and customer sites.
 */
@Injectable()
export class FsAdminService {
  constructor(private readonly ctx: FsContextService) {}

  private get db() {
    return this.ctx.db;
  }

  private changes(before: FsConfig, after: FsConfig) {
    const out: string[] = [];
    for (const k of Object.keys(after) as (keyof FsConfig)[]) {
      if (k === 'lock') continue;
      const a = after[k] as unknown;
      const b = before[k] as unknown;
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      if (
        a &&
        typeof a === 'object' &&
        !Array.isArray(a) &&
        b &&
        typeof b === 'object' &&
        !Array.isArray(b)
      ) {
        for (const f of new Set([...Object.keys(a), ...Object.keys(b)]))
          if (
            JSON.stringify((a as Record<string, unknown>)[f]) !==
            JSON.stringify((b as Record<string, unknown>)[f])
          )
            out.push(
              `${k}.${f}: ${show((b as Record<string, unknown>)[f])} → ${show((a as Record<string, unknown>)[f])}`,
            );
      } else out.push(`${k}: ${show(b)} → ${show(a)}`);
    }
    return out;
  }

  /** Preview of what a save would change and whether it needs a reason. */
  async diff(a: FsActor, config: Partial<FsConfig>) {
    const cur = await this.ctx.config(a.rootId);
    const next = mergeFsConfig({ ...cur, ...config, lock: cur.lock });
    const ch = this.changes(cur, next);
    return {
      changes: ch,
      needsReason: ch.some((c) =>
        HIGH_RISK.includes(c.split('.')[0].split(':')[0]),
      ),
    };
  }

  async save(
    a: FsActor,
    b: { expectedVersion: number; config: Partial<FsConfig>; reason?: string },
  ) {
    this.ctx.need(a, 'settings', 'Changing Field Service settings');
    const s = await this.ctx.ensure(a.rootId);
    if (s.version !== b.expectedVersion)
      throw fsErr(
        FS_ERRORS.CONFLICT,
        `Settings changed since you opened them (now v${s.version}). Reload — nothing was overwritten.`,
        HttpStatus.CONFLICT,
      );
    const cur = mergeFsConfig(s.config);
    const next = mergeFsConfig({ ...cur, ...b.config, lock: cur.lock });
    const v = (m: string) =>
      fsErr(FS_ERRORS.INVALID, `VALIDATION_ERROR — ${m}`);
    if (!next.priorities.length) throw v('keep at least one priority.');
    if (next.priorities.some((p) => !PRIORITIES.includes(p)))
      throw v('unknown priority.');
    if (!(next.dispatch.maxJobsPerDay >= 1))
      throw v('max jobs per day must be at least 1.');
    if (!['Assigned', 'Dispatched', 'Never'].includes(next.dispatch.lockAfter))
      throw v('lock rule must be Assigned, Dispatched or Never.');
    for (const p of PRIORITIES) {
      const x = next.sla[p];
      if (
        !Array.isArray(x) ||
        x.length !== 3 ||
        x.some((n) => !(Number(n) > 0)) ||
        x[0] > x[1] ||
        x[1] > x[2]
      )
        throw v(
          `${p} SLA needs three increasing hours: response, arrival, resolution.`,
        );
    }
    for (const k of ['wo', 'sr'] as const)
      if (!/\{0+\}/.test(next.numbering[k]))
        throw v(
          `${k === 'wo' ? 'work order' : 'request'} pattern needs a {000} counter.`,
        );
    if (!(next.labor.roundMin >= 1 && next.labor.roundMin <= 60))
      throw v('labor rounding must be 1–60 minutes.');
    if (!(next.labor.overtimeAfter >= 1 && next.labor.overtimeAfter <= 24))
      throw v('overtime threshold must be 1–24 hours.');
    if (!(next.parts.highValue >= 0))
      throw v('high-value threshold can’t be negative.');
    if (!(next.pm.leadDays >= 0 && next.pm.leadDays <= 90))
      throw v('PM lead time must be 0–90 days.');
    if (!(next.warranty.repeatWindowDays >= 1))
      throw v('repeat window must be at least 1 day.');
    if (!(next.tech.retentionDays >= 1))
      throw v('location retention must be at least 1 day.');
    if (!(next.offline.maxHours >= 1))
      throw v('max offline hours must be at least 1.');
    for (const k of ['same', 'adj', 'other'] as const)
      if (!(next.travel[k] >= 0))
        throw v('travel estimates can’t be negative.');
    const removedZones = cur.territories.filter(
      (z) => !next.territories.includes(z),
    );
    if (removedZones.length) {
      const [techs, sites] = await Promise.all([
        this.db.fsTechnician.findMany({
          where: { businessId: a.rootId, active: true },
        }),
        this.db.fsSite.findMany({
          where: {
            businessId: a.rootId,
            zone: { in: removedZones },
            active: true,
          },
          select: { label: true, zone: true },
        }),
      ]);
      const t = techs.find((x) =>
        ((x.territories as string[]) ?? []).some((z) =>
          removedZones.includes(z),
        ),
      );
      if (t)
        throw v(
          `“${removedZones.join(', ')}” is still assigned to technicians — reassign them first.`,
        );
      if (sites.length)
        throw v(`“${sites[0].zone}” is still used by site ${sites[0].label}.`);
    }
    const removedSkills = cur.skills.filter((z) => !next.skills.includes(z));
    if (removedSkills.length) {
      const svc = await this.db.fsServiceType.findFirst({
        where: { businessId: a.rootId, skill: { in: removedSkills } },
      });
      if (svc)
        throw v(`“${svc.skill}” is the skill of service type ${svc.name}.`);
    }
    next.adj = Object.fromEntries(
      Object.entries(next.adj ?? {})
        .filter(([z]) => next.territories.includes(z))
        .map(([z, L]) => [
          z,
          (L ?? []).filter((x) => next.territories.includes(x) && x !== z),
        ]),
    );
    const ch = this.changes(cur, next);
    if (!ch.length) return { version: s.version, changed: [] as string[] };
    if (
      ch.some((c) => HIGH_RISK.includes(c.split('.')[0].split(':')[0])) &&
      !b.reason?.trim()
    )
      throw fsErr(
        'REASON_REQUIRED',
        `High-impact change — give a reason:\n${ch.join('\n')}`,
      );
    const version = s.version + 1;
    await this.db.$transaction(async (tx) => {
      const r = await tx.fsSettings.updateMany({
        where: { businessId: a.rootId, version: s.version },
        data: { config: next as unknown as Prisma.InputJsonValue, version },
      });
      if (!r.count)
        throw fsErr(
          FS_ERRORS.CONFLICT,
          'Settings changed while you were saving. Reload — nothing was overwritten.',
          HttpStatus.CONFLICT,
        );
      await tx.fsSettingsVersion.create({
        data: {
          businessId: a.rootId,
          version,
          config: next as unknown as Prisma.InputJsonValue,
          changed: ch,
          reason: b.reason?.slice(0, 500) || null,
          byUserId: a.userId,
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Field Service settings saved',
        'settings',
        a.rootId,
        `v${version} · ${ch.join('; ')}${b.reason ? ` · reason: ${b.reason}` : ''} · event field_service_settings.changed`,
        { tx },
      );
    });
    return { version, changed: ch };
  }

  // ── service types ───────────────────────────────────────────────────────

  async saveServiceType(a: FsActor, id: string | null, b: ServiceTypeIn) {
    this.ctx.need(a, 'settings', 'Managing service types');
    const cfg = await this.ctx.config(a.rootId);
    const code = b.code?.trim().toUpperCase().slice(0, 16);
    if (!code || !b.name?.trim())
      throw fsErr(FS_ERRORS.INVALID, 'Code and name are required.');
    if (!cfg.skills.includes(b.skill))
      throw fsErr(FS_ERRORS.INVALID, 'Pick a skill from Settings › Skills.');
    if (b.cert && !cfg.certs.includes(b.cert))
      throw fsErr(
        FS_ERRORS.INVALID,
        'Pick a certification from Settings › Skills & certifications.',
      );
    if (!(b.durMin >= 15 && b.durMin <= 1440))
      throw fsErr(FS_ERRORS.INVALID, 'Duration must be 15–1440 minutes.');
    if (!PRIORITIES.includes(b.priority))
      throw fsErr(FS_ERRORS.INVALID, 'Pick a default priority.');
    const group = (await this.ctx.branches(a.rootId)).map((g) => g.id);
    const parts = b.partProductIds?.length
      ? await this.db.product.findMany({
          where: {
            id: { in: b.partProductIds },
            businessId: { in: group },
            kind: 'product',
          },
          select: { id: true },
        })
      : [];
    if (
      b.laborProductId &&
      !(await this.db.product.findFirst({
        where: {
          id: b.laborProductId,
          businessId: { in: group },
          kind: 'service',
        },
      }))
    )
      throw fsErr(
        FS_ERRORS.INVALID,
        'The labor product must be a service in Products & Services.',
      );
    const dup = await this.db.fsServiceType.findFirst({
      where: { businessId: a.rootId, code, ...(id ? { id: { not: id } } : {}) },
    });
    if (dup)
      throw fsErr(
        FS_ERRORS.INVALID,
        `Code ${code} is already used by ${dup.name}.`,
      );
    const data = {
      code,
      name: b.name.trim().slice(0, 120),
      skill: b.skill,
      cert: b.cert || null,
      durMin: Math.round(b.durMin),
      priority: b.priority,
      proof: (b.proof || 'Signature').slice(0, 60),
      partProductIds: parts.map((p) => p.id),
      laborProductId: b.laborProductId || null,
    };
    if (id) {
      const x = await this.db.fsServiceType.findFirst({
        where: { id, businessId: a.rootId },
      });
      if (!x) throw notFound('Service type');
      await this.db.fsServiceType.update({ where: { id }, data });
    } else
      await this.db.fsServiceType.create({
        data: { ...data, businessId: a.rootId, active: b.active ?? true },
      });
    await this.ctx.audit(
      a.rootId,
      a,
      id ? 'Service type updated' : 'Service type added',
      'svc',
      id ?? code,
      `${code} · ${data.name} · ${data.skill} · ${data.durMin} min`,
    );
    return { ok: true, msg: `${data.name} saved.` };
  }

  async toggleServiceType(a: FsActor, id: string, active: boolean) {
    this.ctx.need(a, 'settings', 'Managing service types');
    const x = await this.db.fsServiceType.findFirst({
      where: { id, businessId: a.rootId },
    });
    if (!x) throw notFound('Service type');
    await this.db.fsServiceType.update({ where: { id }, data: { active } });
    await this.ctx.audit(
      a.rootId,
      a,
      `Service type ${active ? 'activated' : 'deactivated'}`,
      'svc',
      id,
      x.name,
    );
    return { ok: true };
  }

  // ── technicians ─────────────────────────────────────────────────────────

  async saveTechnician(
    a: FsActor,
    b: {
      userId: string;
      skills: string[];
      certs: string[];
      territories: string[];
      shiftStart: number;
      shiftEnd: number;
      tracking: boolean;
      active: boolean;
    },
  ) {
    this.ctx.need(a, 'settings', 'Managing technicians');
    const cfg = await this.ctx.config(a.rootId);
    const members = await this.ctx.members(a.rootId);
    const m = members.find((x) => x.id === b.userId);
    if (!m) throw fsErr(FS_ERRORS.INVALID, 'Pick an active staff member.');
    if (!(b.shiftStart >= 0 && b.shiftEnd <= 24 && b.shiftEnd > b.shiftStart))
      throw fsErr(
        FS_ERRORS.INVALID,
        'Default shift end must be after its start (hours 0–24).',
      );
    const data = {
      skills: b.skills.filter((x) => cfg.skills.includes(x)),
      certs: b.certs.filter((x) => cfg.certs.includes(x)),
      territories: b.territories.filter((x) => cfg.territories.includes(x)),
      shiftStart: dec(b.shiftStart),
      shiftEnd: dec(b.shiftEnd),
      tracking: !!b.tracking,
      active: !!b.active,
    };
    await this.db.fsTechnician.upsert({
      where: { businessId_userId: { businessId: a.rootId, userId: b.userId } },
      create: { ...data, businessId: a.rootId, userId: b.userId },
      update: data,
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Technician profile saved',
      'tech',
      b.userId,
      `${m.name} · ${data.skills.join(', ') || 'no skills'} · ${data.territories.join(', ') || 'no territories'}${data.active ? '' : ' · inactive'}`,
    );
    return { ok: true, msg: `${m.name} saved.` };
  }

  /** Break / Off Duty for today (the technician or a dispatcher); "" clears it. */
  async techStatus(a: FsActor, userId: string, st: string) {
    if (userId !== a.userId)
      this.ctx.need(a, 'dispatch', 'Changing another technician’s status');
    else this.ctx.need(a, 'execute', 'Changing your status');
    if (!['', 'Break', 'Off Duty'].includes(st))
      throw fsErr(FS_ERRORS.INVALID, 'Pick Break, Off Duty or clear.');
    const r = await this.db.fsTechnician.updateMany({
      where: { businessId: a.rootId, userId },
      data: { manualStatus: st || null },
    });
    if (!r.count) throw notFound('Technician profile');
    await this.ctx.audit(
      a.rootId,
      a,
      'Technician status',
      'tech',
      userId,
      st || 'cleared (derived from jobs and shifts)',
    );
    return { ok: true };
  }

  // ── sites & equipment ───────────────────────────────────────────────────

  async saveSite(
    a: FsActor,
    id: string | null,
    b: {
      customerId: string;
      label?: string;
      address: string;
      zone: string;
      access?: string;
      safety?: string;
      active?: boolean;
    },
  ) {
    if (!a.request && !a.workorder && !a.settings)
      this.ctx.need(a, 'request', 'Managing customer sites');
    const cfg = await this.ctx.config(a.rootId);
    const group = (await this.ctx.branches(a.rootId)).map((g) => g.id);
    if (
      !(await this.db.customer.findFirst({
        where: { id: b.customerId, businessId: { in: group } },
      }))
    )
      throw fsErr(FS_ERRORS.INVALID, 'Pick a customer.');
    if (!b.address?.trim()) throw fsErr(FS_ERRORS.INVALID, 'Address required.');
    if (!cfg.territories.includes(b.zone))
      throw fsErr(
        FS_ERRORS.INVALID,
        'Pick a territory (Settings › Territories).',
      );
    const data = {
      customerId: b.customerId,
      label: (b.label || b.address).trim().slice(0, 120),
      address: b.address.trim().slice(0, 255),
      zone: b.zone,
      access: b.access?.trim() || null,
      safety: b.safety?.trim() || null,
      active: b.active ?? true,
    };
    if (id) {
      const x = await this.db.fsSite.findFirst({
        where: { id, businessId: a.rootId },
      });
      if (!x) throw notFound('Site');
      await this.db.fsSite.update({ where: { id }, data });
    } else
      await this.db.fsSite.create({ data: { ...data, businessId: a.rootId } });
    await this.ctx.audit(
      a.rootId,
      a,
      id ? 'Customer site updated' : 'Customer site added',
      'site',
      id ?? data.label,
      `${data.label} · ${data.zone}`,
    );
    return { ok: true, msg: `${data.label} saved.` };
  }

  /** Install location of customer equipment (the asset stays in Assets & Maintenance). */
  async equipmentSite(a: FsActor, assetId: string, siteId: string) {
    if (!a.request && !a.workorder)
      this.ctx.need(a, 'workorder', 'Setting equipment sites');
    const x = await this.db.amAsset.findFirst({
      where: { id: assetId, businessId: a.rootId },
    });
    if (!x) throw notFound('Asset');
    const s = await this.db.fsSite.findFirst({
      where: { id: siteId, businessId: a.rootId },
    });
    if (!s) throw notFound('Site');
    if (x.customerId && x.customerId !== s.customerId)
      throw fsErr(FS_ERRORS.INVALID, 'That site belongs to another customer.');
    await this.db.fsEquipmentSite.upsert({
      where: { assetId },
      create: { businessId: a.rootId, assetId, siteId },
      update: { siteId },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Equipment site set',
      'asset',
      assetId,
      `${x.number} → ${s.label}`,
    );
    return { ok: true, msg: `${x.number} is installed at ${s.label}.` };
  }
}
