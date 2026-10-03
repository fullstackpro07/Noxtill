import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { S3Service } from '../common/storage/s3.service';
import {
  AmActor,
  AmContextService,
  Tx,
  amErr,
  corrId,
  dec,
  num,
} from './am-context.service';
import {
  AM_ERRORS,
  ASSET_T,
  CONDITIONS,
  FINAL_ASSET,
  LEVELS,
  METER_UNITS,
  OPEN_REQ,
  OWNER_TYPES,
} from './am.constants';

export interface AssetInput {
  name?: string;
  number?: string;
  tag?: string;
  barcode?: string;
  serial?: string;
  description?: string;
  categoryId?: string;
  status?: string;
  criticality?: string;
  condition?: string;
  manufacturer?: string;
  model?: string;
  ownerType?: string;
  customerId?: string;
  locationId?: string;
  branchId?: string;
  teamId?: string;
  parentId?: string;
  productId?: string;
  finAssetId?: string;
  purchasedOn?: string;
  installedOn?: string;
  cost?: number | null;
  warrantyProvider?: string;
  warrantyType?: string;
  warrantyStart?: string;
  warrantyEnd?: string;
  meterType?: string;
  initialReading?: number | null;
  templateId?: string;
  dupOk?: boolean;
  expectedVersion?: number;
  custom?: Record<string, unknown>;
}

const day = (s?: string | null) =>
  s ? new Date(`${s.slice(0, 10)}T00:00:00Z`) : null;
/** Audit-friendly value text. */
const show = (v: unknown) =>
  v == null || v === ''
    ? '—'
    : v instanceof Date
      ? v.toISOString().slice(0, 10)
      : typeof v === 'string'
        ? v
        : typeof v === 'number' || typeof v === 'boolean'
          ? String(v)
          : JSON.stringify(v);
const clean = (s?: string | null) => {
  const v = (s ?? '').trim();
  return v ? v : null;
};

/** Asset register writes: create/edit with duplicate + version checks, lifecycle, transfer, bulk, documents. */
@Injectable()
export class AmAssetsService {
  constructor(
    private readonly ctx: AmContextService,
    private readonly s3: S3Service,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  async must(rootId: string, id: string) {
    const a = await this.db.amAsset.findFirst({
      where: { id, businessId: rootId },
    });
    if (!a)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'ASSET_NOT_FOUND — that asset isn’t in this business.',
        HttpStatus.NOT_FOUND,
      );
    return a;
  }

  /** Branch for a location (or an explicit branch), validated against the group. */
  private async placement(
    a: AmActor,
    locationId?: string | null,
    branchId?: string | null,
  ) {
    const group = await this.ctx.branches(a.rootId);
    if (locationId) {
      const l = await this.db.amLocation.findFirst({
        where: { id: locationId, businessId: a.rootId },
      });
      if (!l)
        throw amErr(AM_ERRORS.INVALID, 'That location isn’t in this business.');
      if (l.status !== 'Active')
        throw amErr(
          AM_ERRORS.INVALID,
          `${l.name} is inactive — pick an active location.`,
        );
      return { locationId: l.id, branchId: l.branchId };
    }
    const b =
      branchId && group.some((g) => g.id === branchId) ? branchId : null;
    return { locationId: null, branchId: b ?? a.branches?.[0] ?? a.businessId };
  }

  private async dupCheck(
    rootId: string,
    p: AssetInput,
    exceptId: string | null,
  ) {
    const cfg = await this.ctx.config(rootId);
    const uniq = cfg.numbering.unique;
    const or: Prisma.AmAssetWhereInput[] = [];
    const tag = clean(p.tag);
    const serial = clean(p.serial);
    const bc = clean(p.barcode);
    if (tag && uniq.includes('Asset tag')) or.push({ tag });
    if (serial && uniq.includes('Serial number')) or.push({ serial });
    if (bc && uniq.includes('Barcode')) or.push({ barcode: bc });
    if (serial && clean(p.manufacturer) && clean(p.model))
      or.push({
        serial,
        manufacturer: clean(p.manufacturer),
        model: clean(p.model),
      });
    if (!or.length) return { dups: [], serialClash: false };
    const dups = await this.db.amAsset.findMany({
      where: {
        businessId: rootId,
        OR: or,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      take: 5,
    });
    const serialClash =
      !!serial &&
      uniq.includes('Serial number') &&
      dups.some((x) => (x.serial ?? '').toLowerCase() === serial.toLowerCase());
    return { dups, serialClash };
  }

  private validate(p: AssetInput, allowed: string[]) {
    if (p.condition && !CONDITIONS.includes(p.condition as never))
      throw amErr(AM_ERRORS.INVALID, 'Unknown condition.');
    if (p.criticality && !LEVELS.includes(p.criticality as never))
      throw amErr(AM_ERRORS.INVALID, 'Unknown criticality.');
    if (p.ownerType && !OWNER_TYPES.includes(p.ownerType as never))
      throw amErr(AM_ERRORS.INVALID, 'Unknown owner type.');
    if (p.status && !allowed.includes(p.status))
      throw amErr(
        AM_ERRORS.INVALID,
        `“${p.status}” isn’t an allowed status (Asset Settings › Statuses).`,
      );
    if (p.ownerType === 'Customer-owned' && !p.customerId)
      throw amErr(
        AM_ERRORS.INVALID,
        'Pick the CRM customer for a customer-owned asset.',
      );
    if (p.cost != null && (!Number.isFinite(p.cost) || p.cost < 0))
      throw amErr(AM_ERRORS.INVALID, 'Purchase cost must be zero or more.');
  }

  private async refs(a: AmActor, p: AssetInput) {
    const rootId = a.rootId;
    const group = (await this.ctx.branches(rootId)).map((g) => g.id);
    if (p.categoryId) {
      const c = await this.db.amCategory.findFirst({
        where: { id: p.categoryId, businessId: rootId },
      });
      if (!c)
        throw amErr(AM_ERRORS.INVALID, 'That category isn’t in this business.');
    }
    if (
      p.teamId &&
      !(await this.db.amTeam.findFirst({
        where: { id: p.teamId, businessId: rootId },
      }))
    )
      throw amErr(AM_ERRORS.INVALID, 'That team isn’t in this business.');
    if (
      p.customerId &&
      !(await this.db.customer.findFirst({
        where: { id: p.customerId, businessId: { in: group } },
      }))
    )
      throw amErr(AM_ERRORS.INVALID, 'That customer isn’t in this business.');
    if (
      p.productId &&
      !(await this.db.product.findFirst({
        where: { id: p.productId, businessId: { in: group } },
      }))
    )
      throw amErr(
        AM_ERRORS.INVALID,
        'That catalog product isn’t in this business.',
      );
    if (
      p.finAssetId &&
      !(await this.db.finAsset.findFirst({
        where: { id: p.finAssetId, businessId: rootId },
      }))
    )
      throw amErr(
        AM_ERRORS.INVALID,
        'That Finance fixed asset isn’t in this ledger.',
      );
    if (
      p.parentId &&
      !(await this.db.amAsset.findFirst({
        where: { id: p.parentId, businessId: rootId },
      }))
    )
      throw amErr(
        AM_ERRORS.INVALID,
        'That parent asset isn’t in this business.',
      );
    if (p.meterType) {
      const cfg = await this.ctx.config(rootId);
      if (!cfg.meters.includes(p.meterType))
        throw amErr(
          AM_ERRORS.INVALID,
          `“${p.meterType}” isn’t a meter type in Asset Settings.`,
        );
    }
  }

  private fields(p: AssetInput, canCost: boolean) {
    const out: Prisma.AmAssetUncheckedUpdateInput = {};
    const set = <K extends keyof Prisma.AmAssetUncheckedUpdateInput>(
      k: K,
      v: Prisma.AmAssetUncheckedUpdateInput[K],
    ) => {
      out[k] = v;
    };
    if (p.name !== undefined) set('name', p.name.trim().slice(0, 160));
    if (p.tag !== undefined) set('tag', clean(p.tag));
    if (p.barcode !== undefined) set('barcode', clean(p.barcode));
    if (p.serial !== undefined) set('serial', clean(p.serial));
    if (p.description !== undefined) set('description', clean(p.description));
    if (p.categoryId !== undefined) set('categoryId', clean(p.categoryId));
    if (p.criticality !== undefined) set('criticality', p.criticality);
    if (p.condition !== undefined) set('condition', p.condition);
    if (p.manufacturer !== undefined)
      set('manufacturer', clean(p.manufacturer));
    if (p.model !== undefined) set('model', clean(p.model));
    if (p.ownerType !== undefined) set('ownerType', p.ownerType);
    if (p.customerId !== undefined)
      set(
        'customerId',
        p.ownerType === 'Customer-owned' ? clean(p.customerId) : null,
      );
    if (p.teamId !== undefined) set('teamId', clean(p.teamId));
    if (p.parentId !== undefined) set('parentId', clean(p.parentId));
    if (p.productId !== undefined) set('productId', clean(p.productId));
    if (p.finAssetId !== undefined) set('finAssetId', clean(p.finAssetId));
    if (p.purchasedOn !== undefined) set('purchasedOn', day(p.purchasedOn));
    if (p.installedOn !== undefined) set('installedOn', day(p.installedOn));
    if (canCost && p.cost !== undefined)
      set('cost', p.cost == null ? null : dec(p.cost));
    if (p.warrantyProvider !== undefined)
      set('warrantyProvider', clean(p.warrantyProvider));
    if (p.warrantyType !== undefined)
      set('warrantyType', clean(p.warrantyType));
    if (p.warrantyStart !== undefined)
      set('warrantyStart', day(p.warrantyStart));
    if (p.warrantyEnd !== undefined) set('warrantyEnd', day(p.warrantyEnd));
    if (p.meterType !== undefined) {
      set('meterType', clean(p.meterType));
      set(
        'meterUnit',
        p.meterType
          ? (METER_UNITS[p.meterType] ?? p.meterType.toLowerCase())
          : null,
      );
    }
    if (p.custom !== undefined)
      set('custom', p.custom as Prisma.InputJsonValue);
    return out;
  }

  async create(a: AmActor, p: AssetInput) {
    this.ctx.need(a, 'create', 'Registering an asset');
    if (!clean(p.name))
      throw amErr(AM_ERRORS.INVALID, 'Asset name is required.');
    const cfg = await this.ctx.config(a.rootId);
    const status = p.status || 'Active';
    if (!['Draft', 'Active', 'In Storage'].includes(status))
      throw amErr(
        AM_ERRORS.INVALID,
        'New assets start as Draft, Active or In Storage.',
      );
    this.validate({ ...p, status }, cfg.statuses.allowed);
    await this.refs(a, p);
    const { dups, serialClash } = await this.dupCheck(a.rootId, p, null);
    if (serialClash)
      throw amErr(
        AM_ERRORS.DUPLICATE,
        `DUPLICATE_ASSET — serial ${clean(p.serial)} must be unique (Asset Settings › Numbering). Already on ${dups.map((x) => x.number).join(', ')}.`,
        HttpStatus.CONFLICT,
      );
    if (dups.length && !p.dupOk)
      throw amErr(
        AM_ERRORS.DUPLICATE,
        `DUPLICATE_ASSET — possible duplicate of ${dups
          .map(
            (x) =>
              `${x.number} (${x.name}, serial ${x.serial ?? '—'}, tag ${x.tag ?? '—'})`,
          )
          .join(
            '; ',
          )}. If this is a different physical item, choose “I reviewed possible duplicates”.`,
        HttpStatus.CONFLICT,
      );
    const place = await this.placement(
      a,
      clean(p.locationId),
      clean(p.branchId),
    );
    let number = clean(p.number);
    if (number && !cfg.numbering.manual)
      throw amErr(
        AM_ERRORS.INVALID,
        'Manual asset numbers are turned off (Asset Settings › Numbering).',
      );
    if (
      number &&
      (await this.db.amAsset.findFirst({
        where: { businessId: a.rootId, number },
      }))
    )
      throw amErr(
        AM_ERRORS.DUPLICATE,
        `Asset number ${number} is already used.`,
        HttpStatus.CONFLICT,
      );
    const corr = corrId();
    const asset = await this.db.$transaction(async (tx) => {
      // A manual number that equals the next auto number consumes it.
      if (!number) number = await this.ctx.assetNumber(a.rootId, tx);
      const cat = p.categoryId
        ? await tx.amCategory.findUnique({ where: { id: p.categoryId } })
        : null;
      const row = await tx.amAsset.create({
        data: {
          ...(this.fields(p, a.cost) as Prisma.AmAssetUncheckedCreateInput),
          businessId: a.rootId,
          number,
          name: p.name!.trim().slice(0, 160),
          status,
          criticality: p.criticality ?? cat?.criticality ?? 'Medium',
          condition: p.condition ?? 'Good',
          ownerType: p.ownerType ?? 'Business-owned',
          warrantyType:
            clean(p.warrantyType) ??
            (p.warrantyProvider ? (cat?.warrantyType ?? null) : null),
          ...place,
          createdById: a.userId,
        },
      });
      await tx.amEvent.create({
        data: {
          businessId: a.rootId,
          assetId: row.id,
          type: 'Created',
          occurredAt: row.installedOn ?? new Date(),
          summary: `Registered as ${row.number}`,
          byUserId: a.userId,
          condAfter: row.condition,
        },
      });
      if (p.initialReading != null && row.meterType) {
        if (!Number.isFinite(p.initialReading) || p.initialReading < 0)
          throw amErr(
            AM_ERRORS.READING,
            'INVALID_METER_READING — the initial reading must be zero or more.',
          );
        await tx.amReading.create({
          data: {
            businessId: a.rootId,
            assetId: row.id,
            value: dec(p.initialReading),
            takenAt: new Date(),
            source: 'Initial',
            byUserId: a.userId,
          },
        });
      }
      const tplId = clean(p.templateId) ?? cat?.templateId ?? null;
      if (tplId && p.templateId !== '') {
        const tpl = await tx.amPmTemplate.findFirst({
          where: { id: tplId, businessId: a.rootId },
        });
        if (tpl) {
          const due = new Date();
          due.setUTCMonth(due.getUTCMonth() + 3);
          await tx.amPmPlan.create({
            data: {
              businessId: a.rootId,
              number: await this.ctx.number(a.rootId, 'pm', tx),
              name: `${tpl.name} — ${row.number}`,
              assetId: row.id,
              templateId: tpl.id,
              trigger: 'Time',
              interval: 3,
              unit: 'months',
              nextDueOn: new Date(
                Date.UTC(
                  due.getUTCFullYear(),
                  due.getUTCMonth(),
                  due.getUTCDate(),
                ),
              ),
              tolerance: cfg.pm.tolerance,
              teamId: row.teamId,
              autoCreate: cfg.pm.auto,
              leadDays: cfg.pm.lead,
              status: 'Active',
            },
          });
        }
      }
      await this.ctx.audit(
        a.rootId,
        a,
        'Asset created',
        'asset',
        row.id,
        `${row.number} · ${row.name} · v1`,
        {
          after: row,
          corr,
          tx,
        },
      );
      return row;
    });
    return asset;
  }

  async update(a: AmActor, id: string, p: AssetInput) {
    this.ctx.need(a, 'edit', 'Editing an asset');
    const cur = await this.must(a.rootId, id);
    if (p.expectedVersion != null && p.expectedVersion !== cur.version) {
      const last = await this.db.amAudit.findFirst({
        where: { businessId: a.rootId, entityId: id },
        orderBy: { createdAt: 'desc' },
      });
      throw amErr(
        AM_ERRORS.VERSION,
        `VERSION_CONFLICT — ${cur.number} is now v${cur.version}${last ? ` (${last.action.toLowerCase()} by ${last.actorName}: ${last.detail})` : ''}. Your changes were NOT saved. Reload and re-apply.`,
        HttpStatus.CONFLICT,
      );
    }
    if (FINAL_ASSET.includes(cur.status) && p.status === undefined)
      throw amErr(
        AM_ERRORS.CONFLICT,
        `${cur.number} is ${cur.status.toLowerCase()} — its record is read-only.`,
        HttpStatus.CONFLICT,
      );
    const cfg = await this.ctx.config(a.rootId);
    this.validate(p, cfg.statuses.allowed);
    await this.refs(a, p);
    if (p.number !== undefined && clean(p.number) !== cur.number) {
      if (!cfg.numbering.manual)
        throw amErr(
          AM_ERRORS.INVALID,
          'Manual asset numbers are turned off (Asset Settings › Numbering).',
        );
      const n = clean(p.number);
      if (!n) throw amErr(AM_ERRORS.INVALID, 'Asset number can’t be empty.');
      if (
        await this.db.amAsset.findFirst({
          where: { businessId: a.rootId, number: n, id: { not: id } },
        })
      )
        throw amErr(
          AM_ERRORS.DUPLICATE,
          `Asset number ${n} is already used.`,
          HttpStatus.CONFLICT,
        );
    }
    const merged: AssetInput = {
      tag: p.tag ?? cur.tag ?? undefined,
      serial: p.serial ?? cur.serial ?? undefined,
      barcode: p.barcode ?? cur.barcode ?? undefined,
      manufacturer: p.manufacturer ?? cur.manufacturer ?? undefined,
      model: p.model ?? cur.model ?? undefined,
    };
    const { dups } = await this.dupCheck(a.rootId, merged, id);
    if (dups.length)
      throw amErr(
        AM_ERRORS.DUPLICATE,
        `DUPLICATE_ASSET — tag/serial/barcode already used by ${dups.map((x) => `${x.number} (${x.name})`).join(', ')}.`,
        HttpStatus.CONFLICT,
      );
    if (
      p.status !== undefined &&
      p.status !== cur.status &&
      !(ASSET_T[cur.status] ?? []).includes(p.status)
    )
      throw amErr(
        AM_ERRORS.TRANSITION,
        `INVALID_STATUS_TRANSITION — ${cur.status} → ${p.status} isn’t allowed.`,
      );
    const data = this.fields(p, a.cost);
    if (p.number !== undefined) data.number = clean(p.number)!;
    if (p.status !== undefined) data.status = p.status;
    if (p.locationId !== undefined || p.branchId !== undefined)
      Object.assign(
        data,
        await this.placement(
          a,
          clean(p.locationId),
          clean(p.branchId) ?? cur.branchId,
        ),
      );
    const changed = Object.keys(data).filter(
      (k) =>
        JSON.stringify((cur as Record<string, unknown>)[k] ?? null) !==
        JSON.stringify((data as Record<string, unknown>)[k] ?? null),
    );
    const corr = corrId();
    return this.db.$transaction(async (tx) => {
      const res = await tx.amAsset.updateMany({
        where: { id, version: cur.version },
        data: { ...data, version: { increment: 1 } },
      });
      if (!res.count)
        throw amErr(
          AM_ERRORS.VERSION,
          `VERSION_CONFLICT — ${cur.number} was saved by someone else just now. Reload and re-apply.`,
          HttpStatus.CONFLICT,
        );
      const row = await tx.amAsset.findUniqueOrThrow({ where: { id } });
      if (p.condition && p.condition !== cur.condition)
        await tx.amEvent.create({
          data: {
            businessId: a.rootId,
            assetId: id,
            type: 'Condition Change',
            occurredAt: new Date(),
            summary: `Condition ${cur.condition} → ${p.condition} (edit)`,
            condBefore: cur.condition,
            condAfter: p.condition,
            byUserId: a.userId,
          },
        });
      await this.ctx.audit(
        a.rootId,
        a,
        'Asset edited',
        'asset',
        id,
        `${cur.number} · ${changed.map((k) => `${k}: ${show((cur as Record<string, unknown>)[k])} → ${show((row as Record<string, unknown>)[k])}`).join(', ') || 'no field changes'} · v${cur.version} → v${row.version}`,
        { before: cur, after: row, corr, tx },
      );
      return row;
    });
  }

  async setStatus(a: AmActor, id: string, to: string, reason: string, tx?: Tx) {
    const cur = await this.must(a.rootId, id);
    if (cur.status === to) return cur;
    if (!(ASSET_T[cur.status] ?? []).includes(to))
      throw amErr(
        AM_ERRORS.TRANSITION,
        `INVALID_STATUS_TRANSITION — ${cur.status} → ${to} isn’t allowed.`,
      );
    const db = tx ?? this.db;
    const row = await db.amAsset.update({
      where: { id },
      data: { status: to, version: { increment: 1 } },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Asset status changed',
      'asset',
      id,
      `${cur.number} · ${cur.status} → ${to}${reason ? ` · reason: ${reason}` : ''}`,
      { tx },
    );
    return row;
  }

  async changeStatus(a: AmActor, id: string, to: string, reason: string) {
    this.ctx.need(
      a,
      ['Retired', 'Disposed'].includes(to) ? 'retire' : 'edit',
      'Changing asset status',
    );
    if (!reason?.trim())
      throw amErr(AM_ERRORS.INVALID, 'A reason is required.');
    if (['Retired', 'Disposed'].includes(to))
      return this.retire(a, id, {
        to,
        reason,
        date: new Date().toISOString().slice(0, 10),
      });
    if (to === 'Archived') return this.archive(a, id, reason);
    return this.setStatus(a, id, to, reason);
  }

  async transfer(
    a: AmActor,
    id: string,
    b: {
      locationId?: string;
      branchId?: string;
      effective: string;
      teamId?: string;
      reason: string;
      notes?: string;
    },
  ) {
    this.ctx.need(a, 'transfer', 'Transferring an asset');
    if (!b.reason?.trim())
      throw amErr(AM_ERRORS.INVALID, 'Destination and reason are required.');
    const cur = await this.must(a.rootId, id);
    if (FINAL_ASSET.includes(cur.status))
      throw amErr(
        AM_ERRORS.CONFLICT,
        `${cur.number} is ${cur.status.toLowerCase()} and can’t be transferred.`,
        HttpStatus.CONFLICT,
      );
    if (!b.locationId && !b.branchId)
      throw amErr(AM_ERRORS.INVALID, 'Pick where the asset is going.');
    const place = await this.placement(a, b.locationId, b.branchId);
    if (place.locationId === cur.locationId && place.branchId === cur.branchId)
      throw amErr(AM_ERRORS.INVALID, 'That is where the asset already is.');
    if (
      b.teamId &&
      !(await this.db.amTeam.findFirst({
        where: { id: b.teamId, businessId: a.rootId },
      }))
    )
      throw amErr(AM_ERRORS.INVALID, 'That team isn’t in this business.');
    const when = day(b.effective) ?? new Date();
    return this.db.$transaction(async (tx) => {
      const row = await tx.amAsset.update({
        where: { id },
        data: {
          ...place,
          ...(b.teamId ? { teamId: b.teamId } : {}),
          version: { increment: 1 },
        },
      });
      const path = async (locId: string | null, brId: string | null) => {
        const names: string[] = [];
        let l = locId
          ? await tx.amLocation.findUnique({ where: { id: locId } })
          : null;
        let g = 0;
        while (l && g++ < 20) {
          names.unshift(l.name);
          l = l.parentId
            ? await tx.amLocation.findUnique({ where: { id: l.parentId } })
            : null;
        }
        const br = brId
          ? await tx.business.findUnique({
              where: { id: brId },
              select: { name: true },
            })
          : null;
        if (br) names.unshift(br.name);
        return names.join(' › ') || 'Unassigned';
      };
      const from = await path(cur.locationId, cur.branchId);
      const to = await path(place.locationId, place.branchId);
      await tx.amEvent.create({
        data: {
          businessId: a.rootId,
          assetId: id,
          type: 'Transfer',
          occurredAt: when,
          summary: `Transferred ${from} → ${to} · ${b.reason.trim()}${b.notes ? ` · ${b.notes.trim()}` : ''}`,
          fromLocationId: cur.locationId,
          toLocationId: place.locationId,
          byUserId: a.userId,
          extra: { fromBranch: cur.branchId, toBranch: place.branchId },
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Asset transferred',
        'asset',
        id,
        `${cur.number} · ${from} → ${to} · reason: ${b.reason.trim()}`,
        { tx },
      );
      return row;
    });
  }

  async retire(
    a: AmActor,
    id: string,
    b: {
      to: string;
      date: string;
      reason: string;
      disposition?: string;
      replacementId?: string;
      finRef?: string;
      notes?: string;
    },
  ) {
    this.ctx.need(a, 'retire', 'Retiring or disposing an asset');
    const cur = await this.must(a.rootId, id);
    const open = await this.db.amWorkOrder.findMany({
      where: {
        businessId: a.rootId,
        assetId: id,
        status: { notIn: ['Closed', 'Cancelled', 'Completed'] },
      },
      select: { number: true },
    });
    if (open.length)
      throw amErr(
        AM_ERRORS.CONFLICT,
        `Blocked — close or cancel open work orders first: ${open.map((w) => w.number).join(', ')}.`,
        HttpStatus.CONFLICT,
      );
    if (!b.reason?.trim())
      throw amErr(AM_ERRORS.INVALID, 'A reason is required.');
    if (!['Retired', 'Disposed'].includes(b.to))
      throw amErr(AM_ERRORS.INVALID, 'Pick Retired or Disposed.');
    if (!(ASSET_T[cur.status] ?? []).includes(b.to))
      throw amErr(
        AM_ERRORS.TRANSITION,
        `INVALID_STATUS_TRANSITION — ${cur.status} → ${b.to}.`,
      );
    const repl = b.replacementId
      ? await this.must(a.rootId, b.replacementId)
      : null;
    return this.db.$transaction(async (tx) => {
      const plans = await tx.amPmPlan.updateMany({
        where: {
          businessId: a.rootId,
          assetId: id,
          status: { in: ['Active', 'Paused'] },
        },
        data: { status: 'Closed — asset retired' },
      });
      const reqs = await tx.amRequest.updateMany({
        where: {
          businessId: a.rootId,
          assetId: id,
          status: { in: OPEN_REQ.filter((s) => s !== 'Approved') },
        },
        data: { status: 'Cancelled' },
      });
      await tx.amDowntime.updateMany({
        where: { businessId: a.rootId, assetId: id, endAt: null },
        data: { endAt: new Date() },
      });
      const row = await tx.amAsset.update({
        where: { id },
        data: { status: b.to, version: { increment: 1 } },
      });
      await tx.amEvent.create({
        data: {
          businessId: a.rootId,
          assetId: id,
          type: 'Retirement',
          occurredAt: day(b.date) ?? new Date(),
          summary: `${b.to} — ${b.reason.trim()}${b.disposition ? ` · ${b.disposition}` : ''}${repl ? ` · replaced by ${repl.number}` : ''}`,
          condBefore: cur.condition,
          condAfter: cur.condition,
          byUserId: a.userId,
          extra: {
            disposition: b.disposition ?? null,
            replacementId: repl?.id ?? null,
            finRef: b.finRef ?? null,
            notes: b.notes ?? null,
          },
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        `Asset ${b.to.toLowerCase()}`,
        'asset',
        id,
        `${cur.number} · ${plans.count} PM plan(s) closed · ${reqs.count} open request(s) cancelled · history preserved · Finance ref ${b.finRef || '—'} · reason: ${b.reason.trim()}`,
        { tx },
      );
      return {
        asset: row,
        plansClosed: plans.count,
        requestsCancelled: reqs.count,
      };
    });
  }

  async archive(a: AmActor, id: string, reason: string) {
    this.ctx.need(a, 'edit', 'Archiving an asset');
    const cur = await this.must(a.rootId, id);
    if (!(ASSET_T[cur.status] ?? []).includes('Archived'))
      throw amErr(
        AM_ERRORS.TRANSITION,
        `INVALID_STATUS_TRANSITION — retire or deactivate ${cur.number} before archiving (it is ${cur.status}).`,
      );
    return this.db.$transaction(async (tx) => {
      await tx.amPmPlan.updateMany({
        where: {
          businessId: a.rootId,
          assetId: id,
          status: { in: ['Active', 'Paused'] },
        },
        data: { status: 'Archived' },
      });
      return this.setStatus(a, id, 'Archived', reason, tx);
    });
  }

  async bulk(
    a: AmActor,
    b: {
      ids: string[];
      act: string;
      value?: string;
      reason?: string;
      interval?: number;
    },
  ) {
    const ids = [...new Set(b.ids)];
    if (!ids.length)
      throw amErr(AM_ERRORS.INVALID, 'Select at least one asset.');
    const assets = await this.db.amAsset.findMany({
      where: { businessId: a.rootId, id: { in: ids } },
    });
    if (assets.length !== ids.length)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'Some selected assets aren’t in this business.',
        HttpStatus.NOT_FOUND,
      );
    if (['bk-crit', 'bk-arch'].includes(b.act) && !b.reason?.trim())
      throw amErr(AM_ERRORS.INVALID, 'Reason required.');
    if (b.act === 'bk-pm') {
      this.ctx.need(a, 'pm', 'Applying a PM template');
      const tpl = await this.db.amPmTemplate.findFirst({
        where: { id: b.value, businessId: a.rootId },
      });
      if (!tpl) throw amErr(AM_ERRORS.INVALID, 'Pick a PM template.');
      const cfg = await this.ctx.config(a.rootId);
      const interval = Math.max(1, Math.round(b.interval ?? 3));
      let made = 0;
      const skipped: string[] = [];
      for (const x of assets) {
        if (FINAL_ASSET.includes(x.status)) {
          skipped.push(x.number);
          continue;
        }
        const clash = await this.db.amPmPlan.findFirst({
          where: {
            businessId: a.rootId,
            assetId: x.id,
            templateId: tpl.id,
            status: 'Active',
          },
        });
        if (clash) {
          skipped.push(x.number);
          continue;
        }
        const due = new Date();
        due.setUTCMonth(due.getUTCMonth() + interval);
        await this.db.amPmPlan.create({
          data: {
            businessId: a.rootId,
            number: await this.ctx.number(a.rootId, 'pm'),
            name: `${tpl.name} — ${x.number}`,
            assetId: x.id,
            templateId: tpl.id,
            trigger: 'Time',
            interval,
            unit: 'months',
            nextDueOn: new Date(
              Date.UTC(
                due.getUTCFullYear(),
                due.getUTCMonth(),
                due.getUTCDate(),
              ),
            ),
            tolerance: cfg.pm.tolerance,
            teamId: x.teamId,
            autoCreate: cfg.pm.auto,
            leadDays: cfg.pm.lead,
            status: 'Active',
          },
        });
        made++;
      }
      await this.ctx.audit(
        a.rootId,
        a,
        'Bulk Apply PM template',
        'asset',
        ids[0],
        `${tpl.name} → ${made} plan(s) created · skipped ${skipped.join(', ') || 'none'}`,
      );
      return { applied: made, skipped };
    }
    if (b.act === 'bk-arch') {
      const ok: string[] = [];
      const skipped: string[] = [];
      for (const x of assets) {
        try {
          await this.archive(a, x.id, b.reason!);
          ok.push(x.number);
        } catch {
          skipped.push(x.number);
        }
      }
      return { applied: ok.length, skipped };
    }
    this.ctx.need(a, 'edit', 'Bulk editing assets');
    const field = {
      'bk-loc': 'locationId',
      'bk-cat': 'categoryId',
      'bk-crit': 'criticality',
      'bk-team': 'teamId',
    }[b.act];
    if (!field || !b.value) throw amErr(AM_ERRORS.INVALID, 'Pick a value.');
    await this.refs(a, { [field]: b.value });
    if (field === 'criticality' && !LEVELS.includes(b.value as never))
      throw amErr(AM_ERRORS.INVALID, 'Unknown criticality.');
    const data: Prisma.AmAssetUncheckedUpdateManyInput =
      field === 'locationId'
        ? await this.placement(a, b.value, null)
        : { [field]: b.value };
    await this.db.amAsset.updateMany({
      where: { businessId: a.rootId, id: { in: ids } },
      data: { ...data, version: { increment: 1 } },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      `Bulk ${b.act.replace('bk-', '')}`,
      'asset',
      ids[0],
      `${assets.map((x) => x.number).join(', ')} → ${b.value}${b.reason ? ` · reason: ${b.reason}` : ''}`,
    );
    return { applied: ids.length, skipped: [] };
  }

  /** QR / barcode / tag / serial / number lookup. */
  async lookup(a: AmActor, code: string) {
    const c = (code ?? '').trim();
    if (!c) throw amErr(AM_ERRORS.INVALID, 'Scan or type a code.');
    const qr = c.match(/assets?\/([0-9a-f-]{36})/i)?.[1];
    const found = await this.db.amAsset.findFirst({
      where: {
        businessId: a.rootId,
        OR: [
          ...(qr ? [{ id: qr }] : []),
          { number: c },
          { tag: c },
          { barcode: c },
          { serial: c },
        ],
      },
      select: { id: true, number: true, name: true, branchId: true },
    });
    if (
      !found ||
      (a.branches && found.branchId && !a.branches.includes(found.branchId))
    )
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'ASSET_NOT_FOUND — no asset with that code in this business.',
        HttpStatus.NOT_FOUND,
      );
    return found;
  }

  // ── documents ─────────────────────────────────────────────────────────

  async uploadDoc(
    a: AmActor,
    assetId: string,
    type: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    this.ctx.need(a, 'edit', 'Adding asset documents');
    const x = await this.must(a.rootId, assetId);
    if (!file?.buffer?.length)
      throw amErr(AM_ERRORS.INVALID, 'Choose a file to upload.');
    if (file.size > 20 * 1024 * 1024)
      throw amErr(AM_ERRORS.INVALID, 'Files are limited to 20 MB.');
    const name = (file.originalname || 'file').slice(0, 200);
    const ext = name.includes('.')
      ? `.${name.split('.').pop()!.toLowerCase().slice(0, 10)}`
      : '';
    const key = `assets/${a.rootId}/${assetId}/${randomUUID()}${ext}`;
    await this.s3.upload(
      key,
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );
    const doc = await this.db.amDocument.create({
      data: {
        businessId: a.rootId,
        assetId,
        type: type || 'Manual',
        name,
        storageKey: key,
        mime: (file.mimetype || 'application/octet-stream').slice(0, 120),
        size: file.size,
        byUserId: a.userId,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Document linked',
      'asset',
      assetId,
      `${x.number} · ${type} · ${name}`,
    );
    return doc;
  }

  async docUrl(a: AmActor, docId: string) {
    const d = await this.db.amDocument.findFirst({
      where: { id: docId, businessId: a.rootId },
    });
    if (!d)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'Document not found',
        HttpStatus.NOT_FOUND,
      );
    return {
      url: await this.s3.getSignedDownloadUrl(d.storageKey, 3600),
      name: d.name,
    };
  }

  async unlinkDoc(a: AmActor, docId: string) {
    this.ctx.need(a, 'edit', 'Removing asset documents');
    const d = await this.db.amDocument.findFirst({
      where: { id: docId, businessId: a.rootId },
    });
    if (!d)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'Document not found',
        HttpStatus.NOT_FOUND,
      );
    await this.db.amDocument.delete({ where: { id: d.id } });
    await this.s3.delete(d.storageKey).catch(() => null);
    const x = await this.must(a.rootId, d.assetId);
    await this.ctx.audit(
      a.rootId,
      a,
      'Document removed',
      'asset',
      d.assetId,
      `${x.number} · ${d.name}`,
    );
    return { ok: true };
  }

  /** Purchase cost as a number, or null — only for callers allowed to see cost. */
  costOf(x: { cost: Prisma.Decimal | null }) {
    return x.cost == null ? null : num(x.cost);
  }
}
