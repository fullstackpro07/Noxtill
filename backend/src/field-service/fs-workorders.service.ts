import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { S3Service } from '../common/storage/s3.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  computeOrderTotals,
  resolveTaxRatePercent,
} from '../orders/order-totals.util';
import { resolvePolicies } from '../common/policies/policies.service';
import { PayContextService } from '../payments/pay-context.service';
import { PayRequestsService } from '../payments/pay-requests.service';
import {
  FsActor,
  FsContextService,
  Tx,
  fsErr,
  notFound,
  num,
  r2,
} from './fs-context.service';
import { Data, FsDataService, FsScope, W } from './fs-data.service';
import { FsNotifyService } from './fs-notify.service';
import { DONE, FS_ERRORS, OPEN, WT } from './fs.constants';
import { dayOffset, hh, hourOf, keyPlus, zoned } from './fs-time';

export interface WoCreate {
  customerId: string;
  siteId?: string | null;
  assetId?: string | null;
  serviceTypeId: string;
  scope: string;
  priority: string;
  day?: number | null;
  h?: number | null;
  parts?: { productId: string; qty: number }[];
  requestId?: string | null;
  warrantyId?: string | null;
  planId?: string | null;
  planKey?: string | null;
  status?: 'Open' | 'Approved' | 'Awaiting Approval' | 'Draft';
  approvalReason?: string | null;
  key?: string;
}

const scope0: FsScope = {
  tab: 'workorders',
  zone: '',
  f: {},
  page: {},
  view: {},
  cur: '',
  sec: '',
  dDay: 0,
  techView: '',
};

/** Work-order lifecycle — every status change is validated against WT and audited. */
@Injectable()
export class FsWorkOrdersService {
  constructor(
    private readonly ctx: FsContextService,
    private readonly data: FsDataService,
    private readonly notify: FsNotifyService,
    private readonly s3: S3Service,
    private readonly payCtx: PayContextService,
    private readonly payReqs: PayRequestsService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  async load(a: FsActor) {
    return this.data.load(a, scope0);
  }

  must(d: Data, id: string): W {
    const w = this.data.W(d, id);
    if (!w) throw notFound('Work order');
    if (d.a.techOnly && w.techUserId !== d.a.userId)
      throw fsErr(
        FS_ERRORS.FORBIDDEN,
        'This work order isn’t assigned to you — technicians only see their own jobs.',
        HttpStatus.FORBIDDEN,
      );
    return w;
  }

  private checkVersion(w: W, expected?: number | null) {
    if (expected != null && expected !== w.version)
      throw fsErr(
        FS_ERRORS.CONFLICT,
        `This work order changed since you opened it (now v${w.version}, you opened v${expected}). Nothing was overwritten — reload and retry.`,
        HttpStatus.CONFLICT,
      );
  }

  /** SLA due for a priority (or the agreement's response time). */
  slaDue(d: Data, prio: string, agreementId: string | null, from = new Date()) {
    const g = agreementId
      ? d.agreements.find((x) => x.id === agreementId)
      : undefined;
    const h = g ? g.respH : (d.cfg.sla[prio] ?? [8])[0];
    return new Date(from.getTime() + h * 3600000);
  }

  /**
   * Validated status change. Side effects follow the design: the SLA clock pauses while awaiting
   * the customer, cancelling releases reservations, arriving records the technician's check-in zone.
   */
  async move(
    d: Data,
    a: FsActor | 'System',
    w: W,
    to: string,
    o: {
      reason?: string;
      data?: Prisma.FsWorkOrderUpdateInput;
      tx?: Tx;
      expected?: number | null;
    } = {},
  ) {
    if (!(WT[w.status] ?? []).includes(to))
      throw fsErr(
        FS_ERRORS.STATUS,
        `WO_STATUS_INVALID — ${w.number} can’t go ${w.status} → ${to}.`,
        HttpStatus.CONFLICT,
      );
    const now = new Date();
    const data: Prisma.FsWorkOrderUpdateInput = {
      status: to,
      version: { increment: 1 },
      ...(o.data ?? {}),
    };
    if (to === 'Awaiting Customer') data.slaPausedAt = now;
    if (w.status === 'Awaiting Customer' && w.slaPausedAt) {
      const paused = now.getTime() - w.slaPausedAt.getTime();
      data.slaPausedAt = null;
      data.slaPausedMs = { increment: BigInt(paused) };
      if (w.slaDueAt) data.slaDueAt = new Date(w.slaDueAt.getTime() + paused);
    }
    if (to === 'Dispatched') data.dispatchedAt = now;
    if (to === 'Arrived') data.arrivedAt = now;
    if (to === 'Completed') data.completedAt = now;
    if (to === 'Closed') data.closedAt = now;
    const run = async (tx: Tx) => {
      const r = await tx.fsWorkOrder.updateMany({
        where: { id: w.id, version: o.expected ?? w.version },
        data: data,
      });
      if (!r.count)
        throw fsErr(
          FS_ERRORS.CONFLICT,
          `${w.number} changed while you were working on it. Reload and retry — nothing was overwritten.`,
          HttpStatus.CONFLICT,
        );
      if (to === 'Cancelled')
        for (const p of w.parts)
          if (p.reserved > p.issued)
            await tx.fsWoPart.update({
              where: { id: p.id },
              data: { reserved: p.issued },
            });
      await this.ctx.event(
        d.a.rootId,
        w.id,
        `${to}${o.reason ? ` — ${o.reason}` : ''}`,
        a,
        tx,
      );
      await this.ctx.audit(
        d.a.rootId,
        a,
        `Work order ${w.status} → ${to}`,
        'wo',
        w.id,
        `${w.number}${o.reason ? ` · ${o.reason}` : ''} · event field.work_order.${to.toLowerCase().replace(/ /g, '_')}`,
        { tx },
      );
      if (to === 'Arrived' && w.techUserId) {
        const zone = this.data.zoneOf(d, w);
        if (zone !== '—')
          await tx.fsTechnician.updateMany({
            where: { businessId: d.a.rootId, userId: w.techUserId },
            data: { lastZone: zone, lastZoneAt: now },
          });
      }
    };
    if (o.tx) await run(o.tx);
    else await this.db.$transaction(run);
    w.status = to;
    w.version += 1;
  }

  // ── create ──────────────────────────────────────────────────────────────

  async create(a: FsActor, b: WoCreate, d0?: Data) {
    if (!b.planId) this.ctx.need(a, 'workorder', 'Creating work orders');
    return this.ctx.once(a.rootId, b.key, async () => {
      const d = d0 ?? (await this.load(a));
      const cus =
        d.customers.get(b.customerId) ??
        (await this.db.customer.findFirst({
          where: {
            id: b.customerId,
            businessId: { in: d.group.map((g) => g.id) },
          },
        }));
      if (!cus)
        throw fsErr(
          FS_ERRORS.INVALID,
          'VALIDATION_ERROR — pick a customer from Customers (CRM).',
        );
      const sv = d.svc.get(b.serviceTypeId);
      if (!sv || !sv.active)
        throw fsErr(
          FS_ERRORS.INVALID,
          'Pick an active service type (Field Service › Settings › Service types).',
        );
      if (!d.cfg.priorities.includes(b.priority))
        throw fsErr(
          FS_ERRORS.INVALID,
          'Pick a priority from Settings › Priorities.',
        );
      if (!b.scope?.trim())
        throw fsErr(FS_ERRORS.INVALID, 'Describe the scope of work.');
      let siteId = b.siteId || null;
      if (siteId) {
        const s = d.sites.get(siteId);
        if (!s) throw fsErr(FS_ERRORS.INVALID, 'Site not found.');
        if (s.customerId !== b.customerId)
          throw fsErr(
            FS_ERRORS.INVALID,
            'That site belongs to another customer.',
          );
      }
      if (b.assetId) {
        const x =
          d.assets.get(b.assetId) ??
          (await this.db.amAsset.findFirst({
            where: { id: b.assetId, businessId: a.rootId },
          }));
        if (!x)
          throw fsErr(
            FS_ERRORS.INVALID,
            'Asset not found in Assets & Maintenance.',
          );
        if (x.customerId && x.customerId !== b.customerId)
          throw fsErr(
            FS_ERRORS.INVALID,
            'That asset belongs to another customer.',
          );
        if (!siteId) siteId = d.eqSite.get(b.assetId) ?? null;
      }
      if (!siteId)
        siteId =
          d.siteList.find((s) => s.customerId === b.customerId && s.active)
            ?.id ?? null;
      const g = this.data.activeAgreement(
        d,
        b.customerId,
        b.serviceTypeId,
        b.assetId,
      );
      const used = g ? this.data.agrUsed(d, g) : 0;
      const agreementId = g && used < g.visits ? g.id : null;
      let status: string = b.status ?? 'Open';
      let apr = b.approvalReason ?? null;
      if (
        b.priority === 'Emergency' &&
        d.cfg.approvals.emergency &&
        !a.approve &&
        status !== 'Draft'
      ) {
        status = 'Awaiting Approval';
        apr = 'Emergency dispatch needs manager approval';
      }
      const tpl = sv.templateId
        ? d.templates.find((t) => t.id === sv.templateId)
        : undefined;
      const n = this.data.tplItems(tpl).length;
      let startAt: Date | null = null;
      if (
        b.day != null &&
        b.h != null &&
        Number.isFinite(b.day) &&
        Number.isFinite(b.h)
      )
        startAt = zoned(keyPlus(b.day, d.tz, d.now), b.h, d.tz);
      const parts = (b.parts ?? []).filter((p) => p.productId && p.qty > 0);
      for (const p of parts)
        if (
          !d.products.has(p.productId) &&
          !(await this.db.product.findFirst({
            where: {
              id: p.productId,
              businessId: { in: d.group.map((x) => x.id) },
            },
          }))
        )
          throw fsErr(
            FS_ERRORS.INVALID,
            'A listed part isn’t an Inventory product.',
          );
      const number = await this.ctx.number(a.rootId, 'wo');
      const now = new Date();
      const w = await this.db.$transaction(async (tx) => {
        const row = await tx.fsWorkOrder.create({
          data: {
            businessId: a.rootId,
            number,
            requestId: b.requestId ?? null,
            customerId: b.customerId,
            siteId,
            assetId: b.assetId || null,
            serviceTypeId: sv.id,
            priority: b.priority,
            status,
            startAt,
            durMin: sv.durMin,
            slaDueAt: b.planId
              ? null
              : this.slaDue(d, b.priority, agreementId, now),
            scope: b.scope.trim().slice(0, 4000),
            agreementId,
            warrantyId: b.warrantyId ?? null,
            planId: b.planId ?? null,
            planKey: b.planKey ?? null,
            templateId: tpl?.id ?? null,
            templateVersion: tpl?.version ?? null,
            checklist: Array.from({ length: n }, () => null),
            checklistNotes: {},
            approvalReason: apr,
            createdById: a.userId,
            parts: {
              create: parts.map((p) => ({
                productId: p.productId,
                required: Math.round(p.qty),
              })),
            },
          },
        });
        await this.ctx.event(
          a.rootId,
          row.id,
          b.requestId
            ? `Created from ${d.requests.find((r) => r.id === b.requestId)?.number ?? 'request'}`
            : b.planId
              ? `Generated from ${d.plans.find((p) => p.id === b.planId)?.number ?? 'plan'}`
              : 'Created',
          b.planId ? 'Preventive engine' : a,
          tx,
        );
        if (status !== 'Open')
          await this.ctx.event(
            a.rootId,
            row.id,
            status + (apr ? ` — ${apr}` : ''),
            b.planId ? 'Preventive engine' : a,
            tx,
          );
        if (g && !agreementId)
          await this.ctx.event(
            a.rootId,
            row.id,
            `Not covered by ${g.number} — all ${g.visits} included visits are used; chargeable unless an agreement override is approved`,
            'System',
            tx,
          );
        await this.ctx.audit(
          a.rootId,
          a,
          'Work order created',
          'wo',
          row.id,
          `${number} · ${cus.name} · ${sv.name} · ${b.priority} · ${status} · event field.work_order.created`,
          { tx },
        );
        return row;
      });
      return { id: w.id, number, status };
    });
  }

  // ── approvals inside the lifecycle ──────────────────────────────────────

  async approve(a: FsActor, id: string, expected?: number | null) {
    this.ctx.need(a, 'approve', 'Approving work orders');
    const d = await this.load(a);
    const w = this.must(d, id);
    this.checkVersion(w, expected);
    await this.move(d, a, w, 'Approved', {
      reason:
        w.status === 'Awaiting Approval' && w.approvalReason
          ? `approved: ${w.approvalReason}`
          : undefined,
      data: { approvalReason: null },
    });
    await this.db.fsApproval.updateMany({
      where: {
        businessId: a.rootId,
        subjectId: w.id,
        kind: 'Work order approval',
        status: 'Pending',
      },
      data: {
        status: 'Approved',
        decidedById: a.userId,
        decidedAt: new Date(),
      },
    });
    return { ok: true, number: w.number };
  }

  async submit(a: FsActor, id: string) {
    this.ctx.need(a, 'workorder', 'Submitting work orders');
    const d = await this.load(a);
    const w = this.must(d, id);
    await this.move(d, a, w, 'Open');
    return { ok: true };
  }

  /** Approval request recorded for a manager (Action Center + Overview attention). Nothing changes yet. */
  async approvalReq(
    a: FsActor,
    kind: string,
    subjectType: string,
    subjectId: string,
    what: string,
    payload: Record<string, unknown>,
  ) {
    const dup = await this.db.fsApproval.findFirst({
      where: { businessId: a.rootId, kind, subjectId, status: 'Pending' },
    });
    if (dup)
      return {
        approval: true,
        id: dup.id,
        msg: `APPROVAL_REQUIRED — already waiting for a manager (${kind}). Nothing changed yet.`,
      };
    const r = await this.db.fsApproval.create({
      data: {
        businessId: a.rootId,
        kind,
        subjectType,
        subjectId,
        what: what.slice(0, 255),
        payload: payload as Prisma.InputJsonValue,
        requestedById: a.userId,
        status: 'Pending',
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Approval requested (Action Center)',
      subjectType,
      subjectId,
      `${kind} · ${what}`,
    );
    const mgrs = await this.ctx.usersWith(a.rootId, CAPABILITIES.FIELD_APPROVE);
    await this.ctx.notify(
      a.rootId,
      mgrs,
      `Approval needed · ${kind}`,
      `${a.name}: ${what}`,
      '/field-service',
      a.userId,
    );
    return {
      approval: true,
      id: r.id,
      msg: 'APPROVAL_REQUIRED — sent to a manager in Action Center. Nothing changed yet.',
    };
  }

  // ── dispatch ────────────────────────────────────────────────────────────

  private lockCheck(d: Data, a: FsActor, w: W) {
    if (d.cfg.lock && !a.approve)
      throw fsErr(
        FS_ERRORS.LOCKED,
        `Dispatch is locked by ${d.cfg.lock.by} — only managers can change assignments.`,
        HttpStatus.CONFLICT,
      );
    const order = [
      'Assigned',
      'Dispatched',
      'En Route',
      'Arrived',
      'In Progress',
    ];
    const after = d.cfg.dispatch.lockAfter;
    if (
      after !== 'Never' &&
      order.indexOf(w.status) >= order.indexOf(after) &&
      order.indexOf(after) >= 0 &&
      !a.approve &&
      w.techUserId
    )
      throw fsErr(
        FS_ERRORS.LOCKED,
        `Assignments lock once a job is ${after} (Settings › Dispatch rules) — ask a manager to reassign ${w.number}.`,
        HttpStatus.CONFLICT,
      );
  }

  /** Technicians ranked for a job at a day/time (reasons and blockers shown, nothing saves). */
  async suggestFor(a: FsActor, id: string, day: number, h?: number | null) {
    this.ctx.need(a, 'dispatch', 'Assigning technicians');
    const d = await this.load(a);
    const w = this.must(d, id);
    const at = h ?? this.data.nextSlotAny(d, w, day);
    return {
      h: at,
      version: w.version,
      tech: w.techUserId,
      list: this.data.suggest(d, w, day, at).map((x) => ({
        id: x.t.id,
        name: x.t.name,
        score: x.e.score,
        blocks: x.e.blocks,
        warns: x.e.warns,
      })),
    };
  }

  /** In-app message to a technician (Staff notifications — technicians aren't Unified Inbox contacts). */
  async messageTech(a: FsActor, userId: string, text: string) {
    this.ctx.need(a, 'dispatch', 'Messaging technicians');
    if (!text?.trim()) throw fsErr(FS_ERRORS.INVALID, 'Write a message.');
    const n = await this.ctx.notify(
      a.rootId,
      [userId],
      `Message from ${a.name}`,
      text.trim().slice(0, 500),
      '/field-service/technician',
      a.userId,
    );
    if (!n)
      throw fsErr(
        FS_ERRORS.INVALID,
        'That person isn’t an active staff member.',
      );
    await this.ctx.audit(
      a.rootId,
      a,
      'Technician messaged',
      'tech',
      userId,
      text.trim().slice(0, 200),
    );
    return {
      ok: true,
      msg: `Delivered as an in-app notification to ${(await this.ctx.members(a.rootId)).find((m) => m.id === userId)?.name ?? 'the technician'}.`,
    };
  }

  /** Validate an assignment and return the explainable preview (nothing saves). */
  async preview(a: FsActor, id: string, tech: string, day: number, h: number) {
    this.ctx.need(a, 'dispatch', 'Assigning technicians');
    const d = await this.load(a);
    const w = this.must(d, id);
    const e = this.data.elig(d, w, tech, day, h);
    return {
      e,
      name: this.data.tname(d, tech),
      end: hh(h + w.durMin / 60),
      start: hh(h),
      version: w.version,
    };
  }

  async assign(
    a: FsActor,
    id: string,
    b: {
      tech: string;
      day: number;
      h: number;
      override?: string;
      expected?: number | null;
      viaApproval?: boolean;
    },
  ) {
    this.ctx.need(a, 'dispatch', 'Assigning technicians');
    const d = await this.load(a);
    const w = this.must(d, id);
    this.checkVersion(w, b.expected);
    if (!b.viaApproval) this.lockCheck(d, a, w);
    if (
      ![
        'Approved',
        'Scheduled',
        'Assigned',
        'Awaiting Parts',
        'Awaiting Customer',
        'Dispatched',
      ].includes(w.status)
    )
      throw fsErr(
        FS_ERRORS.STATUS,
        `WO_STATUS_INVALID — ${w.number} is ${w.status}; approve it before assigning.`,
        HttpStatus.CONFLICT,
      );
    const e = this.data.elig(d, w, b.tech, b.day, b.h);
    if (e.blocks.length) {
      if (!b.override)
        throw fsErr(
          e.blocks[0].split(' — ')[0].replace(/[^A-Z_]/g, '') ||
            FS_ERRORS.INVALID,
          e.blocks.join(' · '),
          HttpStatus.CONFLICT,
        );
      this.ctx.need(a, 'approve', 'Overriding dispatch blockers');
      if (e.blocks.some((x) => x.startsWith('Start time')))
        throw fsErr(FS_ERRORS.INVALID, 'Pick a start time that hasn’t passed.');
    }
    if (e.ot && d.cfg.approvals.overtime && !a.approve && !b.viaApproval)
      return this.approvalReq(
        a,
        'Overtime dispatch',
        'wo',
        w.id,
        `${w.number} → ${this.data.tname(d, b.tech)} ${this.data.dday(d, b.day)} ${hh(b.h)}`,
        { woId: w.id, tech: b.tech, day: b.day, h: b.h },
      );
    const startAt = zoned(keyPlus(b.day, d.tz, d.now), b.h, d.tz);
    const was = w.techUserId;
    const why = `${was && was !== b.tech ? `reassigned from ${this.data.tname(d, was)} to` : 'assigned to'} ${this.data.tname(d, b.tech)} · ${this.data.dday(d, b.day)} ${hh(b.h)}`;
    if (w.status === 'Assigned') {
      await this.db.$transaction(async (tx) => {
        const r = await tx.fsWorkOrder.updateMany({
          where: { id: w.id, version: w.version },
          data: { techUserId: b.tech, startAt, version: { increment: 1 } },
        });
        if (!r.count)
          throw fsErr(
            FS_ERRORS.CONFLICT,
            `${w.number} changed while you were working on it. Reload and retry.`,
            HttpStatus.CONFLICT,
          );
        await this.ctx.event(a.rootId, w.id, `Reassigned — ${why}`, a, tx);
      });
    } else
      await this.move(d, a, w, 'Assigned', {
        reason: why,
        data: { techUserId: b.tech, startAt },
      });
    await this.ctx.audit(
      a.rootId,
      a,
      'Dispatch assignment',
      'wo',
      w.id,
      `${w.number} → ${why} · score ${e.score}${e.warns.length ? ` · warnings accepted: ${e.warns.join('; ')}` : ''}${b.override ? ` · OVERRIDE: ${b.override} (blockers: ${e.blocks.join('; ')})` : ''}`,
    );
    if (d.cfg.parts.reserveOnSchedule) await this.autoReserve(d, w);
    if (d.cfg.dispatch.notifyTech)
      await this.ctx.notify(
        a.rootId,
        [b.tech],
        `New field job ${w.number}`,
        `${this.data.svName(d, w.serviceTypeId)} · ${this.data.cname(d, w.customerId)} · ${this.data.dday(d, b.day)} ${hh(b.h)}`,
        `/field-service/work-orders/${w.id}`,
        a.userId,
      );
    const n = await this.notify.send({
      cfg: d.cfg,
      tz: d.tz,
      kind: 'confirm',
      customerId: w.customerId,
      templateKey: 'field_appointment',
      variables: {
        service: this.data.svName(d, w.serviceTypeId),
        wo: w.number,
        when: `${this.data.dday(d, b.day)} ${hh(b.h)}–${hh(b.h + w.durMin / 60)}`,
        note: '',
      },
    });
    return { ok: true, number: w.number, notice: n.why, warns: e.warns };
  }

  /** Reserve parts the job lists when stock allows (Settings › Parts rules). */
  private async autoReserve(d: Data, w: W) {
    for (const p of w.parts) {
      if (p.reserved >= p.required) continue;
      const av = this.data.available(d, p.productId, p.id);
      if (av != null && av >= p.required)
        await this.db.fsWoPart.update({
          where: { id: p.id },
          data: { reserved: p.required },
        });
    }
  }

  async schedule(
    a: FsActor,
    id: string,
    b: {
      day: number;
      h: number;
      reason: string;
      notify?: boolean;
      expected?: number | null;
    },
  ) {
    this.ctx.need(a, 'dispatch', 'Scheduling work orders');
    if (!b.reason?.trim()) throw fsErr(FS_ERRORS.INVALID, 'Reason required.');
    const d = await this.load(a);
    const w = this.must(d, id);
    this.checkVersion(w, b.expected);
    this.lockCheck(d, a, w);
    if (
      !OPEN.includes(w.status) ||
      ['En Route', 'Arrived', 'In Progress', 'Paused'].includes(w.status)
    )
      throw fsErr(
        FS_ERRORS.STATUS,
        `${w.number} is ${w.status} — it can’t be rescheduled now.`,
        HttpStatus.CONFLICT,
      );
    if (w.techUserId) {
      const e = this.data.elig(d, w, w.techUserId, b.day, b.h);
      const hard = e.blocks.filter((x) => !x.startsWith('TECHNICIAN_SKILL'));
      if (hard.length)
        throw fsErr(FS_ERRORS.SCHEDULE, hard.join(' · '), HttpStatus.CONFLICT);
    } else if (b.day < 0 || (b.day === 0 && b.h < d.nowH - 0.1))
      throw fsErr(FS_ERRORS.INVALID, 'Pick a time that hasn’t passed.');
    const startAt = zoned(keyPlus(b.day, d.tz, d.now), b.h, d.tz);
    const label = `${this.data.dday(d, b.day)} ${hh(b.h)}`;
    if (
      !w.techUserId &&
      ['Approved', 'Awaiting Customer', 'Awaiting Parts'].includes(w.status)
    )
      await this.move(d, a, w, 'Scheduled', {
        reason: `${label} — ${b.reason}`,
        data: { startAt },
      });
    else
      await this.db.$transaction(async (tx) => {
        const r = await tx.fsWorkOrder.updateMany({
          where: { id: w.id, version: w.version },
          data: { startAt, version: { increment: 1 } },
        });
        if (!r.count)
          throw fsErr(
            FS_ERRORS.CONFLICT,
            `${w.number} changed while you were working on it. Reload and retry.`,
            HttpStatus.CONFLICT,
          );
        await this.ctx.event(
          a.rootId,
          w.id,
          `Rescheduled to ${label} — ${b.reason}`,
          a,
          tx,
        );
      });
    await this.ctx.audit(
      a.rootId,
      a,
      'Work order rescheduled',
      'wo',
      w.id,
      `${w.number} → ${label} · ${b.reason}`,
    );
    let notice = '';
    if (b.notify)
      notice = (
        await this.notify.send({
          cfg: d.cfg,
          tz: d.tz,
          kind: 'delay',
          customerId: w.customerId,
          templateKey: 'field_appointment',
          variables: {
            service: this.data.svName(d, w.serviceTypeId),
            wo: w.number,
            when: `${label}–${hh(b.h + w.durMin / 60)}`,
            note: ` (rescheduled: ${b.reason})`,
          },
        })
      ).why;
    return { ok: true, label, notice };
  }

  async priority(
    a: FsActor,
    id: string,
    b: { priority: string; reason: string; expected?: number | null },
  ) {
    this.ctx.need(a, 'workorder', 'Changing priority');
    if (!b.reason?.trim()) throw fsErr(FS_ERRORS.INVALID, 'Reason required.');
    const d = await this.load(a);
    const w = this.must(d, id);
    this.checkVersion(w, b.expected);
    if (!OPEN.includes(w.status))
      throw fsErr(
        FS_ERRORS.STATUS,
        `${w.number} is ${w.status}.`,
        HttpStatus.CONFLICT,
      );
    if (!d.cfg.priorities.includes(b.priority))
      throw fsErr(FS_ERRORS.INVALID, 'Unknown priority.');
    await this.db.$transaction(async (tx) => {
      await tx.fsWorkOrder.update({
        where: { id: w.id },
        data: {
          priority: b.priority,
          slaDueAt:
            w.planId && !w.slaDueAt
              ? null
              : this.slaDue(d, b.priority, w.agreementId),
          version: { increment: 1 },
        },
      });
      await this.ctx.event(
        a.rootId,
        w.id,
        `Priority ${w.priority} → ${b.priority} — ${b.reason}`,
        a,
        tx,
      );
      await this.ctx.audit(
        a.rootId,
        a,
        'Priority changed',
        'wo',
        w.id,
        `${w.number} ${w.priority} → ${b.priority} · ${b.reason}`,
        { tx },
      );
    });
    return { ok: true };
  }

  async cancel(a: FsActor, id: string, reason: string, viaApproval = false) {
    this.ctx.need(a, 'workorder', 'Cancelling work orders');
    const d = await this.load(a);
    const w = this.must(d, id);
    if (d.cfg.status.cancelReason && !reason?.trim())
      throw fsErr(
        FS_ERRORS.INVALID,
        'Cancellation reason required (Settings › Work order status rules).',
      );
    if (!(WT[w.status] ?? []).includes('Cancelled'))
      throw fsErr(
        FS_ERRORS.STATUS,
        `WO_STATUS_INVALID — ${w.number} can’t be cancelled from ${w.status}.`,
        HttpStatus.CONFLICT,
      );
    if (w.parts.some((p) => p.issued - p.used - p.returned > 0))
      throw fsErr(
        FS_ERRORS.INVALID,
        'Return issued parts to Inventory before cancelling — stock left the shelf for this job.',
      );
    if (d.cfg.approvals.cancellation && !a.approve && !viaApproval)
      return this.approvalReq(
        a,
        'Work-order cancellation',
        'wo',
        w.id,
        `${w.number} · ${reason}`,
        { woId: w.id, reason },
      );
    await this.move(d, a, w, 'Cancelled', { reason });
    return { ok: true };
  }

  async dispatch(a: FsActor, id: string) {
    this.ctx.need(a, 'dispatch', 'Dispatching jobs');
    const d = await this.load(a);
    const w = this.must(d, id);
    if (!w.techUserId)
      throw fsErr(FS_ERRORS.INVALID, 'Assign a technician first.');
    await this.move(d, a, w, 'Dispatched', { reason: 'technician notified' });
    await this.ctx.notify(
      a.rootId,
      [w.techUserId],
      `Dispatched · ${w.number}`,
      `${this.data.svName(d, w.serviceTypeId)} at ${this.data.addr(d, w.siteId, w.customerId)} · ${this.data.win(d, w)}`,
      `/field-service/work-orders/${w.id}`,
      a.userId,
    );
    const n = await this.notify.send({
      cfg: d.cfg,
      tz: d.tz,
      kind: 'dispatched',
      customerId: w.customerId,
      templateKey: 'field_update',
      variables: {
        ref: w.number,
        businessName: d.biz.name,
        body: `${this.data.tname(d, w.techUserId)} is scheduled for your ${this.data.svName(d, w.serviceTypeId)} visit (${this.data.win(d, w)}).`,
      },
    });
    return { ok: true, notice: n.why, tech: this.data.tname(d, w.techUserId) };
  }

  // ── technician execution ───────────────────────────────────────────────

  private mustExec(d: Data, a: FsActor, w: W) {
    this.ctx.need(a, 'execute', 'Updating a job');
    if (!a.approve && !a.dispatch && w.techUserId !== a.userId)
      throw fsErr(
        FS_ERRORS.FORBIDDEN,
        'Only the assigned technician (or a dispatcher) can update this job.',
        HttpStatus.FORBIDDEN,
      );
  }

  async tech(
    a: FsActor,
    id: string,
    act: string,
    b: { reason?: string; key?: string } = {},
  ) {
    return this.ctx.once(a.rootId, b.key, async () => {
      const d = await this.load(a);
      const w = this.must(d, id);
      this.mustExec(d, a, w);
      if (act === 'Accept') {
        await this.move(
          d,
          a,
          w,
          w.status === 'Scheduled' ? 'Assigned' : 'Dispatched',
          { reason: 'accepted by technician' },
        );
        return { ok: true, msg: `${w.number} accepted.` };
      }
      if (act === 'Start travel') {
        await this.move(d, a, w, 'En Route');
        const n = await this.notify.send({
          cfg: d.cfg,
          tz: d.tz,
          kind: 'arriving',
          customerId: w.customerId,
          templateKey: 'field_update',
          variables: {
            ref: w.number,
            businessName: d.biz.name,
            body: `${this.data.tname(d, w.techUserId)} is on the way.`,
          },
        });
        return {
          ok: true,
          msg: `En route to ${this.data.addr(d, w.siteId, w.customerId)}. Customer notice: ${n.why}.`,
        };
      }
      if (act === 'Arrived') {
        await this.move(d, a, w, 'Arrived');
        return {
          ok: true,
          msg: `Arrived — check-in recorded (${this.data.zoneOf(d, w)}).`,
        };
      }
      if (act === 'Start job') {
        await this.move(d, a, w, 'In Progress');
        const tid = w.techUserId ?? a.userId;
        const running = await this.db.fsLabor.findFirst({
          where: { businessId: a.rootId, techUserId: tid, status: 'Running' },
        });
        if (!running) {
          const number = await this.ctx.number(a.rootId, 'lab');
          await this.db.fsLabor.create({
            data: {
              businessId: a.rootId,
              number,
              woId: w.id,
              techUserId: tid,
              type: 'Repair',
              startAt: new Date(),
              status: 'Running',
              billable: true,
              rate: d.techs.find((t) => t.id === tid)?.rate ?? null,
              createdById: a.userId,
            },
          });
        }
        await this.inspectionStart(d, w);
        return {
          ok: true,
          msg: `${w.number} started${running ? ` — your timer on ${d.wos.find((x) => x.id === running.woId)?.number ?? 'another job'} is still running` : ' · labor timer running'}.`,
        };
      }
      if (act === 'Pause') {
        if (!b.reason?.trim()) throw fsErr(FS_ERRORS.INVALID, 'Why pause?');
        const to = /part/i.test(b.reason)
          ? 'Awaiting Parts'
          : /customer|not home|unavailable/i.test(b.reason)
            ? 'Awaiting Customer'
            : 'Paused';
        await this.move(d, a, w, to, {
          reason: b.reason,
          data: { note: b.reason },
        });
        await this.stopTimers(d, a, w.id);
        return { ok: true, msg: `${w.number} → ${to}.` };
      }
      if (act === 'Resume') {
        await this.move(d, a, w, 'In Progress', { reason: 'resumed' });
        return { ok: true, msg: `${w.number} resumed.` };
      }
      throw fsErr(FS_ERRORS.INVALID, `Unknown action ${act}.`);
    });
  }

  private async inspectionStart(d: Data, w: W) {
    const tpl = this.data.tplOf(d, w);
    if (!tpl) return;
    const has = await this.db.fsInspection.findUnique({
      where: { woId: w.id },
    });
    if (has) return;
    const number = await this.ctx.number(d.a.rootId, 'ins');
    await this.db.fsInspection.create({
      data: {
        businessId: d.a.rootId,
        number,
        woId: w.id,
        assetId: w.assetId,
        techUserId: w.techUserId,
        templateId: tpl.id,
        startedAt: new Date(),
        result: 'In Progress',
      },
    });
  }

  /** Stop running timers on a job (rounded per Settings › Labor rules). */
  async stopTimers(d: Data, a: FsActor | 'System', woId: string) {
    const L = await this.db.fsLabor.findMany({
      where: { businessId: d.a.rootId, woId, status: 'Running' },
    });
    for (const l of L) {
      const end = this.roundEnd(d, l.startAt, new Date());
      await this.db.fsLabor.update({
        where: { id: l.id },
        data: {
          endAt: end,
          status: 'Draft',
          overtime: await this.isOvertime(
            d,
            l.techUserId,
            l.startAt,
            end,
            l.id,
          ),
        },
      });
    }
    if (L.length)
      await this.ctx.audit(
        d.a.rootId,
        a,
        'Labor timer stopped',
        'wo',
        woId,
        `${L.length} running entr${L.length === 1 ? 'y' : 'ies'} saved as Draft`,
      );
  }
  roundEnd(d: Data, s: Date, e: Date) {
    const step = Math.max(1, d.cfg.labor.roundMin) * 60000;
    const dur = Math.max(
      step,
      Math.round((e.getTime() - s.getTime()) / step) * step,
    );
    return new Date(s.getTime() + dur);
  }
  /** Over the daily overtime threshold (Settings › Labor rules) or outside the shift. */
  async isOvertime(d: Data, tid: string, s: Date, e: Date, exceptId?: string) {
    const t = this.data.tech(d, tid);
    const off = dayOffset(s, d.tz, d.now);
    const sh = t ? this.data.shiftOn(d, t, off) : null;
    const hs = hourOf(s, d.tz);
    const he = hs + (e.getTime() - s.getTime()) / 3600000;
    if (sh && (hs < sh[0] - 0.01 || he > sh[1] + 0.01)) return true;
    const day0 = zoned(keyPlus(off, d.tz, d.now), 0, d.tz);
    const same = await this.db.fsLabor.findMany({
      where: {
        businessId: d.a.rootId,
        techUserId: tid,
        startAt: { gte: day0, lt: new Date(day0.getTime() + 86400000) },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
    });
    const total =
      same.reduce(
        (x, l) =>
          x +
          ((l.endAt ?? new Date()).getTime() - l.startAt.getTime()) / 3600000,
        0,
      ) +
      (e.getTime() - s.getTime()) / 3600000;
    return total > d.cfg.labor.overtimeAfter;
  }

  async checklist(
    a: FsActor,
    id: string,
    b: { index: number; value: string; note?: string; key?: string },
  ) {
    return this.ctx.once(a.rootId, b.key, async () => {
      const d = await this.load(a);
      const w = this.must(d, id);
      this.mustExec(d, a, w);
      if (!['Arrived', 'In Progress'].includes(w.status))
        throw fsErr(
          FS_ERRORS.STATUS,
          `Checklist answers are recorded on site (Arrived / In Progress) — ${w.number} is ${w.status}.`,
          HttpStatus.CONFLICT,
        );
      const tp = this.data.tplOf(d, w);
      const items = this.data.tplItems(tp);
      const it = items[b.index];
      if (!it) throw fsErr(FS_ERRORS.INVALID, 'Checklist item not found.');
      const val: number | string | null =
        b.value === 'Pass'
          ? 1
          : b.value === 'Fail'
            ? 0
            : b.value === 'N/A'
              ? 'na'
              : b.value === 'Clear'
                ? null
                : b.value.slice(0, 200);
      if (val === 'na' && it.req)
        throw fsErr(
          FS_ERRORS.INVALID,
          `“${it.t}” is required — N/A isn’t allowed.`,
        );
      if (
        it.ev &&
        val === 1 &&
        d.cfg.checklist.evidencePhoto &&
        !this.data.photos(d, w.id).length
      )
        throw fsErr(
          FS_ERRORS.INVALID,
          'Evidence required — upload a photo first.',
        );
      const ans = [...this.data.answers(w)];
      while (ans.length < items.length) ans.push(null);
      ans[b.index] = val;
      const notes = { ...((w.checklistNotes as Record<string, string>) ?? {}) };
      if (b.note) notes[String(b.index)] = b.note.slice(0, 500);
      await this.db.fsWorkOrder.update({
        where: { id: w.id },
        data: {
          checklist: ans,
          checklistNotes: notes,
          version: { increment: 1 },
        },
      });
      await this.ctx.event(
        a.rootId,
        w.id,
        `Checklist: ${it.t} → ${b.value}`,
        a,
      );
      await this.inspectionStart(d, w);
      const fails = ans.filter((x) => x === 0).length;
      await this.db.fsInspection.updateMany({
        where: { woId: w.id },
        data: { exceptions: fails },
      });
      return {
        ok: true,
        msg:
          val === 0
            ? 'Failed item recorded — add a comment/photo and consider a follow-up work order.'
            : 'Checklist updated.',
      };
    });
  }

  async sign(
    a: FsActor,
    id: string,
    b: { name: string; ack: boolean; note?: string; key?: string },
  ) {
    return this.ctx.once(a.rootId, b.key, async () => {
      const d = await this.load(a);
      const w = this.must(d, id);
      this.mustExec(d, a, w);
      if (!b.name?.trim() || !b.ack)
        throw fsErr(
          FS_ERRORS.INVALID,
          'Name and acknowledgement are required.',
        );
      if (!['Arrived', 'In Progress'].includes(w.status))
        throw fsErr(
          FS_ERRORS.STATUS,
          'Signatures are captured on site (Arrived / In Progress).',
          HttpStatus.CONFLICT,
        );
      if (w.signedBy)
        throw fsErr(FS_ERRORS.INVALID, `Already signed by ${w.signedBy}.`);
      await this.db.fsWorkOrder.update({
        where: { id: w.id },
        data: {
          signedBy: b.name.trim().slice(0, 120),
          signedAt: new Date(),
          signNote: b.note?.slice(0, 255) || null,
          version: { increment: 1 },
        },
      });
      await this.ctx.event(
        a.rootId,
        w.id,
        `Customer signed (${b.name.trim()})`,
        a,
      );
      await this.ctx.audit(
        a.rootId,
        a,
        'Customer proof captured',
        'wo',
        w.id,
        `${w.number} · signed by ${b.name.trim()} · event field.customer_proof.captured`,
      );
      return { ok: true };
    });
  }

  async note(a: FsActor, id: string, text: string, key?: string) {
    return this.ctx.once(a.rootId, key, async () => {
      const d = await this.load(a);
      const w = this.must(d, id);
      if (!a.execute && !a.dispatch && !a.workorder)
        this.ctx.need(a, 'execute', 'Adding notes');
      if (!text?.trim()) throw fsErr(FS_ERRORS.INVALID, 'Write a note.');
      await this.ctx.event(a.rootId, w.id, `Note: ${text.trim()}`, a);
      return { ok: true };
    });
  }

  async help(a: FsActor, id: string) {
    const d = await this.load(a);
    const w = this.must(d, id);
    this.mustExec(d, a, w);
    const ids = await this.ctx.usersWith(a.rootId, CAPABILITIES.FIELD_DISPATCH);
    const n = await this.ctx.notify(
      a.rootId,
      ids,
      `Help requested · ${w.number}`,
      `${a.name} needs help at ${this.data.cname(d, w.customerId)} (${this.data.svName(d, w.serviceTypeId)}).`,
      `/field-service/work-orders/${w.id}`,
      a.userId,
    );
    await this.ctx.event(a.rootId, w.id, 'Help requested from dispatch', a);
    return {
      ok: true,
      msg: n
        ? `${n} dispatcher(s) notified — help request logged on ${w.number}.`
        : 'No dispatcher is set up to receive help requests — logged on the job.',
    };
  }

  async upload(
    a: FsActor,
    id: string,
    stage: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    const d = await this.load(a);
    const w = this.must(d, id);
    this.mustExec(d, a, w);
    if (
      !['before', 'during', 'after', 'evidence', 'attachment'].includes(stage)
    )
      throw fsErr(FS_ERRORS.INVALID, 'Pick a stage.');
    if (!file?.buffer?.length)
      throw fsErr(FS_ERRORS.INVALID, 'Choose a photo to upload.');
    if (file.size > 15 * 1024 * 1024)
      throw fsErr(FS_ERRORS.INVALID, 'Files are limited to 15 MB.');
    const name = (file.originalname || 'photo').slice(0, 200);
    const ext = name.includes('.')
      ? `.${name.split('.').pop()!.toLowerCase().slice(0, 10)}`
      : '';
    const key = `field-service/${a.rootId}/${w.id}/${randomUUID()}${ext}`;
    await this.s3.upload(
      key,
      file.buffer,
      file.mimetype || 'application/octet-stream',
    );
    const f = await this.db.fsFile.create({
      data: {
        businessId: a.rootId,
        woId: w.id,
        stage,
        name,
        storageKey: key,
        mime: (file.mimetype || 'application/octet-stream').slice(0, 120),
        size: file.size,
        byUserId: a.userId,
      },
    });
    await this.ctx.event(
      a.rootId,
      w.id,
      `Photo uploaded (${stage}) · ${name}`,
      a,
    );
    return { ok: true, id: f.id };
  }

  async fileUrl(a: FsActor, fileId: string) {
    const f = await this.db.fsFile.findFirst({
      where: { id: fileId, businessId: a.rootId },
    });
    if (!f) throw notFound('File');
    if (f.woId && a.techOnly) {
      const w = await this.db.fsWorkOrder.findUnique({
        where: { id: f.woId },
        select: { techUserId: true },
      });
      if (w?.techUserId !== a.userId)
        throw fsErr(FS_ERRORS.FORBIDDEN, 'Not your job.', HttpStatus.FORBIDDEN);
    }
    return {
      url: await this.s3.getSignedDownloadUrl(f.storageKey, 3600),
      name: f.name,
    };
  }

  async complete(
    a: FsActor,
    id: string,
    b: { resolution: string; fixed: boolean; why?: string; key?: string },
  ) {
    return this.ctx.once(a.rootId, b.key, async () => {
      const d = await this.load(a);
      const w = this.must(d, id);
      this.mustExec(d, a, w);
      if (!b.resolution?.trim())
        throw fsErr(FS_ERRORS.INVALID, 'Enter the resolution.');
      if (w.status !== 'In Progress')
        throw fsErr(
          FS_ERRORS.STATUS,
          `WO_STATUS_INVALID — ${w.number} is ${w.status}; only an in-progress job can be completed.`,
          HttpStatus.CONFLICT,
        );
      if (!b.fixed && !b.why?.trim())
        throw fsErr(
          FS_ERRORS.INVALID,
          'Give the failure reason for an unresolved job.',
        );
      await this.db.fsWorkOrder.update({
        where: { id: w.id },
        data: { resolution: b.resolution.trim().slice(0, 4000) },
      });
      w.resolution = b.resolution.trim();
      const g = this.data.completionGaps(d, w, w.resolution);
      if (g.length)
        throw fsErr(
          FS_ERRORS.INVALID,
          `Can’t complete — missing: ${g.join(', ')}.`,
        );
      await this.stopTimers(d, a, w.id);
      const res =
        b.resolution.trim() + (b.why ? ` · Not resolved: ${b.why.trim()}` : '');
      await this.move(d, a, w, 'Completed', {
        data: { unresolved: !b.fixed, resolution: res.slice(0, 4000) },
      });
      const ans = this.data.answers(w);
      const fails = ans.filter((x) => x === 0).length;
      await this.db.fsInspection.updateMany({
        where: { woId: w.id, completedAt: null },
        data: {
          completedAt: new Date(),
          result: fails
            ? b.fixed
              ? 'Passed with exceptions'
              : 'Failed'
            : 'Passed',
          exceptions: fails,
        },
      });
      if (w.warrantyId)
        await this.db.fsWarranty.updateMany({
          where: {
            id: w.warrantyId,
            status: { in: ['Repairing', 'WO Created', 'Eligible'] },
          },
          data: { status: 'Completed' },
        });
      if (w.planId)
        await this.db.fsPlanInstance.updateMany({
          where: { planId: w.planId, woId: w.id },
          data: { status: 'Completed' },
        });
      const n = await this.notify.send({
        cfg: d.cfg,
        tz: d.tz,
        kind: 'completed',
        customerId: w.customerId,
        templateKey: 'field_update',
        variables: {
          ref: w.number,
          businessName: d.biz.name,
          body: `your ${this.data.svName(d, w.serviceTypeId)} job is complete. ${b.fixed ? '' : 'A follow-up visit will be arranged.'}`.trim(),
        },
      });
      return {
        ok: true,
        msg: `${w.number} completed. ${w.agreementId || w.warrantyId ? 'Covered job — no invoice needed unless chargeable items were used.' : 'Request the invoice from the Financial tab — nothing is marked paid.'} Customer notice: ${n.why}.`,
      };
    });
  }

  async close(a: FsActor, id: string) {
    this.ctx.need(a, 'approve', 'Closing work orders');
    const d = await this.load(a);
    const w = this.must(d, id);
    await this.move(d, a, w, 'Closed');
    return { ok: true };
  }

  async reopen(a: FsActor, id: string, reason: string, viaApproval = false) {
    if (!reason?.trim()) throw fsErr(FS_ERRORS.INVALID, 'Why reopen?');
    const d = await this.load(a);
    const w = this.must(d, id);
    if (!a.approve && !a.workorder)
      this.ctx.need(a, 'workorder', 'Reopening work orders');
    if (!DONE.includes(w.status))
      throw fsErr(
        FS_ERRORS.STATUS,
        `${w.number} is ${w.status}.`,
        HttpStatus.CONFLICT,
      );
    if (
      (d.cfg.approvals.reopen || d.cfg.status.reopenApproval) &&
      !a.approve &&
      !viaApproval
    )
      return this.approvalReq(
        a,
        'Reopen closed WO',
        'wo',
        w.id,
        `${w.number} · ${reason}`,
        { woId: w.id, reason },
      );
    await this.move(d, a, w, 'In Progress', {
      reason: `reopened: ${reason}`,
      data: { unresolved: true, completedAt: null, closedAt: null },
    });
    return { ok: true };
  }

  async bulk(
    a: FsActor,
    b: {
      ids: string[];
      op: 'assign' | 'schedule' | 'status';
      tech?: string;
      day?: number;
      st?: string;
      reason?: string;
    },
  ) {
    this.ctx.need(a, 'dispatch', 'Bulk changes');
    if (b.op === 'status' && !b.reason?.trim())
      throw fsErr(FS_ERRORS.INVALID, 'Reason required.');
    const done: string[] = [];
    const skip: string[] = [];
    for (const id of b.ids.slice(0, 200)) {
      const d = await this.load(a);
      const w = this.data.W(d, id);
      if (!w) continue;
      try {
        if (b.op === 'assign') {
          const off =
            this.data.day(d, w) != null && this.data.day(d, w)! >= 0
              ? this.data.day(d, w)!
              : (b.day ?? 0);
          const h = this.nextFor(d, b.tech!, w, off);
          if (h == null) throw new Error('no free slot');
          if (
            ![
              'Approved',
              'Scheduled',
              'Awaiting Parts',
              'Awaiting Customer',
            ].includes(w.status)
          )
            throw new Error(`state ${w.status}`);
          const r = await this.assign(a, w.id, { tech: b.tech!, day: off, h });
          if ('approval' in r) throw new Error('needs overtime approval');
        } else if (b.op === 'schedule') {
          if (
            !['Approved', 'Awaiting Customer'].includes(w.status) ||
            w.techUserId
          )
            throw new Error(
              w.techUserId
                ? 'has technician — reschedule individually'
                : w.status,
            );
          await this.schedule(a, w.id, {
            day: b.day ?? 0,
            h: 10,
            reason: 'bulk schedule',
          });
        } else {
          if (!(WT[w.status] ?? []).includes(b.st!))
            throw new Error(`${w.status} → ${b.st} not allowed`);
          if (b.st === 'Approved') this.ctx.need(a, 'approve', 'Approving');
          if (b.st === 'Closed') this.ctx.need(a, 'approve', 'Closing');
          if (b.st === 'Cancelled') {
            const r = await this.cancel(a, w.id, b.reason!);
            if ('approval' in r) throw new Error('needs cancellation approval');
          } else await this.move(d, a, w, b.st!, { reason: b.reason });
        }
        done.push(w.number);
      } catch (e) {
        skip.push(`${w.number} (${(e as Error).message.split(' — ').pop()})`);
      }
    }
    await this.ctx.audit(
      a.rootId,
      a,
      `Bulk ${b.op}`,
      'wo',
      'bulk',
      `applied ${done.join(', ') || 'none'} · skipped ${skip.join('; ') || 'none'}`,
    );
    return { done, skip };
  }
  private nextFor(d: Data, tid: string, w: W, off: number) {
    return this.data.nextSlot(d, tid, w.durMin, off, w.id);
  }

  // ── Orders & Payments handoffs ──────────────────────────────────────────

  private async orderLines(d: Data, w: W, mode: 'quote' | 'invoice') {
    const sv = this.data.sv(d, w.serviceTypeId);
    const g = w.agreementId
      ? d.agreements.find((x) => x.id === w.agreementId)
      : undefined;
    const wr = w.warrantyId
      ? d.warranty.find((x) => x.id === w.warrantyId)
      : undefined;
    const covered =
      !!wr &&
      ['Eligible', 'Repairing', 'WO Created', 'Completed'].includes(wr.status);
    const laborIncl = covered || (!!g && /^included/i.test(g.labor));
    const partsIncl = covered || (!!g && /^included/i.test(g.parts));
    const lines: {
      productId: string | null;
      name: string;
      price: number;
      cost: number;
      qty: number;
      category: string | null;
    }[] = [];
    const notes: string[] = [];
    if (sv?.laborProductId) {
      const lp = await this.db.product.findUnique({
        where: { id: sv.laborProductId },
      });
      if (lp) {
        const hrs =
          mode === 'invoice'
            ? r2(
                d.labor
                  .filter(
                    (l) =>
                      l.woId === w.id &&
                      l.billable &&
                      l.endAt &&
                      l.status !== 'Rejected',
                  )
                  .reduce(
                    (x, l) =>
                      x +
                      (l.endAt!.getTime() - l.startAt.getTime()) / 3600000 -
                      l.breakMin / 60,
                    0,
                  ),
              )
            : r2(w.durMin / 60);
        if (hrs > 0)
          lines.push({
            productId: lp.id,
            name: `${lp.name} · ${hrs} h${laborIncl ? ' (covered)' : ''}`,
            price: laborIncl ? 0 : r2(num(lp.sellingPrice) * hrs),
            cost: 0,
            qty: 1,
            category: lp.category,
          });
      }
    } else
      notes.push(
        'No labor product on this service type (Settings › Service types) — labor isn’t billed',
      );
    for (const p of w.parts) {
      const pr = await this.db.product.findUnique({
        where: { id: p.productId },
      });
      if (!pr) continue;
      const q = mode === 'invoice' ? p.used : p.required;
      if (q <= 0) continue;
      lines.push({
        productId: pr.id,
        name: `${pr.name}${partsIncl ? ' (covered)' : ''}`,
        price: partsIncl ? 0 : num(pr.sellingPrice),
        cost: num(pr.costPrice),
        qty: q,
        category: pr.category,
      });
    }
    return { lines, notes, covered: covered || (laborIncl && partsIncl) };
  }

  private async writeOrder(
    d: Data,
    w: W,
    mode: 'quote' | 'invoice',
    lines: Awaited<ReturnType<FsWorkOrdersService['orderLines']>>['lines'],
  ) {
    const cus = d.customers.get(w.customerId);
    if (!cus) throw fsErr(FS_ERRORS.INVALID, 'Customer not found.');
    const businessId = cus.businessId;
    return this.db.$transaction(async (tx) => {
      const business = await tx.business.findUniqueOrThrow({
        where: { id: businessId },
      });
      const rules = await tx.taxRule.findMany({ where: { businessId } });
      const items = lines.map((l) => ({
        ...l,
        taxRatePercent: resolveTaxRatePercent(
          rules.map((r) => ({ ...r, rate: Number(r.rate) })),
          l.category,
          Number(business.taxRate),
        ),
      }));
      const taxInclusive = resolvePolicies(business).bool(
        'sales.pricesIncludeTax',
      );
      const totals = computeOrderTotals(
        items,
        0,
        Number(business.taxRate),
        taxInclusive,
      );
      const [{ next }] = await tx.$queryRaw<
        { next: bigint }[]
      >`SELECT COALESCE(MAX(order_no), 0) + 1 AS next FROM orders WHERE business_id = ${businessId}`;
      const order = await tx.order.create({
        data: {
          businessId,
          orderNo: Number(next),
          customerId: w.customerId,
          orderType: mode === 'quote' ? 'quotation' : 'counter',
          status: OrderStatus.pending,
          isQuotation: mode === 'quote',
          ...(mode === 'quote'
            ? {
                quotationStatus: 'draft' as const,
                quotationTerms: `Field Service ${w.number}`,
              }
            : {}),
          subtotal: totals.subtotal,
          tax: totals.tax,
          discount: 0,
          total: totals.total,
          taxInclusive,
          // Parts cost is recognised when Field Service issues them (stock movement), not again here.
          cogs: 0,
        },
      });
      await tx.orderItem.createMany({
        data: items.map((i) => ({
          orderId: order.id,
          productId: i.productId,
          name: i.name.slice(0, 190),
          price: i.price,
          cost: i.cost,
          qty: i.qty,
          taxRatePercent: i.taxRatePercent,
        })),
      });
      await tx.fsWorkOrder.update({
        where: { id: w.id },
        data:
          mode === 'quote'
            ? { quoteOrderId: order.id }
            : { invoiceOrderId: order.id },
      });
      return order;
    });
  }

  async quote(a: FsActor, id: string) {
    this.ctx.need(a, 'workorder', 'Requesting quotes');
    return this.ctx.once(a.rootId, `quote_${id}`, async () => {
      const d = await this.load(a);
      const w = this.must(d, id);
      if (w.quoteOrderId)
        throw fsErr(
          FS_ERRORS.DUPLICATE,
          'A quote already exists for this job.',
          HttpStatus.CONFLICT,
        );
      const { lines, notes } = await this.orderLines(d, w, 'quote');
      if (!lines.length)
        throw fsErr(
          FS_ERRORS.INVALID,
          `Nothing to quote — ${notes[0] ?? 'add parts or a labor product to the service type'}.`,
        );
      const o = await this.writeOrder(d, w, 'quote', lines);
      await this.ctx.event(
        a.rootId,
        w.id,
        `Quote #${o.orderNo} drafted in Orders`,
        a,
      );
      await this.ctx.audit(
        a.rootId,
        a,
        'Quote requested',
        'wo',
        w.id,
        `${w.number} → quotation #${o.orderNo} · ${d.fmt.money(num(o.total))}`,
      );
      return {
        ok: true,
        msg: `Orders created quote draft #${o.orderNo} for ${w.number}.`,
      };
    });
  }

  async invoice(a: FsActor, id: string) {
    this.ctx.need(a, 'workorder', 'Requesting invoices');
    return this.ctx.once(a.rootId, `inv_${id}`, async () => {
      const d = await this.load(a);
      const w = this.must(d, id);
      if (!DONE.includes(w.status))
        throw fsErr(
          FS_ERRORS.STATUS,
          'Invoice after the job is completed.',
          HttpStatus.CONFLICT,
        );
      if (w.invoiceOrderId)
        throw fsErr(
          FS_ERRORS.DUPLICATE,
          'This job already has an invoice.',
          HttpStatus.CONFLICT,
        );
      const { lines, notes } = await this.orderLines(d, w, 'invoice');
      const total = lines.reduce((x, l) => x + l.price * l.qty, 0);
      if (!lines.length || total <= 0)
        throw fsErr(
          FS_ERRORS.INVALID,
          `Nothing chargeable — ${lines.length ? 'every line is covered by the agreement / warranty' : (notes[0] ?? 'no billable labor or used parts')}.`,
        );
      const o = await this.writeOrder(d, w, 'invoice', lines);
      await this.ctx.event(
        a.rootId,
        w.id,
        `Invoice #${o.orderNo} issued by Orders (${d.fmt.money(num(o.total))})`,
        a,
      );
      await this.ctx.audit(
        a.rootId,
        a,
        'Invoice requested',
        'wo',
        w.id,
        `${w.number} → order #${o.orderNo} · ${d.fmt.money(num(o.total))}`,
      );
      return {
        ok: true,
        msg: `Orders issued invoice #${o.orderNo}. Payment status comes from Payments & Billing.`,
      };
    });
  }

  async paymentLink(a: FsActor, id: string) {
    this.ctx.need(a, 'workorder', 'Sending payment links');
    const d = await this.load(a);
    const w = this.must(d, id);
    if (!w.invoiceOrderId)
      throw fsErr(FS_ERRORS.INVALID, 'Request the invoice first.');
    if (this.data.payState(d, w) === 'Paid')
      throw fsErr(FS_ERRORS.INVALID, 'Already paid.');
    const pa = await this.payCtx.actor(a.user);
    const o = d.orders.get(w.invoiceOrderId);
    const r = await this.payReqs.create(pa, {
      env: 'live',
      customerId: w.customerId,
      contact: 'whatsapp',
      linkType: 'Invoice',
      linkId: w.invoiceOrderId,
      amountType: 'Fixed',
      amount: o ? r2(o.total - o.paid) : null,
      currency: d.biz.currency,
      description: `Field service ${w.number} · ${this.data.svName(d, w.serviceTypeId)}`,
      reference: w.number,
    });
    await this.db.fsWorkOrder.update({
      where: { id: w.id },
      data: { payRequestId: r.id },
    });
    await this.payReqs.send(pa, r.id, 'whatsapp').catch(() => null);
    const sent = await this.db.payRequest.findUnique({
      where: { id: r.id },
      select: { status: true, number: true },
    });
    await this.ctx.event(
      a.rootId,
      w.id,
      `Payment request ${sent?.number ?? ''} ${sent?.status === 'Sent' ? 'sent' : 'created (not delivered)'} by Payments & Billing`,
      a,
    );
    return {
      ok: true,
      msg:
        sent?.status === 'Sent'
          ? 'Payments & Billing sent the link. It shows Paid only after the provider confirms.'
          : `Payments & Billing created ${sent?.number ?? 'the request'} but couldn’t deliver it — send it from Payments › Requests.`,
    };
  }

  /** Dispatch lock (managers) — operational state kept beside the settings, never versioned. */
  async lock(a: FsActor, on: boolean) {
    this.ctx.need(a, 'approve', 'Locking dispatch');
    const s = await this.ctx.ensure(a.rootId);
    const cfg = (s.config ?? {}) as Record<string, unknown>;
    cfg.lock = on
      ? { by: a.name, userId: a.userId, at: new Date().toISOString() }
      : null;
    await this.db.fsSettings.update({
      where: { businessId: a.rootId },
      data: { config: cfg as Prisma.InputJsonValue },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      on ? 'Dispatch locked' : 'Dispatch unlocked',
      'settings',
      a.rootId,
      on
        ? 'Only managers can change assignments'
        : 'Dispatchers can assign again',
    );
    return { ok: true };
  }

  /** Customer-facing service report saved as a file on the job. */
  async saveReport(a: FsActor, id: string, html: string) {
    const d = await this.load(a);
    const w = this.must(d, id);
    const key = `field-service/${a.rootId}/${w.id}/report-${randomUUID()}.html`;
    await this.s3.upload(key, Buffer.from(html, 'utf8'), 'text/html');
    await this.db.fsFile.create({
      data: {
        businessId: a.rootId,
        woId: w.id,
        stage: 'report',
        name: `Service report ${w.number}.html`,
        storageKey: key,
        mime: 'text/html',
        size: Buffer.byteLength(html),
        byUserId: a.userId,
      },
    });
    await this.ctx.event(a.rootId, w.id, 'Service report saved to the job', a);
    return { ok: true };
  }

  async sendReport(a: FsActor, id: string, summary: string) {
    this.ctx.need(a, 'request', 'Sending service reports');
    const d = await this.load(a);
    const w = this.must(d, id);
    if (!w.signedBy)
      throw fsErr(FS_ERRORS.INVALID, 'Capture the customer signature first.');
    const n = await this.notify.send({
      cfg: d.cfg,
      tz: d.tz,
      kind: 'manual',
      customerId: w.customerId,
      templateKey: 'field_update',
      variables: {
        ref: w.number,
        businessName: d.biz.name,
        body: summary.slice(0, 900),
      },
    });
    if (!n.sent) throw fsErr(FS_ERRORS.INVALID, `Not sent — ${n.why}.`);
    await this.ctx.event(
      a.rootId,
      w.id,
      'Service report sent to the customer',
      a,
    );
    return { ok: true, msg: `Service report delivered (${n.why}).` };
  }

  /** Customer notice on demand (calendar / work orders). */
  async notifyCustomer(a: FsActor, id: string) {
    this.ctx.need(a, 'request', 'Notifying customers');
    const d = await this.load(a);
    const w = this.must(d, id);
    const n = await this.notify.send({
      cfg: d.cfg,
      tz: d.tz,
      kind: 'manual',
      customerId: w.customerId,
      templateKey: 'field_appointment',
      variables: {
        service: this.data.svName(d, w.serviceTypeId),
        wo: w.number,
        when: this.data.win(d, w),
        note: '',
      },
    });
    if (!n.sent) throw fsErr(FS_ERRORS.INVALID, `Not sent — ${n.why}.`);
    await this.ctx.event(
      a.rootId,
      w.id,
      'Appointment notice sent to the customer',
      a,
    );
    return { ok: true, msg: `Customer notified (${n.why}).` };
  }
}
