import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import {
  FsActor,
  FsContextService,
  dec,
  fsErr,
  notFound,
  num,
} from './fs-context.service';
import { Data, FsDataService, Plan } from './fs-data.service';
import { FsWorkOrdersService } from './fs-workorders.service';
import { FS_ERRORS, ITEM_TYPES, PLAN_TRIGGERS } from './fs.constants';
import { dayKey } from './fs-time';

export interface PlanIn {
  name: string;
  customerId: string;
  assetId?: string | null;
  siteId?: string | null;
  serviceTypeId: string;
  trigger: string;
  freq: number;
  firstDueDays: number;
  window?: string;
  autoCreate: boolean;
  approval: boolean;
}

const MONTHS: Record<string, number> = {
  Monthly: 1,
  Quarterly: 3,
  Annually: 12,
};

/**
 * Preventive plans (rule → due check → work order → history → next due), versioned checklist
 * templates and inspection review. Generation inserts a plan + period instance first, so a retry,
 * a double click or the hourly evaluator can never create a second work order for the same period.
 */
@Injectable()
export class FsPlansService {
  constructor(
    private readonly ctx: FsContextService,
    private readonly data: FsDataService,
    private readonly wos: FsWorkOrdersService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  private addDays(date: Date, n: number) {
    return new Date(date.getTime() + n * 86400000);
  }
  /** Next due after `from` for a time trigger. */
  private roll(p: { trigger: string; freq: number }, from: Date) {
    if (MONTHS[p.trigger]) {
      const x = new Date(from);
      x.setUTCMonth(x.getUTCMonth() + MONTHS[p.trigger]);
      return x;
    }
    return this.addDays(from, p.trigger === 'Weekly' ? 7 : p.freq);
  }

  async save(a: FsActor, id: string | null, b: PlanIn) {
    this.ctx.need(a, 'plan', 'Managing preventive plans');
    const d = await this.wos.load(a);
    if (!b.name?.trim()) throw fsErr(FS_ERRORS.INVALID, 'Name required.');
    if (!PLAN_TRIGGERS.includes(b.trigger))
      throw fsErr(FS_ERRORS.INVALID, 'Pick a trigger.');
    if (!(Number(b.freq) > 0))
      throw fsErr(FS_ERRORS.INVALID, 'Frequency must be positive.');
    if (
      !d.customers.has(b.customerId) &&
      !(await this.db.customer.findFirst({
        where: {
          id: b.customerId,
          businessId: { in: d.group.map((g) => g.id) },
        },
      }))
    )
      throw fsErr(FS_ERRORS.INVALID, 'Pick a customer.');
    if (!d.svc.get(b.serviceTypeId)?.active)
      throw fsErr(FS_ERRORS.INVALID, 'Pick an active service type.');
    if (b.assetId) {
      const x = d.assets.get(b.assetId);
      if (!x || (x.customerId && x.customerId !== b.customerId))
        throw fsErr(
          FS_ERRORS.INVALID,
          'That asset isn’t this customer’s equipment.',
        );
    }
    if (b.trigger === 'Usage hours') {
      if (!b.assetId)
        throw fsErr(
          FS_ERRORS.INVALID,
          'Usage-hour plans need an asset with a meter.',
        );
      const x = d.assets.get(b.assetId);
      if (!x?.meterType)
        throw fsErr(
          FS_ERRORS.INVALID,
          'That asset has no meter in Assets & Maintenance — record readings there first.',
        );
    }
    const dup = d.plans.find(
      (p) =>
        p.id !== id &&
        p.status === 'Active' &&
        p.customerId === b.customerId &&
        p.serviceTypeId === b.serviceTypeId &&
        (p.assetId ?? null) === (b.assetId || null),
    );
    if (dup)
      throw fsErr(
        FS_ERRORS.INVALID,
        `${dup.number} (${dup.name}) already covers this customer, asset and service — edit that plan instead.`,
      );
    const today = new Date(`${dayKey(d.now, d.tz)}T00:00:00Z`);
    const meter = b.assetId ? d.meters.get(b.assetId) : undefined;
    const data = {
      name: b.name.trim().slice(0, 160),
      customerId: b.customerId,
      assetId: b.assetId || null,
      siteId:
        b.siteId || (b.assetId ? (d.eqSite.get(b.assetId) ?? null) : null),
      serviceTypeId: b.serviceTypeId,
      trigger: b.trigger,
      freq: Math.round(Number(b.freq)),
      window: (b.window || 'Any').slice(0, 60),
      autoCreate: !!b.autoCreate,
      approval: !!b.approval,
      ...(b.trigger === 'Usage hours'
        ? { nextDueOn: null, nextDueMeter: dec((meter ?? 0) + Number(b.freq)) }
        : {
            nextDueOn: this.addDays(
              today,
              Math.max(0, Math.round(Number(b.firstDueDays) || 0)),
            ),
            nextDueMeter: null,
          }),
    };
    if (id) {
      const p = d.plans.find((x) => x.id === id);
      if (!p) throw notFound('Plan');
      await this.db.fsPlan.update({ where: { id }, data });
      await this.ctx.audit(
        a.rootId,
        a,
        'Preventive plan saved',
        'plan',
        id,
        `${p.number} · ${data.name}`,
      );
      return { ok: true, msg: `${p.number} saved.` };
    }
    const number = await this.ctx.number(a.rootId, 'pm');
    const p = await this.db.fsPlan.create({
      data: { ...data, businessId: a.rootId, number, status: 'Active' },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Preventive plan created',
      'plan',
      p.id,
      `${number} · ${data.name}`,
    );
    return { ok: true, msg: `${number} created.` };
  }

  async setStatus(a: FsActor, id: string, active: boolean) {
    this.ctx.need(a, 'plan', 'Pausing plans');
    const p = await this.db.fsPlan.findFirst({
      where: { id, businessId: a.rootId },
    });
    if (!p) throw notFound('Plan');
    await this.db.fsPlan.update({
      where: { id },
      data: { status: active ? 'Active' : 'Paused' },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      `Preventive plan ${active ? 'resumed' : 'paused'}`,
      'plan',
      id,
      p.number,
    );
    return { ok: true, msg: `${p.number} ${active ? 'resumed' : 'paused'}.` };
  }

  /** Period key for the plan's next occurrence (the idempotency key). */
  private keyOf(p: Plan) {
    return p.trigger === 'Usage hours'
      ? `${p.id}:m${num(p.nextDueMeter)}`
      : `${p.id}:${p.nextDueOn?.toISOString().slice(0, 10)}`;
  }

  async generate(a: FsActor, id: string, d0?: Data) {
    if (a.userId !== 'System')
      this.ctx.need(a, 'plan', 'Generating preventive work orders');
    const d = d0 ?? (await this.wos.load(a));
    const p = d.plans.find((x) => x.id === id);
    if (!p) throw notFound('Plan');
    if (p.status !== 'Active')
      throw fsErr(FS_ERRORS.INVALID, 'Plan is paused.');
    const key = this.keyOf(p);
    try {
      await this.db.fsPlanInstance.create({
        data: { planId: p.id, key, status: 'Generating' },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const inst = await this.db.fsPlanInstance.findUnique({
          where: { planId_key: { planId: p.id, key } },
        });
        const w = inst?.woId
          ? d.wos.find((x) => x.id === inst.woId)
          : undefined;
        return {
          ok: true,
          dup: true,
          msg: `Already generated for this period${w ? ` (${w.number})` : ''} — key ${key}. No duplicate created.`,
        };
      }
      throw e;
    }
    try {
      const sv = d.svc.get(p.serviceTypeId);
      const off = p.nextDueOn
        ? Math.max(
            0,
            Math.round(
              (Date.parse(p.nextDueOn.toISOString().slice(0, 10)) -
                Date.parse(dayKey(d.now, d.tz))) /
                86400000,
            ),
          )
        : null;
      const made = await this.wos.create(
        a,
        {
          customerId: p.customerId,
          siteId: p.siteId,
          assetId: p.assetId,
          serviceTypeId: p.serviceTypeId,
          scope: `${p.name} (preventive)`,
          priority: 'Normal',
          planId: p.id,
          planKey: key,
          status: p.approval ? 'Awaiting Approval' : 'Approved',
          approvalReason: p.approval
            ? 'Preventive plan requires approval'
            : null,
          parts: ((sv?.partProductIds as string[]) ?? []).map((x) => ({
            productId: x,
            qty: 1,
          })),
          day: null,
          h: null,
        },
        d,
      );
      if (off != null && off > 0)
        await this.db.fsWorkOrder.update({
          where: { id: made.id },
          data: { note: `Due ${this.data.dday(d, off)} · window ${p.window}` },
        });
      const next =
        p.trigger === 'Usage hours'
          ? { nextDueMeter: dec(num(p.nextDueMeter) + p.freq) }
          : {
              nextDueOn: this.roll(
                p,
                p.nextDueOn ?? new Date(`${dayKey(d.now, d.tz)}T00:00:00Z`),
              ),
            };
      await this.db.fsPlanInstance.update({
        where: { planId_key: { planId: p.id, key } },
        data: { woId: made.id, status: 'Generated' },
      });
      await this.db.fsPlan.update({
        where: { id: p.id },
        data: { ...next, lastWoId: made.id },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Preventive work order generated',
        'plan',
        p.id,
        `${p.number} → ${made.number} · key ${key} · event field.maintenance.work_order_generated`,
      );
      return {
        ok: true,
        msg: `${made.number} generated (${made.status}). Retrying uses key ${key} — no duplicate.`,
      };
    } catch (e) {
      await this.db.fsPlanInstance
        .delete({ where: { planId_key: { planId: p.id, key } } })
        .catch(() => null);
      throw e;
    }
  }

  /** Hourly: generate due work orders for auto-create plans within the lead time. */
  async evaluate(rootId: string) {
    const a = this.ctx.systemActor(rootId);
    const d = await this.wos.load(a);
    if (!d.cfg.pm.autoCreate) return 0;
    let n = 0;
    for (const p of d.plans) {
      if (p.status !== 'Active' || !p.autoCreate) continue;
      const off = this.data.planNext(d, p);
      const due =
        p.trigger === 'Usage hours'
          ? off === 0
          : off != null && off <= d.cfg.pm.leadDays;
      if (!due) continue;
      const r = await this.generate(a, p.id).catch(() => null);
      if (r && !r.dup) n++;
    }
    return n;
  }

  // ── checklist templates ─────────────────────────────────────────────────

  parseItems(text: string) {
    const items = text
      .split('\n')
      .map((l) => l.split('|').map((x) => x.trim()))
      .filter((x) => x[0]);
    const bad = items.find((x) => !ITEM_TYPES.includes(x[1]));
    if (bad)
      throw fsErr(
        FS_ERRORS.INVALID,
        `Unknown item type “${bad[1] ?? ''}” on “${bad[0]}”.`,
      );
    return items.map((x) => ({
      t: x[0].slice(0, 200),
      type: x[1],
      req: /^y/i.test(x[2] ?? ''),
      ev: ['Photo', 'Video'].includes(x[1]),
    }));
  }

  async createTemplate(
    a: FsActor,
    b: {
      name: string;
      serviceTypeId?: string | null;
      assetType?: string;
      items: string;
    },
  ) {
    this.ctx.need(a, 'plan', 'Managing checklist templates');
    if (!b.name?.trim())
      throw fsErr(FS_ERRORS.INVALID, 'Name and at least one item required.');
    const items = this.parseItems(b.items ?? '');
    if (!items.length)
      throw fsErr(FS_ERRORS.INVALID, 'Name and at least one item required.');
    const code = `CHK-${randomBytes(2).toString('hex').toUpperCase()}`;
    const t = await this.db.fsTemplate.create({
      data: {
        businessId: a.rootId,
        code,
        name: b.name.trim().slice(0, 160),
        serviceTypeId: b.serviceTypeId || null,
        assetType: (b.assetType || 'Any').slice(0, 40),
        version: 1,
        items,
        status: 'Draft',
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Checklist template drafted',
      'template',
      t.id,
      `${code} v1 · ${t.name}`,
    );
    return {
      ok: true,
      msg: `${code} saved as Draft — publish it to use on new work orders.`,
    };
  }

  async templateAction(
    a: FsActor,
    id: string,
    act: 'Duplicate' | 'Publish version',
  ) {
    this.ctx.need(a, 'plan', 'Managing checklist templates');
    const t = await this.db.fsTemplate.findFirst({
      where: { id, businessId: a.rootId },
    });
    if (!t) throw notFound('Template');
    if (act === 'Duplicate') {
      const max = await this.db.fsTemplate.aggregate({
        where: { businessId: a.rootId, code: t.code },
        _max: { version: true },
      });
      const n = await this.db.fsTemplate.create({
        data: {
          businessId: a.rootId,
          code: t.code,
          name: t.name,
          serviceTypeId: t.serviceTypeId,
          assetType: t.assetType,
          version: (max._max.version ?? t.version) + 1,
          items: t.items as Prisma.InputJsonValue,
          status: 'Draft',
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Template version drafted',
        'template',
        n.id,
        `${t.code} v${n.version} (from v${t.version})`,
      );
      return {
        ok: true,
        msg: `${t.code} v${n.version} drafted from v${t.version}.`,
      };
    }
    if (t.status !== 'Draft')
      throw fsErr(
        FS_ERRORS.INVALID,
        'Only a draft can be published — published versions are immutable.',
      );
    await this.db.$transaction(async (tx) => {
      await tx.fsTemplate.updateMany({
        where: {
          businessId: a.rootId,
          status: 'Published',
          OR: [
            { code: t.code },
            ...(t.serviceTypeId ? [{ serviceTypeId: t.serviceTypeId }] : []),
          ],
        },
        data: { status: 'Superseded' },
      });
      await tx.fsTemplate.update({
        where: { id: t.id },
        data: { status: 'Published' },
      });
      if (t.serviceTypeId)
        await tx.fsServiceType.update({
          where: { id: t.serviceTypeId },
          data: { templateId: t.id },
        });
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Checklist template published',
      'template',
      t.id,
      `${t.code} v${t.version}`,
    );
    return {
      ok: true,
      msg: `${t.name} v${t.version} published. Existing jobs keep the version they started with.`,
    };
  }

  async approveInspection(a: FsActor, id: string) {
    this.ctx.need(a, 'approve', 'Approving inspections');
    const i = await this.db.fsInspection.findFirst({
      where: { id, businessId: a.rootId },
    });
    if (!i) throw notFound('Inspection');
    if (i.result === 'In Progress')
      throw fsErr(FS_ERRORS.INVALID, 'Still in progress.', HttpStatus.CONFLICT);
    await this.db.fsInspection.update({
      where: { id },
      data: { approvedById: a.userId },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Inspection approved',
      'inspection',
      id,
      i.number,
    );
    return { ok: true, msg: `${i.number} approved by ${a.name}.` };
  }
}
