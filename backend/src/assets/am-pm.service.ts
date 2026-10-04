import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AmActor,
  AmContextService,
  amErr,
  dec,
  num,
} from './am-context.service';
import { AmMaintService } from './am-maint.service';
import { AmWorkOrdersService } from './am-workorders.service';
import { AM_ERRORS, FINAL_ASSET } from './am.constants';

const day = (s?: string | null) =>
  s ? new Date(`${s.slice(0, 10)}T00:00:00Z`) : null;
const TIME_UNITS = ['days', 'weeks', 'months', 'years'];

export interface PlanInput {
  name: string;
  assetId: string;
  templateId?: string;
  trigger: string;
  interval: number;
  unit: string;
  nextDueOn?: string;
  nextDueMeter?: number | null;
  meterInterval?: number | null;
  who?: string;
  autoCreate?: boolean;
  leadDays?: number;
  tolerance?: string;
}

/** Preventive maintenance plans and the due evaluator (one work order per plan + due instance). */
@Injectable()
export class AmPmService {
  private readonly log = new Logger(AmPmService.name);

  constructor(
    private readonly ctx: AmContextService,
    private readonly maint: AmMaintService,
    private readonly wos: AmWorkOrdersService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  async must(rootId: string, id: string) {
    const p = await this.db.amPmPlan.findFirst({
      where: { id, businessId: rootId },
    });
    if (!p)
      throw amErr(AM_ERRORS.NOT_FOUND, 'Plan not found', HttpStatus.NOT_FOUND);
    return p;
  }

  private async validate(a: AmActor, b: PlanInput, exceptId: string | null) {
    if (!b.name?.trim() || !b.assetId || !b.interval)
      throw amErr(AM_ERRORS.INVALID, 'Name, asset and interval are required.');
    if (!['Time', 'Meter', 'Hybrid'].includes(b.trigger))
      throw amErr(AM_ERRORS.INVALID, 'Pick a trigger.');
    const x = await this.db.amAsset.findFirst({
      where: { id: b.assetId, businessId: a.rootId },
    });
    if (!x)
      throw amErr(AM_ERRORS.NOT_FOUND, 'ASSET_NOT_FOUND', HttpStatus.NOT_FOUND);
    if (FINAL_ASSET.includes(x.status))
      throw amErr(
        AM_ERRORS.CONFLICT,
        `${x.number} is ${x.status.toLowerCase()}.`,
        HttpStatus.CONFLICT,
      );
    if (!(Number.isInteger(b.interval) && b.interval > 0))
      throw amErr(
        AM_ERRORS.INVALID,
        'Interval must be a whole number above zero.',
      );
    if (b.trigger !== 'Meter' && !TIME_UNITS.includes(b.unit))
      throw amErr(
        AM_ERRORS.INVALID,
        'Time plans repeat in days, weeks, months or years.',
      );
    if (b.trigger !== 'Time') {
      if (!x.meterType)
        throw amErr(
          AM_ERRORS.INVALID,
          `${x.number} has no meter — meter and hybrid plans need one.`,
        );
      if (b.nextDueMeter == null || !(b.nextDueMeter > 0))
        throw amErr(
          AM_ERRORS.INVALID,
          'Meter and hybrid plans need a next due meter value.',
        );
      if (b.trigger === 'Hybrid' && !(b.meterInterval && b.meterInterval > 0))
        throw amErr(
          AM_ERRORS.INVALID,
          'Hybrid plans need a meter interval as well as a time interval.',
        );
    }
    if (b.trigger !== 'Meter' && !b.nextDueOn)
      throw amErr(AM_ERRORS.INVALID, 'Pick the next due date.');
    if (b.templateId) {
      const t = await this.db.amPmTemplate.findFirst({
        where: { id: b.templateId, businessId: a.rootId },
      });
      if (!t)
        throw amErr(
          AM_ERRORS.INVALID,
          'That PM template isn’t in this business.',
        );
      const clash = await this.db.amPmPlan.findFirst({
        where: {
          businessId: a.rootId,
          assetId: x.id,
          templateId: t.id,
          status: 'Active',
          ...(exceptId ? { id: { not: exceptId } } : {}),
        },
      });
      if (clash)
        throw amErr(
          AM_ERRORS.PM_CONFLICT,
          `MAINTENANCE_PLAN_CONFLICT — ${clash.name} already covers this asset with the same template.`,
          HttpStatus.CONFLICT,
        );
    }
    const who = await this.maint.checkWho(a.rootId, b.who);
    const lead = Math.max(0, Math.min(90, Math.round(b.leadDays ?? 7)));
    return { x, who, lead };
  }

  private data(
    b: PlanInput,
    who: {
      assigneeUserId: string | null;
      teamId: string | null;
      supplierId: string | null;
    },
    lead: number,
    unitOfMeter: string | null,
  ) {
    return {
      name: b.name.trim().slice(0, 160),
      assetId: b.assetId,
      templateId: b.templateId || null,
      trigger: b.trigger,
      interval: b.interval,
      unit: b.trigger === 'Meter' ? (unitOfMeter ?? 'units') : b.unit,
      nextDueOn: b.trigger === 'Meter' ? null : day(b.nextDueOn),
      nextDueMeter:
        b.trigger === 'Time' || b.nextDueMeter == null
          ? null
          : dec(b.nextDueMeter),
      meterInterval:
        b.trigger === 'Time'
          ? null
          : b.trigger === 'Meter'
            ? dec(b.interval)
            : dec(b.meterInterval ?? 0),
      ...who,
      autoCreate: b.autoCreate ?? true,
      leadDays: lead,
    };
  }

  async create(a: AmActor, b: PlanInput) {
    this.ctx.need(a, 'pm', 'Creating a PM plan');
    const { x, who, lead } = await this.validate(a, b, null);
    const cfg = await this.ctx.config(a.rootId);
    const p = await this.db.amPmPlan.create({
      data: {
        businessId: a.rootId,
        number: await this.ctx.number(a.rootId, 'pm'),
        ...this.data(b, who, lead, x.meterUnit),
        tolerance: (b.tolerance || cfg.pm.tolerance).slice(0, 40),
        status: 'Active',
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'PM plan created',
      'pm',
      p.id,
      `${p.number} · ${p.name} · ${x.number}`,
    );
    return p;
  }

  async update(a: AmActor, id: string, b: PlanInput) {
    this.ctx.need(a, 'pm', 'Editing a PM plan');
    const cur = await this.must(a.rootId, id);
    if (!['Active', 'Paused'].includes(cur.status))
      throw amErr(
        AM_ERRORS.CONFLICT,
        `This plan is ${cur.status}.`,
        HttpStatus.CONFLICT,
      );
    const { x, who, lead } = await this.validate(a, b, id);
    const p = await this.db.amPmPlan.update({
      where: { id },
      data: {
        ...this.data(b, who, lead, x.meterUnit),
        ...(b.tolerance ? { tolerance: b.tolerance.slice(0, 40) } : {}),
        version: { increment: 1 },
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'PM plan edited',
      'pm',
      id,
      `${p.number} · v${cur.version} → v${p.version}`,
    );
    return p;
  }

  /** The due instance key: date-based for time/hybrid plans, meter-based for meter plans. */
  keyOf(p: {
    number: string;
    trigger: string;
    nextDueOn: Date | null;
    nextDueMeter: Prisma.Decimal | null;
    unit: string;
  }) {
    if (p.trigger === 'Meter')
      return `${p.number}:${num(p.nextDueMeter)}${p.unit}`;
    return `${p.number}:${p.nextDueOn ? p.nextDueOn.toISOString().slice(0, 10) : 'none'}`;
  }

  /** Generates this due instance's work order once. Returns null when it already exists. */
  async generate(a: AmActor | 'System', rootId: string, planId: string) {
    const p = await this.must(rootId, planId);
    if (p.status !== 'Active')
      throw amErr(
        AM_ERRORS.CONFLICT,
        `This plan is ${p.status}.`,
        HttpStatus.CONFLICT,
      );
    const key = this.keyOf(p);
    const existing = await this.db.amPmInstance.findUnique({
      where: { planId_key: { planId: p.id, key } },
    });
    if (existing) return { created: null, key, existing };
    const x = await this.db.amAsset.findUniqueOrThrow({
      where: { id: p.assetId },
    });
    const tpl = p.templateId
      ? await this.db.amPmTemplate.findUnique({ where: { id: p.templateId } })
      : null;
    const due = p.nextDueOn ?? new Date();
    const who = p.supplierId
      ? `s:${p.supplierId}`
      : p.assigneeUserId
        ? `u:${p.assigneeUserId}`
        : p.teamId
          ? `t:${p.teamId}`
          : undefined;
    try {
      return await this.db.$transaction(async (tx) => {
        // Claim the key first: a concurrent run or double click fails on the unique index here.
        const inst = await tx.amPmInstance.create({
          data: { planId: p.id, key, status: 'Generated' },
        });
        const out = await this.wos.createIn(
          tx,
          a,
          rootId,
          {
            assetId: x.id,
            type: 'Preventive',
            priority: x.criticality === 'Critical' ? 'High' : 'Medium',
            scope: `${p.name}${tpl ? ` (${tpl.name})` : ''}`,
            due: due.toISOString().slice(0, 10),
            who,
            checklist:
              tpl && Array.isArray(tpl.checklist)
                ? (tpl.checklist as string[])
                : [],
          },
          { pmPlanId: p.id, pmKey: key },
        );
        await tx.amPmInstance.update({
          where: { id: inst.id },
          data: { woId: out.wo.id },
        });
        await this.ctx.audit(
          rootId,
          a,
          'PM work order generated',
          'pm',
          p.id,
          `${out.wo.number} from ${p.number} · due_instance_key ${key}`,
          { tx },
        );
        return { created: out.wo, key, existing: null };
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const ex = await this.db.amPmInstance.findUnique({
          where: { planId_key: { planId: p.id, key } },
        });
        return { created: null, key, existing: ex };
      }
      throw e;
    }
  }

  async generateManual(a: AmActor, planId: string) {
    this.ctx.need(a, 'pm', 'Generating a PM work order');
    const r = await this.generate(a, a.rootId, planId);
    if (!r.created) {
      const w = r.existing?.woId
        ? await this.db.amWorkOrder.findUnique({
            where: { id: r.existing.woId },
            select: { number: true },
          })
        : null;
      throw amErr(
        AM_ERRORS.PM_DUP,
        `DUPLICATE_PM_DUE_INSTANCE — ${r.key} already generated ${w?.number ?? 'a work order'}. No new work order created.`,
        HttpStatus.CONFLICT,
      );
    }
    return r.created;
  }

  /** Days until a plan is due in the business timezone (meter plans past their meter: 0). */
  private async dueDays(
    rootId: string,
    p: {
      trigger: string;
      nextDueOn: Date | null;
      nextDueMeter: Prisma.Decimal | null;
      meterInterval: Prisma.Decimal | null;
      assetId: string;
    },
    tz: string,
  ) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
      new Date(),
    );
    const byDate = p.nextDueOn
      ? Math.round(
          (Date.parse(p.nextDueOn.toISOString().slice(0, 10)) -
            Date.parse(today)) /
            86400000,
        )
      : null;
    if (p.trigger !== 'Time' && p.nextDueMeter != null) {
      const rs = await this.db.amReading.findMany({
        where: { assetId: p.assetId },
        orderBy: [{ takenAt: 'asc' }, { createdAt: 'asc' }],
      });
      const corrected = new Set(
        rs.filter((r) => r.correctionOfId).map((r) => r.correctionOfId),
      );
      const eff = rs.filter((r) => !corrected.has(r.id));
      const m = eff.length ? num(eff[eff.length - 1].value) : null;
      // Within 5% of the meter interval counts as due now.
      const lead = num(p.meterInterval) * 0.05;
      if (m != null && m >= num(p.nextDueMeter) - lead)
        return byDate == null ? 0 : Math.min(byDate, 0);
    }
    return byDate;
  }

  /** The PM due evaluator: auto plans within their lead time get exactly one work order per due instance. */
  async evaluate(rootId: string, a: AmActor | 'System' = 'System') {
    const biz = await this.ctx.business(rootId);
    const plans = await this.db.amPmPlan.findMany({
      where: { businessId: rootId, status: 'Active', autoCreate: true },
      orderBy: { number: 'asc' },
    });
    const made: string[] = [];
    const skipped: string[] = [];
    const notDue: string[] = [];
    for (const p of plans) {
      const n = await this.dueDays(rootId, p, biz.timezone || 'UTC');
      if (n == null || n > p.leadDays) {
        notDue.push(p.number);
        continue;
      }
      try {
        const r = await this.generate(a, rootId, p.id);
        if (r.created) made.push(r.created.number);
        else skipped.push(p.number);
      } catch (e) {
        this.log.warn(`PM ${p.number}: ${(e as Error).message}`);
        skipped.push(p.number);
      }
    }
    return { made, skipped, notDue: notDue.length };
  }

  async runNow(a: AmActor) {
    this.ctx.need(a, 'pm', 'Running the PM evaluator');
    const r = await this.evaluate(a.rootId, a);
    await this.ctx.audit(
      a.rootId,
      a,
      'PM evaluator run',
      'pm',
      a.rootId,
      `${r.made.length} created (${r.made.join(', ') || '—'}) · ${r.skipped.length} already generated`,
    );
    return r;
  }

  async reschedule(
    a: AmActor,
    id: string,
    b: { date: string; reason: string },
  ) {
    this.ctx.need(a, 'pm', 'Rescheduling a plan');
    const p = await this.must(a.rootId, id);
    if (!b.reason?.trim() || !b.date)
      throw amErr(AM_ERRORS.INVALID, 'Date and reason are required.');
    if (p.trigger === 'Meter')
      throw amErr(
        AM_ERRORS.INVALID,
        'Meter plans are due by meter — edit the next due meter instead.',
      );
    const row = await this.db.amPmPlan.update({
      where: { id },
      data: { nextDueOn: day(b.date), version: { increment: 1 } },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'PM rescheduled',
      'pm',
      id,
      `${p.number} → ${b.date} · reason: ${b.reason.trim()}`,
    );
    return row;
  }

  async setStatus(a: AmActor, id: string, act: 'Pause' | 'Resume' | 'Archive') {
    this.ctx.need(a, 'pm', `${act} a plan`);
    const p = await this.must(a.rootId, id);
    const to = { Pause: 'Paused', Resume: 'Active', Archive: 'Archived' }[act];
    const ok = {
      Pause: ['Active'],
      Resume: ['Paused'],
      Archive: ['Active', 'Paused'],
    }[act];
    if (!ok.includes(p.status))
      throw amErr(
        AM_ERRORS.TRANSITION,
        `INVALID_STATUS_TRANSITION — the plan is ${p.status}.`,
        HttpStatus.CONFLICT,
      );
    const row = await this.db.amPmPlan.update({
      where: { id },
      data: { status: to, version: { increment: 1 } },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      `PM plan ${to.toLowerCase()}`,
      'pm',
      id,
      p.number,
    );
    return row;
  }
}
