import { HttpStatus, Injectable } from '@nestjs/common';
import { Upload } from '../contracts/ct-files.service';
import { dayKey, zoned } from '../field-service/fs-time';
import {
  PpActor,
  PpContextService,
  notFound,
  num,
  ppErr,
} from './pp-context.service';
import { PpBridgeService } from './pp-bridge.service';
import { PP_ERRORS } from './pp.constants';
import { diffDays } from './pp-data.service';

export interface LeaveIn {
  userId?: string;
  type?: string;
  from?: string;
  to?: string;
  partial?: boolean | string;
  reason?: string;
  emergency?: boolean;
}

const isDay = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Leave & PTO on the Staff time-off record. `approved` stays true only while status is Approved,
 * so Staff schedules, Field Service, Helpdesk and Bookings keep reading the one absence source.
 */
@Injectable()
export class PpLeaveService {
  constructor(
    private readonly ctx: PpContextService,
    private readonly bridge: PpBridgeService,
  ) {}

  private get db() {
    return this.ctx.db;
  }

  private leaveYear(rootId: string, tz: string, month: number) {
    const today = dayKey(new Date(), tz);
    const [y, mo] = today.split('-').map(Number);
    const yr = mo >= month ? y : y - 1;
    return {
      start: new Date(Date.UTC(yr, month - 1, 1)),
      end: new Date(Date.UTC(yr + 1, month - 1, 1)),
      rootId,
    };
  }

  async balance(rootId: string, uid: string, type: string) {
    const cfg = await this.ctx.config(rootId);
    const t = cfg.leave.types.find((x) => x.key === type);
    if (!t || t.entitlement == null) return null;
    const biz = await this.ctx.business(rootId);
    const ly = this.leaveYear(
      rootId,
      biz.timezone || 'UTC',
      cfg.leave.yearStartMonth || 1,
    );
    const group = await this.ctx.branches(rootId);
    const used = await this.db.timeOff.aggregate({
      where: {
        businessId: { in: group.map((g) => g.id) },
        staffUser: { userId: uid },
        leaveType: type,
        status: 'Approved',
        startsAt: { gte: ly.start, lt: ly.end },
      },
      _sum: { days: true },
    });
    return t.entitlement - num(used._sum.days);
  }

  private async mine(a: PpActor, uid: string) {
    const group = await this.ctx.branches(a.rootId);
    const bu = await this.db.businessUser.findFirst({
      where: {
        userId: uid,
        businessId: { in: group.map((g) => g.id) },
        active: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!bu) throw ppErr(PP_ERRORS.INVALID, 'That person isn’t active staff.');
    return bu;
  }

  async request(a: PpActor, i: LeaveIn, att: Upload | null) {
    const uid = i.userId || a.userId;
    const emerg = !!i.emergency;
    if (emerg) this.ctx.need(a, 'leaveApprove', 'Recording emergency absence');
    if (uid !== a.userId && !a.leaveApprove)
      throw ppErr(
        PP_ERRORS.FORBIDDEN,
        'PERMISSION_DENIED — you can only request leave for yourself.',
        HttpStatus.FORBIDDEN,
      );
    if (uid !== a.userId && a.scope === 'team') {
      const ids =
        (await this.ctx.members(a.rootId)).find((m) => m.id === uid)?.buIds ??
        [];
      const p = await this.db.ppEmployee.findFirst({
        where: { businessUserId: { in: ids } },
      });
      if (p?.managerUserId !== a.userId)
        throw ppErr(
          PP_ERRORS.FORBIDDEN,
          'PERMISSION_DENIED — they aren’t in your team.',
          HttpStatus.FORBIDDEN,
        );
    }
    const cfg = await this.ctx.config(a.rootId);
    const t = cfg.leave.types.find((x) => x.key === i.type);
    if (!t)
      throw ppErr(
        PP_ERRORS.NOT_CONFIGURED,
        cfg.leave.types.length
          ? 'Pick a leave type.'
          : 'NOT_CONFIGURED — no leave types are set up yet (People settings › Leave types).',
      );
    if (!isDay(i.from) || !isDay(i.to))
      throw ppErr(PP_ERRORS.INVALID, 'Pick the dates.');
    if (i.to! < i.from!)
      throw ppErr(PP_ERRORS.INVALID, 'End date is before start date.');
    const reason = (i.reason ?? '').trim();
    if (!reason) throw ppErr(PP_ERRORS.INVALID, 'Add a reason.');
    const biz = await this.ctx.business(a.rootId);
    const tz = biz.timezone || 'UTC';
    const today = dayKey(new Date(), tz);
    if (!emerg && i.from! < today)
      throw ppErr(
        PP_ERRORS.INVALID,
        'Leave can’t start in the past — past absence is recorded as an emergency absence by an approver.',
      );
    if (emerg && diffDays(today, i.from!) > 7)
      throw ppErr(
        PP_ERRORS.INVALID,
        'Emergency absences can be recorded up to 7 days back.',
      );
    const partial =
      i.partial === true || i.partial === 'true' || i.partial === '1';
    if (partial && i.from !== i.to)
      throw ppErr(
        PP_ERRORS.INVALID,
        'A half day must start and end on the same day.',
      );
    const days = partial ? 0.5 : diffDays(i.to!, i.from!) + 1;
    const bal = await this.balance(a.rootId, uid, t.key);
    if (bal != null && !t.allowNegative && bal - days < 0)
      throw ppErr(
        PP_ERRORS.BALANCE,
        `INVALID_LEAVE_BALANCE — ${t.name} balance is ${bal} d, request is ${days} d. Negative balances aren’t allowed for this type.`,
      );
    const bu = await this.mine(a, uid);
    const group = await this.ctx.branches(a.rootId);
    const starts = zoned(i.from!, 0, tz);
    const ends = zoned(i.to!, 23.99, tz);
    const ov = await this.db.timeOff.findFirst({
      where: {
        businessId: { in: group.map((g) => g.id) },
        staffUser: { userId: uid },
        status: { in: ['Submitted', 'Approved'] },
        startsAt: { lte: ends },
        endsAt: { gte: starts },
      },
    });
    if (ov)
      throw ppErr(
        PP_ERRORS.INVALID,
        `Overlaps ${ov.number ?? 'another request'} (${ov.status}).`,
      );
    let attKey: string | null = null;
    if (att) {
      const doc = await this.bridge.fileDoc(a, {
        title: `Leave attachment · ${t.name} · ${i.from}`,
        type: 'Employment Document',
        linkId: uid,
        file: att,
        sensitivity: t.sensitive ? 'Restricted' : 'Confidential',
      });
      attKey = doc.id;
    }
    const r = await this.db.$transaction(async (tx) => {
      const number = await this.ctx.number(a.rootId, 'leave', tx);
      const x = await tx.timeOff.create({
        data: {
          businessId: bu.businessId,
          staffUserId: bu.id,
          startsAt: starts,
          endsAt: ends,
          reason: reason.slice(0, 500),
          number,
          leaveType: t.key,
          status: emerg ? 'Approved' : 'Submitted',
          approved: emerg,
          reviewedByUserId: emerg ? a.userId : null,
          days,
          partial,
          emergency: emerg,
          attachmentKey: attKey,
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        emerg ? 'Emergency absence recorded' : 'Leave requested',
        'leave',
        x.id,
        `${number} · ${t.name} · ${i.from} → ${i.to} · ${days} d`,
        { tx },
      );
      return x;
    });
    if (!emerg) {
      const p = await this.db.ppEmployee.findFirst({
        where: {
          businessUserId: {
            in:
              (await this.ctx.members(a.rootId)).find((m) => m.id === uid)
                ?.buIds ?? [],
          },
        },
      });
      await this.ctx.notify(
        a.rootId,
        p?.managerUserId
          ? [p.managerUserId]
          : await this.ctx.ownerIds(a.rootId),
        `Leave request: ${(await this.ctx.members(a.rootId)).find((m) => m.id === uid)?.name ?? ''}`,
        `${t.name} · ${i.from} → ${i.to} · ${days} d`,
        '/people/leave',
        a.userId,
      );
    }
    return {
      id: r.id,
      number: r.number,
      status: r.status,
      approverNotified: !emerg,
    };
  }

  private async row(a: PpActor, id: string) {
    const group = await this.ctx.branches(a.rootId);
    const l = await this.db.timeOff.findFirst({
      where: { id, businessId: { in: group.map((g) => g.id) } },
      include: {
        staffUser: {
          select: { userId: true, user: { select: { name: true } } },
        },
      },
    });
    if (!l) throw notFound('Leave request');
    return l;
  }

  async decide(
    a: PpActor,
    id: string,
    act: 'approve' | 'reject' | 'cancel',
    reason = '',
    expectedStatus?: string,
  ) {
    const l = await this.row(a, id);
    const uid = l.staffUser.userId;
    if (expectedStatus && expectedStatus !== l.status)
      throw ppErr(
        PP_ERRORS.CONFLICT,
        `VERSION_CONFLICT — ${l.number ?? 'this request'} is now ${l.status}. Nothing was changed.`,
        HttpStatus.CONFLICT,
      );
    if (act === 'cancel') {
      if (uid !== a.userId && !a.leaveApprove)
        throw ppErr(
          PP_ERRORS.FORBIDDEN,
          'PERMISSION_DENIED',
          HttpStatus.FORBIDDEN,
        );
      if (!['Submitted', 'Approved'].includes(l.status))
        throw ppErr(PP_ERRORS.STATUS, `${l.number} is ${l.status}.`);
      if (l.startsAt <= new Date())
        throw ppErr(
          PP_ERRORS.STATUS,
          'Leave that has started can’t be cancelled — an approver can record the change.',
        );
    } else {
      this.ctx.need(a, 'leaveApprove', 'Approving leave');
      if (uid === a.userId && !a.owner)
        throw ppErr(
          PP_ERRORS.FORBIDDEN,
          'PERMISSION_DENIED — you can’t approve your own leave.',
          HttpStatus.FORBIDDEN,
        );
      if (l.status !== 'Submitted')
        throw ppErr(PP_ERRORS.STATUS, `${l.number} is ${l.status}.`);
      if (act === 'reject' && !reason.trim())
        throw ppErr(PP_ERRORS.INVALID, 'Reason required.');
      if (act === 'approve' && l.leaveType) {
        const bal = await this.balance(a.rootId, uid, l.leaveType);
        const t = (await this.ctx.config(a.rootId)).leave.types.find(
          (x) => x.key === l.leaveType,
        );
        if (bal != null && t && !t.allowNegative && bal - num(l.days) < 0)
          throw ppErr(
            PP_ERRORS.BALANCE,
            `INVALID_LEAVE_BALANCE — balance ${bal} d is less than ${num(l.days)} d.`,
          );
      }
    }
    const to =
      act === 'approve'
        ? 'Approved'
        : act === 'reject'
          ? 'Rejected'
          : 'Cancelled';
    await this.db.$transaction(async (tx) => {
      await tx.timeOff.update({
        where: { id: l.id },
        data: {
          status: to,
          approved: to === 'Approved',
          ...(act !== 'cancel' ? { reviewedByUserId: a.userId } : {}),
          ...(act === 'reject' ? { rejectReason: reason.slice(0, 500) } : {}),
        },
      });
      await this.ctx.audit(
        a.rootId,
        a,
        `Leave ${to.toLowerCase()}`,
        'leave',
        l.id,
        `${l.number ?? l.id} · ${l.staffUser.user.name}${reason ? ` · ${reason}` : ''}`,
        { tx },
      );
    });
    if (uid !== a.userId)
      await this.ctx.notify(
        a.rootId,
        [uid],
        `Leave ${to.toLowerCase()}`,
        `${l.number ?? ''}${reason ? ` · ${reason}` : ''}`,
        '/people/leave',
      );
    return { status: to };
  }

  async attachment(a: PpActor, id: string) {
    const l = await this.row(a, id);
    if (!l.attachmentKey)
      throw ppErr(PP_ERRORS.NOT_FOUND, 'No attachment.', HttpStatus.NOT_FOUND);
    if (l.staffUser.userId !== a.userId && !a.leaveReason)
      this.ctx.need(a, 'leaveReason', 'Opening leave attachments');
    return this.bridge.docLink(a, l.attachmentKey);
  }
}
