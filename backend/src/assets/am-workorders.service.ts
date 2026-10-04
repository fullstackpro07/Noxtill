import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import {
  AmActor,
  AmContextService,
  Tx,
  amErr,
  corrId,
  dec,
  num,
  r2,
} from './am-context.service';
import { AmMaintService } from './am-maint.service';
import {
  AM_ERRORS,
  ASSET_T,
  CONDITIONS,
  DONE_WO,
  FINAL_ASSET,
  WO_ACT,
  WO_T,
} from './am.constants';

const day = (s?: string | null) =>
  s ? new Date(`${s.slice(0, 10)}T00:00:00Z`) : null;
const endOfDay = (s: string) => new Date(`${s.slice(0, 10)}T23:59:59Z`);
const OUTCOMES = [
  'Resolved',
  'Partially Resolved',
  'Temporary Repair',
  'Replacement Required',
  'Unable to Repair',
  'Other',
];

export interface WoInput {
  assetId: string;
  type?: string;
  scope: string;
  priority?: string;
  safety?: boolean;
  who?: string;
  start?: string;
  due: string;
  expectedDownH?: number | null;
  checklist?: string[];
  parts?: { productId: string; qty: number }[];
  estCost?: number | null;
}

/** Adds n units of a plan's interval to a date (UTC days). */
export function addInterval(from: Date, n: number, unit: string) {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  if (unit === 'days') d.setUTCDate(d.getUTCDate() + n);
  else if (unit === 'weeks') d.setUTCDate(d.getUTCDate() + 7 * n);
  else if (unit === 'years') d.setUTCFullYear(d.getUTCFullYear() + n);
  else d.setUTCMonth(d.getUTCMonth() + n);
  return d;
}

/** Maintenance work orders: creation (direct / converted / PM), the WO_T state machine, parts, labor, costs, completion. */
@Injectable()
export class AmWorkOrdersService {
  constructor(
    private readonly ctx: AmContextService,
    private readonly maint: AmMaintService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  async must(rootId: string, id: string) {
    const w = await this.db.amWorkOrder.findFirst({
      where: { id, businessId: rootId },
      include: {
        parts: { include: { moves: true } },
        labor: true,
        costs: true,
        checklist: true,
      },
    });
    if (!w)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'Work order not found',
        HttpStatus.NOT_FOUND,
      );
    return w;
  }

  private async assetOf(rootId: string, id: string) {
    const x = await this.db.amAsset.findFirst({
      where: { id, businessId: rootId },
    });
    if (!x)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'ASSET_NOT_FOUND — that asset isn’t in this business.',
        HttpStatus.NOT_FOUND,
      );
    return x;
  }

  /** Planned parts → validated stock products with their cost. */
  private async partRows(
    rootId: string,
    parts: { productId: string; qty: number }[],
  ) {
    if (!parts.length) return [];
    const group = (await this.ctx.branches(rootId)).map((g) => g.id);
    const prods = await this.db.product.findMany({
      where: {
        id: { in: parts.map((p) => p.productId) },
        businessId: { in: group },
      },
      select: { id: true, name: true, kind: true, costPrice: true },
    });
    return parts.map((p) => {
      const pr = prods.find((x) => x.id === p.productId);
      if (!pr)
        throw amErr(
          AM_ERRORS.INVALID,
          'A planned part isn’t an Inventory item in this business.',
        );
      if (pr.kind !== 'product')
        throw amErr(
          AM_ERRORS.INVALID,
          `${pr.name} is a service, not a stock item.`,
        );
      const qty = Math.round(Number(p.qty) || 1);
      if (qty < 1)
        throw amErr(AM_ERRORS.INVALID, 'Part quantities must be at least 1.');
      return { productId: pr.id, qty, cost: num(pr.costPrice), name: pr.name };
    });
  }

  /** Creates a work order inside a transaction. Starts as Draft when the estimate is above the
   * criticality approval threshold (Asset Settings › Criticality) or the creator can't approve. */
  async createIn(
    tx: Tx,
    a: AmActor | 'System',
    rootId: string,
    b: WoInput,
    src: { requestId?: string; pmPlanId?: string; pmKey?: string } = {},
  ) {
    const x = await tx.amAsset.findFirst({
      where: { id: b.assetId, businessId: rootId },
    });
    if (!x)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'ASSET_NOT_FOUND — that asset isn’t in this business.',
        HttpStatus.NOT_FOUND,
      );
    if (FINAL_ASSET.includes(x.status))
      throw amErr(
        AM_ERRORS.CONFLICT,
        `${x.number} is ${x.status.toLowerCase()} — no new work can be scheduled.`,
        HttpStatus.CONFLICT,
      );
    const cfg = await this.ctx.config(rootId);
    const type = b.type || 'Corrective';
    if (!cfg.mtypes.includes(type))
      throw amErr(AM_ERRORS.INVALID, 'Unknown maintenance type.');
    const priority = b.priority || 'Medium';
    if (!cfg.priorities.includes(priority))
      throw amErr(AM_ERRORS.INVALID, 'Unknown priority.');
    if (!b.scope?.trim()) throw amErr(AM_ERRORS.INVALID, 'Scope is required.');
    if (!b.due) throw amErr(AM_ERRORS.INVALID, 'Due date required.');
    const who = await this.maint.checkWho(rootId, b.who);
    const parts = await this.partRows(rootId, b.parts ?? []);
    const est =
      parts.reduce((s, p) => s + p.qty * p.cost, 0) +
      Math.max(0, Number(b.estCost) || 0);
    const rule = cfg.criticality.find((c) => c.level === x.criticality);
    const above = !!rule && est > rule.approvalAbove;
    const canApprove = a === 'System' ? false : a.approve;
    const draft = above || !canApprove;
    const number = await this.ctx.number(rootId, 'wo', tx);
    const w = await tx.amWorkOrder.create({
      data: {
        businessId: rootId,
        number,
        assetId: x.id,
        type,
        priority,
        safety: !!b.safety,
        status:
          a === 'System'
            ? above
              ? 'Draft'
              : 'Approved'
            : draft
              ? 'Draft'
              : 'Approved',
        ...who,
        scheduledAt: day(b.start),
        dueAt: endOfDay(b.due),
        expectedDownH:
          b.expectedDownH != null && b.expectedDownH > 0
            ? dec(b.expectedDownH)
            : null,
        requestId: src.requestId ?? null,
        pmPlanId: src.pmPlanId ?? null,
        pmKey: src.pmKey ?? null,
        scope: b.scope.trim(),
        approvedById: !draft && a !== 'System' ? a.userId : null,
        createdById: a === 'System' ? 'System' : a.userId,
        checklist: {
          create: (b.checklist ?? [])
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 50)
            .map((text, i) => ({ seq: i, text: text.slice(0, 255) })),
        },
        parts: {
          create: parts.map((p) => ({
            productId: p.productId,
            planned: p.qty,
          })),
        },
      },
    });
    // Link the asset's open downtime that has no work order yet.
    await tx.amDowntime.updateMany({
      where: { assetId: x.id, endAt: null, woId: null },
      data: { woId: w.id },
    });
    await this.ctx.audit(
      rootId,
      a,
      'Work order created',
      'wo',
      w.id,
      `${number} · ${x.number} · ${type} · ${w.status}${above ? ` (estimate ${r2(est)} above the ${x.criticality} approval threshold ${rule.approvalAbove})` : ''}`,
      { tx },
    );
    return { wo: w, draft: w.status === 'Draft', above, estimate: r2(est) };
  }

  async create(a: AmActor, b: WoInput) {
    this.ctx.need(a, 'approve', 'Creating a work order');
    const res = await this.db.$transaction((tx) =>
      this.createIn(tx, a, a.rootId, b),
    );
    if (res.draft) await this.notifyApprovers(a, res.wo.number, res.wo.id);
    return res;
  }

  private async notifyApprovers(a: AmActor, number: string, _id: string) {
    const owners = await this.ctx.roleUsers(a.rootId, [Role.owner]);
    await this.ctx.notify(
      a.rootId,
      owners,
      `${number} needs approval`,
      'Above the criticality approval threshold',
      '/assets-maintenance/work-orders',
      a.userId,
    );
  }

  async convert(
    a: AmActor,
    reqId: string,
    b: Omit<WoInput, 'assetId' | 'scope'> & { scope?: string },
  ) {
    this.ctx.need(a, 'approve', 'Converting a request');
    const r = await this.maint.mustReq(a.rootId, reqId);
    if (r.status === 'Converted' || r.woId)
      throw amErr(
        AM_ERRORS.CONFLICT,
        'Already converted.',
        HttpStatus.CONFLICT,
      );
    if (
      ![
        'Open',
        'Awaiting Triage',
        'Needs Information',
        'Approved',
        'Draft',
      ].includes(r.status)
    )
      throw amErr(
        AM_ERRORS.TRANSITION,
        `INVALID_STATUS_TRANSITION — ${r.number} is ${r.status}.`,
        HttpStatus.CONFLICT,
      );
    const res = await this.db.$transaction(async (tx) => {
      const out = await this.createIn(
        tx,
        a,
        a.rootId,
        {
          ...b,
          assetId: r.assetId,
          scope:
            b.scope?.trim() ||
            `${r.title}${r.description ? ` — ${r.description}` : ''}`,
          safety: b.safety ?? r.safety,
          priority: b.priority ?? r.priority,
        },
        { requestId: r.id },
      );
      await tx.amRequest.update({
        where: { id: r.id },
        data: {
          status: 'Converted',
          woId: out.wo.id,
          triagedAt: r.triagedAt ?? new Date(),
        },
      });
      await tx.amRequestNote.create({
        data: {
          requestId: r.id,
          text: `Converted to ${out.wo.number} (request kept, linked)`,
          byUserId: a.userId,
        },
      });
      return out;
    });
    if (res.draft) await this.notifyApprovers(a, res.wo.number, res.wo.id);
    return res;
  }

  // ── state machine ─────────────────────────────────────────────────────

  private rightFor(to: string): 'approve' | 'start' | 'complete' {
    if (
      ['Approved', 'Scheduled', 'Assigned', 'Closed', 'Cancelled'].includes(to)
    )
      return 'approve';
    if (to === 'Completed') return 'complete';
    return 'start';
  }

  async move(a: AmActor, id: string, action: string, reason?: string) {
    const to = WO_ACT[action];
    if (!to) throw amErr(AM_ERRORS.INVALID, `Unknown action “${action}”.`);
    if (to === 'Completed')
      throw amErr(AM_ERRORS.INVALID, 'Use Complete to record the outcome.');
    const w = await this.must(a.rootId, id);
    this.ctx.need(a, this.rightFor(to), `${action} on ${w.number}`);
    if (!(WO_T[w.status] ?? []).includes(to))
      throw amErr(
        AM_ERRORS.TRANSITION,
        `INVALID_STATUS_TRANSITION — ${w.number} can’t go ${w.status} → ${to}.`,
        HttpStatus.CONFLICT,
      );
    if (to === 'Cancelled' && !reason?.trim())
      throw amErr(AM_ERRORS.INVALID, 'A reason is required.');
    if (to === 'In Progress' && w.status === 'Waiting Parts') {
      const short: string[] = [];
      for (const p of w.parts.filter(
        (x) => x.issued - x.returned < x.planned,
      )) {
        const pr = await this.db.product.findUnique({
          where: { id: p.productId },
          select: { name: true, stockQty: true },
        });
        const need = p.planned - (p.issued - p.returned);
        if (pr && pr.stockQty < need)
          short.push(`${pr.name} (need ${need}, Inventory has ${pr.stockQty})`);
      }
      if (short.length)
        throw amErr(
          AM_ERRORS.PART,
          `PART_NOT_AVAILABLE — ${short.join('; ')}.`,
          HttpStatus.CONFLICT,
        );
    }
    const x = await this.assetOf(a.rootId, w.assetId);
    return this.db.$transaction(async (tx) => {
      const data: Prisma.AmWorkOrderUncheckedUpdateInput = {
        status: to,
        version: { increment: 1 },
      };
      if (to === 'Approved') data.approvedById = a.userId;
      if (to === 'In Progress' && !w.startedAt) data.startedAt = new Date();
      if (to === 'In Progress' && w.status === 'Completed') {
        data.completedAt = null;
        data.outcome = null;
      }
      if (to === 'Closed') data.closedAt = new Date();
      const res = await tx.amWorkOrder.updateMany({
        where: { id, version: w.version },
        data,
      });
      if (!res.count)
        throw amErr(
          AM_ERRORS.VERSION,
          `VERSION_CONFLICT — ${w.number} changed just now. Reload.`,
          HttpStatus.CONFLICT,
        );
      if (to === 'In Progress') {
        if (x.status === 'Active')
          await tx.amAsset.update({
            where: { id: x.id },
            data: { status: 'Under Maintenance', version: { increment: 1 } },
          });
        const open = await tx.amDowntime.findFirst({
          where: { assetId: x.id, endAt: null },
        });
        if (!open && w.expectedDownH && num(w.expectedDownH) > 0)
          await tx.amDowntime.create({
            data: {
              businessId: a.rootId,
              assetId: x.id,
              startAt: new Date(),
              kind: ['Preventive', 'Calibration', 'Inspection'].includes(w.type)
                ? 'Planned'
                : 'Unplanned',
              reason: 'Maintenance',
              cause: w.scope.slice(0, 255),
              woId: w.id,
              byUserId: a.userId,
            },
          });
        else if (open && !open.woId)
          await tx.amDowntime.update({
            where: { id: open.id },
            data: { woId: w.id },
          });
      }
      if (to === 'Cancelled' && w.pmPlanId && w.pmKey)
        // Release the due instance so the evaluator can generate it again; the row stays for history.
        await tx.amPmInstance.updateMany({
          where: { planId: w.pmPlanId, key: w.pmKey },
          data: {
            status: 'Cancelled',
            key: `${w.pmKey}~x~${w.id.slice(0, 8)}`.slice(0, 80),
          },
        });
      await this.ctx.audit(
        a.rootId,
        a,
        `Work order ${to.toLowerCase()}`,
        'wo',
        id,
        `${w.number} · ${w.status} → ${to}${reason ? ` · reason: ${reason.trim()}` : ''}`,
        { tx },
      );
      return tx.amWorkOrder.findUniqueOrThrow({ where: { id } });
    });
  }

  async assign(a: AmActor, id: string, who: string) {
    this.ctx.need(a, 'approve', 'Assigning a work order');
    const w = await this.must(a.rootId, id);
    if (DONE_WO.includes(w.status))
      throw amErr(
        AM_ERRORS.TRANSITION,
        `${w.number} is ${w.status}.`,
        HttpStatus.CONFLICT,
      );
    if (!who) throw amErr(AM_ERRORS.INVALID, 'Pick an assignee.');
    const sel = await this.maint.checkWho(a.rootId, who);
    const st = (WO_T[w.status] ?? []).includes('Assigned')
      ? 'Assigned'
      : w.status;
    const row = await this.db.amWorkOrder.update({
      where: { id },
      data: { ...sel, status: st, version: { increment: 1 } },
    });
    if (sel.assigneeUserId)
      await this.ctx.notify(
        a.rootId,
        [sel.assigneeUserId],
        `${w.number} assigned to you`,
        w.scope.slice(0, 120),
        '/assets-maintenance/work-orders',
        a.userId,
      );
    else if (sel.teamId) {
      const mem = await this.db.amTeamMember.findMany({
        where: { teamId: sel.teamId },
        select: { userId: true },
      });
      await this.ctx.notify(
        a.rootId,
        mem.map((m) => m.userId),
        `${w.number} assigned to your team`,
        w.scope.slice(0, 120),
        '/assets-maintenance/work-orders',
        a.userId,
      );
    }
    await this.ctx.audit(
      a.rootId,
      a,
      'Work order assigned',
      'wo',
      id,
      `${w.number} → ${who}`,
    );
    return row;
  }

  async schedule(
    a: AmActor,
    id: string,
    b: { date: string; time?: string; due?: string },
  ) {
    this.ctx.need(a, 'approve', 'Scheduling a work order');
    const w = await this.must(a.rootId, id);
    if (!b.date) throw amErr(AM_ERRORS.INVALID, 'Pick a date.');
    if (!(WO_T[w.status] ?? []).includes('Scheduled'))
      throw amErr(
        AM_ERRORS.TRANSITION,
        `INVALID_STATUS_TRANSITION — ${w.number} can’t be scheduled from ${w.status}.`,
        HttpStatus.CONFLICT,
      );
    const t = /^\d{2}:\d{2}$/.test(b.time ?? '') ? b.time! : '09:00';
    const at = new Date(`${b.date.slice(0, 10)}T${t}:00Z`);
    const row = await this.db.amWorkOrder.update({
      where: { id },
      data: {
        status: 'Scheduled',
        scheduledAt: at,
        ...(b.due ? { dueAt: endOfDay(b.due) } : {}),
        version: { increment: 1 },
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Work order scheduled',
      'wo',
      id,
      `${w.number} · ${b.date} ${t}`,
    );
    return row;
  }

  async setPriority(a: AmActor, id: string, priority: string, reason?: string) {
    this.ctx.need(a, 'approve', 'Changing priority');
    const w = await this.must(a.rootId, id);
    const cfg = await this.ctx.config(a.rootId);
    if (!cfg.priorities.includes(priority))
      throw amErr(AM_ERRORS.INVALID, 'Unknown priority.');
    const row = await this.db.amWorkOrder.update({
      where: { id },
      data: { priority },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Priority changed',
      'wo',
      id,
      `${w.number} · ${w.priority} → ${priority}${reason ? ` · ${reason}` : ''}`,
    );
    return row;
  }

  async toggleCheck(a: AmActor, id: string, itemId: string) {
    this.ctx.need(a, 'start', 'Updating the checklist');
    const w = await this.must(a.rootId, id);
    const c = w.checklist.find((x) => x.id === itemId);
    if (!c)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'Checklist item not found',
        HttpStatus.NOT_FOUND,
      );
    if (['Closed', 'Cancelled'].includes(w.status))
      throw amErr(
        AM_ERRORS.CONFLICT,
        `${w.number} is ${w.status}.`,
        HttpStatus.CONFLICT,
      );
    return this.db.amWoChecklist.update({
      where: { id: itemId },
      data: {
        done: !c.done,
        doneById: c.done ? null : a.userId,
        doneAt: c.done ? null : new Date(),
      },
    });
  }

  // ── parts (real Inventory movements) ──────────────────────────────────

  async addPart(a: AmActor, id: string, b: { productId: string; qty: number }) {
    this.ctx.need(a, 'start', 'Planning parts');
    const w = await this.must(a.rootId, id);
    if (['Closed', 'Cancelled', 'Completed'].includes(w.status))
      throw amErr(
        AM_ERRORS.CONFLICT,
        `${w.number} is ${w.status}.`,
        HttpStatus.CONFLICT,
      );
    const [p] = await this.partRows(a.rootId, [b]);
    const ex = w.parts.find((x) => x.productId === p.productId);
    if (ex)
      return this.db.amWoPart.update({
        where: { id: ex.id },
        data: { planned: ex.planned + p.qty },
      });
    return this.db.amWoPart.create({
      data: { woId: id, productId: p.productId, planned: p.qty },
    });
  }

  /** Issues every planned-but-unissued part from Inventory. Stock moves only here, atomically. */
  async issueParts(a: AmActor, id: string) {
    this.ctx.need(a, 'start', 'Issuing parts');
    const w = await this.must(a.rootId, id);
    if (['Closed', 'Cancelled', 'Completed'].includes(w.status))
      throw amErr(
        AM_ERRORS.CONFLICT,
        `${w.number} is ${w.status}.`,
        HttpStatus.CONFLICT,
      );
    const need = w.parts.filter((p) => p.issued - p.returned < p.planned);
    if (!need.length)
      throw amErr(AM_ERRORS.INVALID, 'Every planned part is already issued.');
    const issued: string[] = [];
    const short: string[] = [];
    for (const p of need) {
      const want = p.planned - (p.issued - p.returned);
      const res = await this.db.$transaction(async (tx) => {
        const pr = await tx.product.findUniqueOrThrow({
          where: { id: p.productId },
        });
        const q = Math.min(want, Math.max(0, pr.stockQty));
        if (q <= 0) return { q: 0, name: pr.name, have: pr.stockQty };
        const dec1 = await tx.product.updateMany({
          where: { id: pr.id, stockQty: { gte: q } },
          data: { stockQty: { decrement: q } },
        });
        if (!dec1.count) return { q: 0, name: pr.name, have: pr.stockQty };
        const mv = await tx.stockMovement.create({
          data: {
            businessId: pr.businessId,
            productId: pr.id,
            kind: 'maintenance',
            qty: -q,
            unitCost: pr.costPrice,
            reason: `Maintenance issue · ${w.number}`,
          },
        });
        const move = await tx.amWoPartMove.create({
          data: {
            partId: p.id,
            stockMovementId: mv.id,
            qty: -q,
            unitCost: pr.costPrice,
            byUserId: a.userId,
          },
        });
        await tx.amWoPart.update({
          where: { id: p.id },
          data: { issued: { increment: q } },
        });
        await tx.amWoCost.create({
          data: {
            woId: w.id,
            type: 'Parts',
            amount: dec(q * num(pr.costPrice)),
            source: `part:${move.id}`,
            note: `${q} × ${pr.name}`,
          },
        });
        return { q, name: pr.name, have: pr.stockQty, mv: mv.id };
      });
      if (res.q)
        issued.push(`${res.q}× ${res.name} → SM-${res.mv!.slice(0, 8)}`);
      if (res.q < want)
        short.push(`${res.name} (need ${want}, Inventory had ${res.have})`);
    }
    if (!issued.length)
      throw amErr(
        AM_ERRORS.PART,
        `PART_NOT_AVAILABLE — ${short.join('; ')}. No stock moved.`,
        HttpStatus.CONFLICT,
      );
    await this.ctx.audit(
      a.rootId,
      a,
      'Parts issued',
      'wo',
      id,
      `${w.number} · ${issued.join(', ')}${short.length ? ` · short: ${short.join('; ')}` : ''}`,
    );
    return { issued, short };
  }

  async returnPart(a: AmActor, id: string, partId: string, qty: number) {
    this.ctx.need(a, 'start', 'Returning parts');
    const w = await this.must(a.rootId, id);
    const p = w.parts.find((x) => x.id === partId);
    if (!p)
      throw amErr(AM_ERRORS.NOT_FOUND, 'Part not found', HttpStatus.NOT_FOUND);
    const q = Math.round(Number(qty));
    const avail = p.issued - p.returned - p.used;
    if (!(q >= 1 && q <= avail))
      throw amErr(AM_ERRORS.INVALID, `You can return 1–${avail} of this part.`);
    return this.db.$transaction(async (tx) => {
      const pr = await tx.product.findUniqueOrThrow({
        where: { id: p.productId },
      });
      const unit = p.moves.find((m) => m.qty < 0)?.unitCost ?? pr.costPrice;
      await tx.product.update({
        where: { id: pr.id },
        data: { stockQty: { increment: q } },
      });
      const mv = await tx.stockMovement.create({
        data: {
          businessId: pr.businessId,
          productId: pr.id,
          kind: 'maintenance',
          qty: q,
          unitCost: unit,
          reason: `Maintenance return · ${w.number}`,
        },
      });
      const move = await tx.amWoPartMove.create({
        data: {
          partId: p.id,
          stockMovementId: mv.id,
          qty: q,
          unitCost: unit,
          byUserId: a.userId,
        },
      });
      await tx.amWoPart.update({
        where: { id: p.id },
        data: { returned: { increment: q } },
      });
      await tx.amWoCost.create({
        data: {
          woId: w.id,
          type: 'Parts',
          amount: dec(-q * num(unit)),
          source: `part:${move.id}`,
          note: `Returned ${q} × ${pr.name}`,
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Parts returned',
        'wo',
        id,
        `${w.number} · ${q}× ${pr.name}`,
        { tx },
      );
      return { ok: true };
    });
  }

  // ── labor & cost references ───────────────────────────────────────────

  private async rateOf(rootId: string, userId: string) {
    const group = (await this.ctx.branches(rootId)).map((g) => g.id);
    const m = await this.db.businessUser.findFirst({
      where: { userId, businessId: { in: group }, hourlyRate: { not: null } },
      select: { hourlyRate: true },
    });
    return m?.hourlyRate ?? null;
  }

  async logLabor(
    a: AmActor,
    id: string,
    b: { userId?: string; hours: number },
    tx?: Tx,
  ) {
    // Inside completion the completer logs their own hours (assets.complete is enough).
    if (!tx) this.ctx.need(a, 'start', 'Logging labor');
    const w = await this.must(a.rootId, id);
    const h = Number(b.hours);
    if (!(h > 0 && h <= 200))
      throw amErr(AM_ERRORS.INVALID, 'Hours must be between 0 and 200.');
    const userId = b.userId || a.userId;
    if (userId !== a.userId) await this.maint.checkWho(a.rootId, `u:${userId}`);
    const rate = await this.rateOf(a.rootId, userId);
    const db = tx ?? this.db;
    const l = await db.amWoLabor.create({
      data: { woId: w.id, userId, hours: dec(h), rate },
    });
    if (rate != null)
      await db.amWoCost.create({
        data: {
          woId: w.id,
          type: 'Labor',
          amount: dec(h * num(rate)),
          source: `labor:${l.id}`,
          note: `${h} h × ${num(rate)}/h`,
        },
      });
    return { labor: l, rated: rate != null };
  }

  async addCost(
    a: AmActor,
    id: string,
    b: { type: string; amount: number; finBillId?: string; note?: string },
  ) {
    this.ctx.need(a, 'cost', 'Adding a cost');
    this.ctx.need(a, 'start', 'Adding a cost');
    const w = await this.must(a.rootId, id);
    if (!['Vendor', 'Other'].includes(b.type))
      throw amErr(
        AM_ERRORS.INVALID,
        'Labor and parts costs come from logged hours and issued parts.',
      );
    const amt = Number(b.amount);
    if (!(amt > 0))
      throw amErr(AM_ERRORS.INVALID, 'Amount must be more than zero.');
    if (
      b.finBillId &&
      !(await this.db.finBill.findFirst({
        where: { id: b.finBillId, businessId: a.rootId },
      }))
    )
      throw amErr(AM_ERRORS.INVALID, 'That Finance bill isn’t in this ledger.');
    const c = await this.db.amWoCost.create({
      data: {
        woId: w.id,
        type: b.type,
        amount: dec(amt),
        source: 'entry',
        finBillId: b.finBillId || null,
        note: b.note?.trim().slice(0, 255) || null,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Cost added',
      'wo',
      id,
      `${w.number} · ${b.type} ${amt}${b.finBillId ? ' · linked to Finance bill' : ' · not billed yet'}`,
    );
    return c;
  }

  async linkBill(a: AmActor, costId: string, finBillId: string | null) {
    this.ctx.need(a, 'cost', 'Linking a Finance bill');
    const c = await this.db.amWoCost.findFirst({
      where: { id: costId },
      include: { wo: { select: { businessId: true, number: true, id: true } } },
    });
    if (!c || c.wo.businessId !== a.rootId)
      throw amErr(AM_ERRORS.NOT_FOUND, 'Cost not found', HttpStatus.NOT_FOUND);
    if (!['Vendor', 'Other'].includes(c.type))
      throw amErr(
        AM_ERRORS.INVALID,
        'Only vendor and other costs link to bills.',
      );
    if (
      finBillId &&
      !(await this.db.finBill.findFirst({
        where: { id: finBillId, businessId: a.rootId },
      }))
    )
      throw amErr(AM_ERRORS.INVALID, 'That Finance bill isn’t in this ledger.');
    const row = await this.db.amWoCost.update({
      where: { id: costId },
      data: { finBillId },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      finBillId ? 'Cost linked to bill' : 'Cost unlinked from bill',
      'wo',
      c.wo.id,
      c.wo.number,
    );
    return row;
  }

  // ── completion ────────────────────────────────────────────────────────

  async complete(
    a: AmActor,
    id: string,
    b: {
      outcome: string;
      work: string;
      condition: string;
      reading?: number | null;
      laborHours?: number | null;
      vendorCost?: number | null;
      finBillId?: string;
      endDowntime?: boolean;
      statusAfter?: string;
      next?: string;
      followUp?: boolean;
    },
  ) {
    this.ctx.need(a, 'complete', 'Completing a work order');
    const w = await this.must(a.rootId, id);
    if (!(WO_T[w.status] ?? []).includes('Completed'))
      throw amErr(
        AM_ERRORS.TRANSITION,
        `INVALID_STATUS_TRANSITION — ${w.number} can’t be completed from ${w.status}. Start it first.`,
        HttpStatus.CONFLICT,
      );
    if (!OUTCOMES.includes(b.outcome) || !b.work?.trim())
      throw amErr(
        AM_ERRORS.INVALID,
        'Outcome and work performed are required.',
      );
    if (!CONDITIONS.includes(b.condition as never) || b.condition === 'Unknown')
      throw amErr(AM_ERRORS.INVALID, 'Pick the condition after the work.');
    if (b.vendorCost && !a.cost)
      throw amErr(
        AM_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — entering costs needs “assets.cost”.',
        HttpStatus.FORBIDDEN,
      );
    const x = await this.assetOf(a.rootId, w.assetId);
    const corr = corrId();
    const out = await this.db.$transaction(async (tx) => {
      if (b.reading != null && x.meterType)
        await this.maint.recordReading(
          a,
          { assetId: x.id, value: b.reading, source: `Completion ${w.number}` },
          { tx, skipRight: true },
        );
      if (b.laborHours && b.laborHours > 0)
        await this.logLabor(a, id, { hours: b.laborHours }, tx);
      if (b.vendorCost && b.vendorCost > 0) {
        if (
          b.finBillId &&
          !(await tx.finBill.findFirst({
            where: { id: b.finBillId, businessId: a.rootId },
          }))
        )
          throw amErr(
            AM_ERRORS.INVALID,
            'That Finance bill isn’t in this ledger.',
          );
        await tx.amWoCost.create({
          data: {
            woId: id,
            type: w.supplierId ? 'Vendor' : 'Other',
            amount: dec(b.vendorCost),
            source: 'entry',
            finBillId: b.finBillId || null,
          },
        });
      }
      for (const p of w.parts)
        await tx.amWoPart.update({
          where: { id: p.id },
          data: { used: p.issued - p.returned },
        });
      // The completer attests the checklist was carried out.
      await tx.amWoChecklist.updateMany({
        where: { woId: id, done: false },
        data: { done: true, doneById: a.userId, doneAt: new Date() },
      });
      const ended = b.endDowntime
        ? await tx.amDowntime.updateMany({
            where: { assetId: x.id, endAt: null },
            data: { endAt: new Date() },
          })
        : { count: 0 };
      await tx.amWorkOrder.update({
        where: { id },
        data: {
          status: 'Completed',
          completedAt: new Date(),
          outcome: b.outcome,
          workDone: b.work.trim(),
          version: { increment: 1 },
        },
      });
      const after =
        b.statusAfter &&
        (b.statusAfter === x.status ||
          (ASSET_T[x.status] ?? []).includes(b.statusAfter))
          ? b.statusAfter
          : x.status;
      await tx.amAsset.update({
        where: { id: x.id },
        data: {
          condition: b.condition,
          status: after,
          version: { increment: 1 },
        },
      });
      await tx.amEvent.create({
        data: {
          businessId: a.rootId,
          assetId: x.id,
          type:
            w.type === 'Preventive'
              ? 'Maintenance'
              : w.type === 'Calibration'
                ? 'Calibration'
                : w.type === 'Inspection'
                  ? 'Inspection'
                  : 'Repair',
          occurredAt: new Date(),
          summary: `${b.work.trim()} (${w.number})`,
          condBefore: x.condition,
          condAfter: b.condition,
          result: b.outcome,
          woId: id,
          byUserId: a.userId,
          extra: b.next ? { next: b.next } : undefined,
        },
      });
      let rolled = false;
      if (w.pmPlanId) {
        const p = await tx.amPmPlan.findUnique({ where: { id: w.pmPlanId } });
        if (p && ['Active', 'Paused'].includes(p.status)) {
          const today = new Date();
          const readings = await tx.amReading.findMany({
            where: { assetId: x.id },
            orderBy: [{ takenAt: 'asc' }, { createdAt: 'asc' }],
          });
          const corrected = new Set(
            readings
              .filter((r) => r.correctionOfId)
              .map((r) => r.correctionOfId),
          );
          const eff = readings.filter((r) => !corrected.has(r.id));
          const meter = eff.length ? num(eff[eff.length - 1].value) : null;
          await tx.amPmPlan.update({
            where: { id: p.id },
            data: {
              lastDoneOn: today,
              nextDueOn:
                p.trigger === 'Meter'
                  ? p.nextDueOn
                  : addInterval(today, p.interval, p.unit),
              nextDueMeter:
                p.trigger !== 'Time' && p.meterInterval != null
                  ? dec(
                      Math.max(meter ?? 0, num(p.nextDueMeter)) +
                        num(p.meterInterval),
                    )
                  : p.nextDueMeter,
              version: { increment: 1 },
            },
          });
          if (w.pmKey)
            await tx.amPmInstance.updateMany({
              where: { planId: p.id, key: w.pmKey },
              data: { status: 'Completed' },
            });
          rolled = true;
        }
      }
      if (b.followUp) {
        const number = await this.ctx.number(a.rootId, 'req', tx);
        await tx.amRequest.create({
          data: {
            businessId: a.rootId,
            number,
            assetId: x.id,
            issueType: 'Preventive Follow-up',
            title:
              `Follow-up from ${w.number}${b.next ? `: ${b.next}` : ''}`.slice(
                0,
                200,
              ),
            description: b.work.trim(),
            priority: 'Medium',
            observed: b.condition,
            reporterId: a.userId,
            status: 'Awaiting Triage',
          },
        });
      }
      await this.ctx.audit(
        a.rootId,
        a,
        'Work order completed',
        'wo',
        id,
        `${w.number} · ${b.outcome} · condition ${x.condition} → ${b.condition}${ended.count ? ' · downtime ended' : ''}${rolled ? ' · PM plan rolled to next due' : ''}`,
        { corr, tx },
      );
      return { rolled, downtimeEnded: ended.count > 0 };
    });
    return out;
  }
}
