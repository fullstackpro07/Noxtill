import { HttpStatus, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  AmActor,
  AmContextService,
  Tx,
  amErr,
  dec,
  num,
} from './am-context.service';
import {
  AM_ERRORS,
  ASSET_T,
  CONDITIONS,
  FINAL_ASSET,
  OPEN_REQ,
} from './am.constants';

const day = (s?: string | null) =>
  s ? new Date(`${s.slice(0, 10)}T00:00:00Z`) : null;

/** Encoded assignee: u:<userId> | t:<teamId> | s:<supplierId>. */
export const parseWho = (who?: string | null) => {
  const [k, id] = (who ?? '').split(':');
  return {
    assigneeUserId: k === 'u' ? id : null,
    teamId: k === 't' ? id : null,
    supplierId: k === 's' ? id : null,
  };
};

/** Meter readings, maintenance requests, downtime, inspections and service events. */
@Injectable()
export class AmMaintService {
  constructor(private readonly ctx: AmContextService) {}

  private get db() {
    return this.ctx.db;
  }

  private async asset(rootId: string, id: string) {
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

  /** Validates that an encoded assignee belongs to this business. */
  async checkWho(rootId: string, who?: string | null) {
    if (!who) return parseWho(null);
    const w = parseWho(who);
    const group = (await this.ctx.branches(rootId)).map((g) => g.id);
    const ok = w.assigneeUserId
      ? await this.db.businessUser.findFirst({
          where: {
            userId: w.assigneeUserId,
            businessId: { in: group },
            active: true,
          },
        })
      : w.teamId
        ? await this.db.amTeam.findFirst({
            where: { id: w.teamId, businessId: rootId },
          })
        : w.supplierId
          ? await this.db.supplier.findFirst({
              where: { id: w.supplierId, businessId: { in: group } },
            })
          : null;
    if (!ok)
      throw amErr(AM_ERRORS.INVALID, 'That assignee isn’t in this business.');
    return w;
  }

  // ── meter readings ────────────────────────────────────────────────────

  private async lastEffective(assetId: string, tx?: Tx) {
    const db = tx ?? this.db;
    const rs = await db.amReading.findMany({
      where: { assetId },
      orderBy: [{ takenAt: 'asc' }, { createdAt: 'asc' }],
    });
    const corrected = new Set(
      rs.filter((r) => r.correctionOfId).map((r) => r.correctionOfId),
    );
    const eff = rs.filter((r) => !corrected.has(r.id));
    return eff.length ? eff[eff.length - 1] : null;
  }

  /** Validates and appends a reading. Returns the reading and the meter plans that became due. */
  async recordReading(
    a: AmActor,
    b: { assetId: string; value: number; source?: string },
    o?: { tx?: Tx; skipRight?: boolean },
  ) {
    if (!o?.skipRight) this.ctx.need(a, 'reading', 'Recording a meter reading');
    const x = await this.asset(a.rootId, b.assetId);
    if (!x.meterType)
      throw amErr(
        AM_ERRORS.READING,
        `INVALID_METER_READING — ${x.number} has no meter. Set a meter type on the asset first.`,
      );
    const val = Number(b.value);
    if (!Number.isFinite(val) || val < 0)
      throw amErr(
        AM_ERRORS.READING,
        'INVALID_METER_READING — enter a positive number.',
      );
    const last = await this.lastEffective(x.id, o?.tx);
    if (last && val < num(last.value))
      throw amErr(
        AM_ERRORS.READING,
        `INVALID_METER_READING — ${val.toLocaleString()} is lower than the last reading ${num(last.value).toLocaleString()} ${x.meterUnit ?? ''}. Meters don’t go backwards; use “Correct reading” on the wrong record.`,
      );
    if (last && x.meterUnit === 'h') {
      const elapsed = (Date.now() - last.takenAt.getTime()) / 3600_000;
      if (val - num(last.value) > elapsed + 24)
        throw amErr(
          AM_ERRORS.READING,
          `INVALID_METER_READING — +${(val - num(last.value)).toLocaleString()} h since ${last.takenAt.toISOString().slice(0, 10)} is more hours than have passed. Check the value.`,
        );
    }
    const source = (b.source || 'Manual').slice(0, 40);
    if (
      !['Manual', 'Photo of meter'].includes(source) &&
      !/^(Request|Completion|Initial)/.test(source)
    )
      throw amErr(
        AM_ERRORS.INVALID,
        'Readings are entered manually or from a photo of the meter — no telematics or POS meter feed is connected.',
      );
    const db = o?.tx ?? this.db;
    const r = await db.amReading.create({
      data: {
        businessId: a.rootId,
        assetId: x.id,
        value: dec(val),
        takenAt: new Date(),
        source,
        byUserId: a.userId,
      },
    });
    const due = await db.amPmPlan.findMany({
      where: {
        assetId: x.id,
        status: 'Active',
        trigger: { in: ['Meter', 'Hybrid'] },
        nextDueMeter: { not: null },
      },
    });
    const now = due.filter((p) => val >= num(p.nextDueMeter));
    await this.ctx.audit(
      a.rootId,
      a,
      'Meter reading recorded',
      'asset',
      x.id,
      `${x.number} · ${val} ${x.meterUnit ?? ''} · ${source}`,
      { tx: o?.tx },
    );
    return { reading: r, dueByMeter: now.map((p) => p.name) };
  }

  async correctReading(
    a: AmActor,
    id: string,
    b: { value: number; reason: string },
  ) {
    this.ctx.need(a, 'edit', 'Correcting a meter reading');
    const r = await this.db.amReading.findFirst({
      where: { id, businessId: a.rootId },
    });
    if (!r)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'Reading not found',
        HttpStatus.NOT_FOUND,
      );
    if (r.correctionOfId)
      throw amErr(
        AM_ERRORS.INVALID,
        'This is already a correction — correct the latest record instead.',
      );
    if (await this.db.amReading.findFirst({ where: { correctionOfId: id } }))
      throw amErr(
        AM_ERRORS.CONFLICT,
        'This reading was already corrected.',
        HttpStatus.CONFLICT,
      );
    const val = Number(b.value);
    if (!Number.isFinite(val) || val < 0)
      throw amErr(AM_ERRORS.READING, 'Enter the correct value.');
    if (!b.reason?.trim())
      throw amErr(AM_ERRORS.INVALID, 'A reason is required.');
    const x = await this.asset(a.rootId, r.assetId);
    const c = await this.db.amReading.create({
      data: {
        businessId: a.rootId,
        assetId: r.assetId,
        value: dec(val),
        takenAt: r.takenAt,
        source: 'Correction',
        byUserId: a.userId,
        correctionOfId: r.id,
        reason: b.reason.trim().slice(0, 255),
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Meter reading corrected',
      'asset',
      r.assetId,
      `${x.number} · ${num(r.value)} → ${val} (original kept) · reason: ${b.reason.trim()}`,
    );
    return c;
  }

  // ── requests ──────────────────────────────────────────────────────────

  async mustReq(rootId: string, id: string) {
    const r = await this.db.amRequest.findFirst({
      where: { id, businessId: rootId },
    });
    if (!r)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'Request not found',
        HttpStatus.NOT_FOUND,
      );
    return r;
  }

  async createRequest(
    a: AmActor,
    b: {
      assetId: string;
      issueType?: string;
      title: string;
      description?: string;
      observed?: string;
      priority?: string;
      safety?: boolean;
      operational?: boolean;
      reading?: number | null;
      preferredOn?: string;
      draft?: boolean;
    },
  ) {
    this.ctx.need(a, 'request', 'Creating a maintenance request');
    if (!b.assetId || !b.title?.trim())
      throw amErr(AM_ERRORS.INVALID, 'Asset and title are required.');
    const x = await this.asset(a.rootId, b.assetId);
    if (FINAL_ASSET.includes(x.status))
      throw amErr(
        AM_ERRORS.CONFLICT,
        `${x.number} is ${x.status.toLowerCase()} — requests can’t be raised on it.`,
        HttpStatus.CONFLICT,
      );
    const cfg = await this.ctx.config(a.rootId);
    const issueType = b.issueType || 'Other';
    if (!cfg.issueTypes.includes(issueType))
      throw amErr(AM_ERRORS.INVALID, 'Unknown issue type.');
    const priority = b.priority || 'Medium';
    if (!cfg.priorities.includes(priority))
      throw amErr(AM_ERRORS.INVALID, 'Unknown priority.');
    if (b.observed && !CONDITIONS.includes(b.observed as never))
      throw amErr(AM_ERRORS.INVALID, 'Unknown condition.');
    const down = b.operational === false;
    const req = await this.db.$transaction(async (tx) => {
      const number = await this.ctx.number(a.rootId, 'req', tx);
      const r = await tx.amRequest.create({
        data: {
          businessId: a.rootId,
          number,
          assetId: x.id,
          issueType,
          title: b.title.trim().slice(0, 200),
          description: b.description?.trim() || null,
          priority,
          safety: !!b.safety,
          down,
          observed: b.observed ?? null,
          reporterId: a.userId,
          status: b.draft ? 'Draft' : 'Awaiting Triage',
          preferredOn: day(b.preferredOn),
        },
      });
      if (
        down &&
        !(await tx.amDowntime.findFirst({
          where: { assetId: x.id, endAt: null },
        }))
      )
        await tx.amDowntime.create({
          data: {
            businessId: a.rootId,
            assetId: x.id,
            startAt: new Date(),
            kind: 'Unplanned',
            reason: 'Failure',
            cause: r.title.slice(0, 255),
            requestId: r.id,
            impact: `Reported by ${a.name}`,
            byUserId: a.userId,
          },
        });
      if (b.reading != null && x.meterType)
        await this.recordReading(
          a,
          { assetId: x.id, value: b.reading, source: `Request ${number}` },
          { tx, skipRight: true },
        );
      await this.ctx.audit(
        a.rootId,
        a,
        'Request created',
        'request',
        r.id,
        `${number} · ${x.number}${b.safety ? ' · SAFETY' : ''}${down ? ' · downtime started' : ''}`,
        { tx },
      );
      return r;
    });
    if (!b.draft) {
      const triagers = await this.ctx.roleUsers(a.rootId, [
        Role.owner,
        Role.manager,
      ]);
      await this.ctx.notify(
        a.rootId,
        triagers,
        `${req.number}: ${req.title}`,
        `${x.number} · ${x.name} · ${priority}${b.safety ? ' · safety concern' : ''}${down ? ' · asset down' : ''}`,
        '/assets-maintenance/requests',
        a.userId,
      );
    }
    return req;
  }

  private async note(rid: string, a: AmActor, text: string, tx?: Tx) {
    await (tx ?? this.db).amRequestNote.create({
      data: { requestId: rid, text: text.slice(0, 2000), byUserId: a.userId },
    });
  }

  private triageOpen(st: string) {
    return OPEN_REQ.includes(st);
  }

  async reqAction(
    a: AmActor,
    id: string,
    act: string,
    b: { who?: string; priority?: string; reason?: string; question?: string },
  ) {
    const r = await this.mustReq(a.rootId, id);
    const need = (right: 'approve' | 'request') =>
      this.ctx.need(a, right, `${act} on ${r.number}`);
    const upd = async (data: Record<string, unknown>, note?: string) => {
      const row = await this.db.amRequest.update({ where: { id }, data });
      if (note) await this.note(id, a, note);
      await this.ctx.audit(
        a.rootId,
        a,
        `Request ${act.toLowerCase()}`,
        'request',
        id,
        `${r.number}${note ? ` · ${note}` : ''}`,
      );
      return row;
    };
    switch (act) {
      case 'Assign triage': {
        need('approve');
        if (!this.triageOpen(r.status)) throw this.closed(r);
        const w = await this.checkWho(
          a.rootId,
          b.who?.startsWith('u:') ? b.who : `u:${b.who}`,
        );
        const res = await upd(
          {
            triageId: w.assigneeUserId,
            status: r.status === 'Awaiting Triage' ? 'Open' : r.status,
            triagedAt: r.triagedAt ?? new Date(),
          },
          `Triage assigned to ${(await this.db.user.findUnique({ where: { id: w.assigneeUserId! }, select: { name: true } }))?.name ?? '—'}`,
        );
        await this.ctx.notify(
          a.rootId,
          [w.assigneeUserId!],
          `Triage ${r.number}`,
          r.title,
          '/assets-maintenance/requests',
          a.userId,
        );
        return res;
      }
      case 'Change priority': {
        need('approve');
        const cfg = await this.ctx.config(a.rootId);
        if (!b.priority || !cfg.priorities.includes(b.priority))
          throw amErr(AM_ERRORS.INVALID, 'Pick a priority.');
        return upd(
          { priority: b.priority },
          `Priority ${r.priority} → ${b.priority}${b.reason ? ` (${b.reason})` : ''}`,
        );
      }
      case 'Request more information': {
        need('approve');
        if (!this.triageOpen(r.status)) throw this.closed(r);
        if (!b.question?.trim())
          throw amErr(AM_ERRORS.INVALID, 'Say what you need.');
        const res = await upd(
          { status: 'Needs Information', triagedAt: r.triagedAt ?? new Date() },
          `Info requested: ${b.question.trim()}`,
        );
        await this.ctx.notify(
          a.rootId,
          [r.reporterId],
          `More information needed on ${r.number}`,
          b.question.trim(),
          '/assets-maintenance/requests',
          a.userId,
        );
        return res;
      }
      case 'Information received':
        need('approve');
        if (r.status !== 'Needs Information') throw this.closed(r);
        return upd(
          { status: 'Awaiting Triage' },
          'Reporter replied — back to triage',
        );
      case 'Approve':
        need('approve');
        if (!this.triageOpen(r.status) || r.status === 'Approved')
          throw this.closed(r);
        return upd(
          { status: 'Approved', triagedAt: r.triagedAt ?? new Date() },
          'Approved',
        );
      case 'Reject':
        need('approve');
        if (!this.triageOpen(r.status)) throw this.closed(r);
        if (!b.reason?.trim())
          throw amErr(AM_ERRORS.INVALID, 'A reason is required.');
        return upd(
          { status: 'Rejected', triagedAt: r.triagedAt ?? new Date() },
          `Rejected: ${b.reason.trim()}`,
        );
      case 'Submit':
        need('request');
        if (r.status !== 'Draft') throw this.closed(r);
        return upd({ status: 'Awaiting Triage' }, 'Submitted for triage');
      case 'Close':
        need('approve');
        if (!['Approved', 'Converted', 'Rejected'].includes(r.status))
          throw this.closed(r);
        if (!b.reason?.trim())
          throw amErr(AM_ERRORS.INVALID, 'A reason is required.');
        return upd({ status: 'Closed' }, `Closed: ${b.reason.trim()}`);
      default:
        throw amErr(AM_ERRORS.INVALID, `Unknown action “${act}”.`);
    }
  }

  private closed(r: { number: string; status: string }) {
    return amErr(
      AM_ERRORS.TRANSITION,
      `INVALID_STATUS_TRANSITION — ${r.number} is ${r.status}; that action isn’t available.`,
      HttpStatus.CONFLICT,
    );
  }

  // ── downtime ──────────────────────────────────────────────────────────

  async logDowntime(
    a: AmActor,
    b: {
      assetId: string;
      kind: string;
      reason: string;
      cause: string;
      impact?: string;
      woId?: string;
    },
  ) {
    this.ctx.need(a, 'complete', 'Logging downtime');
    const x = await this.asset(a.rootId, b.assetId);
    if (!b.cause?.trim()) throw amErr(AM_ERRORS.INVALID, 'Cause required.');
    if (!['Planned', 'Unplanned'].includes(b.kind))
      throw amErr(AM_ERRORS.INVALID, 'Pick planned or unplanned.');
    const cfg = await this.ctx.config(a.rootId);
    if (!cfg.dreasons.includes(b.reason))
      throw amErr(AM_ERRORS.INVALID, 'Unknown downtime reason.');
    if (
      await this.db.amDowntime.findFirst({
        where: { assetId: x.id, endAt: null },
      })
    )
      throw amErr(
        AM_ERRORS.CONFLICT,
        `${x.number} already has open downtime — end it first.`,
        HttpStatus.CONFLICT,
      );
    const d = await this.db.amDowntime.create({
      data: {
        businessId: a.rootId,
        assetId: x.id,
        startAt: new Date(),
        kind: b.kind,
        reason: b.reason,
        cause: b.cause.trim().slice(0, 255),
        impact: b.impact?.trim() || null,
        woId: b.woId || null,
        byUserId: a.userId,
      },
    });
    if (b.kind === 'Unplanned' && x.status === 'Active')
      await this.db.amAsset.update({
        where: { id: x.id },
        data: { status: 'Out of Service', version: { increment: 1 } },
      });
    await this.ctx.audit(
      a.rootId,
      a,
      'Downtime started',
      'asset',
      x.id,
      `${x.number} · ${b.kind} · ${b.cause.trim()}`,
    );
    return d;
  }

  async endDowntime(a: AmActor, id: string) {
    this.ctx.need(a, 'complete', 'Ending downtime');
    const d = await this.db.amDowntime.findFirst({
      where: { id, businessId: a.rootId },
    });
    if (!d)
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'Downtime not found',
        HttpStatus.NOT_FOUND,
      );
    if (d.endAt)
      throw amErr(
        AM_ERRORS.CONFLICT,
        'This downtime already ended.',
        HttpStatus.CONFLICT,
      );
    const x = await this.asset(a.rootId, d.assetId);
    const row = await this.db.amDowntime.update({
      where: { id },
      data: { endAt: new Date() },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Downtime ended',
      'asset',
      x.id,
      `${x.number} · ${((row.endAt!.getTime() - d.startAt.getTime()) / 3600_000).toFixed(1)} h`,
    );
    return row;
  }

  // ── inspections & service events ──────────────────────────────────────

  private async conditionTo(
    a: AmActor,
    x: { id: string; number: string; condition: string },
    to: string,
    why: string,
  ) {
    if (!to || to === x.condition) return;
    await this.db.amAsset.update({
      where: { id: x.id },
      data: { condition: to, version: { increment: 1 } },
    });
    await this.db.amEvent.create({
      data: {
        businessId: a.rootId,
        assetId: x.id,
        type: 'Condition Change',
        occurredAt: new Date(),
        summary: `Condition ${x.condition} → ${to} ${why}`,
        condBefore: x.condition,
        condAfter: to,
        byUserId: a.userId,
      },
    });
  }

  async inspect(
    a: AmActor,
    b: {
      assetId: string;
      kind?: string;
      checklistRef?: string;
      result: string;
      score?: number | null;
      condition?: string;
      findings: string;
      critical?: boolean;
      recommendation?: string;
    },
  ) {
    this.ctx.need(a, 'complete', 'Recording an inspection');
    if (!b.assetId || !b.findings?.trim())
      throw amErr(AM_ERRORS.INVALID, 'Asset and findings are required.');
    if (!['Pass', 'Fail'].includes(b.result))
      throw amErr(AM_ERRORS.INVALID, 'Result must be Pass or Fail.');
    if (
      b.score != null &&
      (!Number.isFinite(b.score) || b.score < 0 || b.score > 100)
    )
      throw amErr(AM_ERRORS.INVALID, 'Score must be 0–100.');
    const x = await this.asset(a.rootId, b.assetId);
    if (FINAL_ASSET.includes(x.status))
      throw amErr(
        AM_ERRORS.CONFLICT,
        `${x.number} is ${x.status.toLowerCase()}.`,
        HttpStatus.CONFLICT,
      );
    const cond =
      b.condition && CONDITIONS.includes(b.condition as never)
        ? b.condition
        : x.condition;
    const ev = await this.db.amEvent.create({
      data: {
        businessId: a.rootId,
        assetId: x.id,
        type: 'Inspection',
        occurredAt: new Date(),
        summary:
          `${b.kind || 'Routine'} inspection — ${b.findings.trim()}`.slice(
            0,
            2000,
          ),
        condBefore: x.condition,
        condAfter: cond,
        result: b.result,
        score: b.score ?? null,
        findings: b.findings.trim(),
        checklistRef: b.checklistRef?.trim() || null,
        critical: !!b.critical,
        byUserId: a.userId,
        extra: b.recommendation
          ? { recommendation: b.recommendation }
          : undefined,
      },
    });
    await this.conditionTo(a, x, cond, 'after inspection');
    await this.ctx.audit(
      a.rootId,
      a,
      'Inspection recorded',
      'asset',
      x.id,
      `${x.number} · ${b.result}${b.critical ? ' · critical finding' : ''}`,
    );
    return ev;
  }

  async service(
    a: AmActor,
    b: {
      assetId: string;
      type: string;
      woId?: string;
      work: string;
      by?: string;
      condition?: string;
      outcome?: string;
    },
  ) {
    this.ctx.need(a, 'complete', 'Recording a service event');
    if (!b.assetId || !b.work?.trim())
      throw amErr(AM_ERRORS.INVALID, 'Asset and work performed are required.');
    if (
      ![
        'Maintenance',
        'Repair',
        'Calibration',
        'Warranty Service',
        'Replacement',
        'Upgrade',
      ].includes(b.type)
    )
      throw amErr(AM_ERRORS.INVALID, 'Unknown service type.');
    const x = await this.asset(a.rootId, b.assetId);
    if (
      b.woId &&
      !(await this.db.amWorkOrder.findFirst({
        where: { id: b.woId, businessId: a.rootId, assetId: x.id },
      }))
    )
      throw amErr(AM_ERRORS.INVALID, 'That work order isn’t for this asset.');
    const who = await this.checkWho(a.rootId, b.by);
    const cond =
      b.condition && CONDITIONS.includes(b.condition as never)
        ? b.condition
        : x.condition;
    const ev = await this.db.amEvent.create({
      data: {
        businessId: a.rootId,
        assetId: x.id,
        type: b.type,
        occurredAt: new Date(),
        summary: b.work.trim(),
        condBefore: x.condition,
        condAfter: cond,
        result: b.outcome || null,
        woId: b.woId || null,
        byUserId:
          who.assigneeUserId ??
          (who.teamId || who.supplierId ? null : a.userId),
        byTeamId: who.teamId,
        bySupplierId: who.supplierId,
      },
    });
    await this.conditionTo(a, x, cond, `after ${b.type.toLowerCase()}`);
    await this.ctx.audit(
      a.rootId,
      a,
      'Service event recorded',
      'asset',
      x.id,
      `${x.number} · ${b.type}`,
    );
    return ev;
  }

  /** Asset status the transition table allows, or the current one. */
  allowedStatus(cur: string, to: string) {
    return cur === to || (ASSET_T[cur] ?? []).includes(to) ? to : cur;
  }
}
