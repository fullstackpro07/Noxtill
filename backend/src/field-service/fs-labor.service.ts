import { HttpStatus, Injectable } from '@nestjs/common';
import {
  FsActor,
  FsContextService,
  fsErr,
  notFound,
} from './fs-context.service';
import { Data } from './fs-data.service';
import { FsWorkOrdersService } from './fs-workorders.service';
import { FS_ERRORS, LABOR_TYPES } from './fs.constants';
import { keyPlus, zoned } from './fs-time';

export interface LaborIn {
  tech: string;
  woId: string;
  type: string;
  day: number;
  s: number;
  e: number;
  brk: number;
  billable: boolean;
  reason?: string;
}

/**
 * Field labor entries. Timers start with the job; manual entries need a reason (Settings › Labor
 * rules), overlapping entries are blocked, durations round to the configured step and overtime is
 * flagged from the shift and the daily threshold. Approved entries are read-only job costing —
 * payroll pays from Staff timesheets (attendance), so field labor is never paid twice.
 */
@Injectable()
export class FsLaborService {
  constructor(
    private readonly ctx: FsContextService,
    private readonly wos: FsWorkOrdersService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  private own(a: FsActor, techUserId: string) {
    if (techUserId !== a.userId && !a.dispatch && !a.approve)
      throw fsErr(
        FS_ERRORS.FORBIDDEN,
        'You can only change your own labor entries.',
        HttpStatus.FORBIDDEN,
      );
  }

  private validate(d: Data, a: FsActor, b: LaborIn, exceptId?: string) {
    if (!LABOR_TYPES.includes(b.type))
      throw fsErr(FS_ERRORS.INVALID, 'Pick a labor type.');
    if (!(b.e > b.s))
      throw fsErr(FS_ERRORS.INVALID, 'End must be after start.');
    if (b.brk < 0 || b.brk >= (b.e - b.s) * 60)
      throw fsErr(FS_ERRORS.INVALID, 'Break is longer than the entry.');
    if (d.cfg.labor.manualReason && !b.reason?.trim())
      throw fsErr(
        FS_ERRORS.INVALID,
        'A reason is required for manual time (Settings › Labor rules).',
      );
    if (b.day > 0)
      throw fsErr(FS_ERRORS.INVALID, 'Time can’t be logged in the future.');
    const w = d.wos.find((x) => x.id === b.woId);
    if (!w || ['Draft', 'Cancelled'].includes(w.status))
      throw fsErr(FS_ERRORS.INVALID, 'Pick an active work order.');
    if (
      !d.techs.some((t) => t.id === b.tech) &&
      !d.people.some((p) => p.id === b.tech)
    )
      throw fsErr(FS_ERRORS.INVALID, 'Pick a technician.');
    this.own(a, b.tech);
    const key = keyPlus(b.day, d.tz, d.now);
    const start = zoned(key, b.s, d.tz);
    const end = this.wos.roundEnd(d, start, zoned(key, b.e, d.tz));
    if (end.getTime() > Date.now() + 60000)
      throw fsErr(FS_ERRORS.INVALID, 'The entry ends in the future.');
    if (!d.cfg.labor.overlap) {
      const ov = d.labor.find(
        (l) =>
          l.id !== exceptId &&
          l.techUserId === b.tech &&
          start < (l.endAt ?? new Date()) &&
          end > l.startAt &&
          l.status !== 'Rejected',
      );
      if (ov)
        throw fsErr(
          FS_ERRORS.INVALID,
          `Overlaps ${ov.number} — overlapping entries are blocked (Settings › Labor rules).`,
        );
    }
    return { start, end, w };
  }

  async manual(a: FsActor, b: LaborIn) {
    this.ctx.need(a, 'execute', 'Logging labor');
    const d = await this.wos.load(a);
    const { start, end, w } = this.validate(d, a, b);
    const number = await this.ctx.number(a.rootId, 'lab');
    const ot = await this.wos.isOvertime(d, b.tech, start, end);
    await this.db.fsLabor.create({
      data: {
        businessId: a.rootId,
        number,
        woId: w.id,
        techUserId: b.tech,
        type: b.type,
        startAt: start,
        endAt: end,
        breakMin: Math.round(b.brk),
        billable: b.billable,
        status: 'Draft',
        reason: `Manual: ${b.reason ?? ''}`.slice(0, 255),
        overtime: ot,
        rate:
          d.techs.find((t) => t.id === b.tech)?.rate ??
          d.people.find((p) => p.id === b.tech)?.rate ??
          null,
        createdById: a.userId,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Manual labor added',
      'labor',
      number,
      `${number} · ${w.number} · ${b.type}${b.reason ? ` · ${b.reason}` : ''}`,
    );
    return { ok: true, msg: 'Saved as Draft — submit it for approval.' };
  }

  async edit(a: FsActor, id: string, b: LaborIn) {
    this.ctx.need(a, 'execute', 'Editing labor');
    const d = await this.wos.load(a);
    const l = d.labor.find((x) => x.id === id);
    if (!l) throw notFound('Labor entry');
    this.own(a, l.techUserId);
    if (!['Draft', 'Rejected'].includes(l.status))
      throw fsErr(
        FS_ERRORS.INVALID,
        `${l.number} is ${l.status} — only Draft or Rejected entries can be edited.`,
      );
    const { start, end, w } = this.validate(d, a, b, id);
    await this.db.fsLabor.update({
      where: { id },
      data: {
        techUserId: b.tech,
        woId: w.id,
        type: b.type,
        startAt: start,
        endAt: end,
        breakMin: Math.round(b.brk),
        billable: b.billable,
        status: 'Draft',
        reason: `Edited: ${b.reason ?? ''}`.slice(0, 255),
        overtime: await this.wos.isOvertime(d, b.tech, start, end, id),
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Labor edited',
      'labor',
      l.number,
      `${l.number}${b.reason ? ` · ${b.reason}` : ''}`,
    );
    return { ok: true, msg: `${l.number} saved as Draft.` };
  }

  async action(
    a: FsActor,
    id: string,
    act: 'Stop timer' | 'Submit' | 'Approve' | 'Reject',
    reason?: string,
  ) {
    const d = await this.wos.load(a);
    const l = d.labor.find((x) => x.id === id);
    if (!l) throw notFound('Labor entry');
    if (act === 'Stop timer') {
      this.ctx.need(a, 'execute', 'Stopping timers');
      this.own(a, l.techUserId);
      if (l.status !== 'Running')
        throw fsErr(FS_ERRORS.INVALID, 'Timer isn’t running.');
      const end = this.wos.roundEnd(d, l.startAt, new Date());
      await this.db.fsLabor.update({
        where: { id },
        data: {
          endAt: end,
          status: 'Draft',
          overtime: await this.wos.isOvertime(
            d,
            l.techUserId,
            l.startAt,
            end,
            id,
          ),
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Labor timer stopped',
        'labor',
        l.number,
        `${l.number} · event field.labor.completed`,
      );
      return { ok: true, msg: `${l.number} stopped — saved as Draft.` };
    }
    if (act === 'Submit') {
      this.ctx.need(a, 'execute', 'Submitting labor');
      this.own(a, l.techUserId);
      if (!['Draft', 'Rejected'].includes(l.status))
        throw fsErr(FS_ERRORS.INVALID, `${l.number} is ${l.status}.`);
      await this.db.fsLabor.update({
        where: { id },
        data: { status: 'Submitted' },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Labor submitted',
        'labor',
        l.number,
        l.number,
      );
      return { ok: true, msg: `${l.number} submitted for approval.` };
    }
    this.ctx.need(a, 'approve', 'Approving labor');
    if (l.status !== 'Submitted')
      throw fsErr(
        FS_ERRORS.INVALID,
        `${l.number} is ${l.status} — only submitted entries can be decided.`,
      );
    if (act === 'Approve') {
      await this.db.fsLabor.update({
        where: { id },
        data: { status: 'Approved', decidedById: a.userId },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        'Labor approved',
        'labor',
        l.number,
        `${l.number} · read-only · job costing (payroll pays from Staff timesheets)`,
      );
      return {
        ok: true,
        msg: `${l.number} approved — now read-only. It costs the job; payroll still pays from Staff timesheets.`,
      };
    }
    if (!reason?.trim()) throw fsErr(FS_ERRORS.INVALID, 'Reason required.');
    await this.db.fsLabor.update({
      where: { id },
      data: {
        status: 'Rejected',
        reason: reason.slice(0, 255),
        decidedById: a.userId,
      },
    });
    await this.ctx.audit(
      a.rootId,
      a,
      'Labor rejected',
      'labor',
      l.number,
      `${l.number} · ${reason}`,
    );
    return { ok: true, msg: `${l.number} rejected.` };
  }
}
