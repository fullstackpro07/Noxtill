import { Injectable } from '@nestjs/common';
import {
  OrderStatus,
  AppointmentStatus,
  Prisma,
  StaffAdvanceStatus,
} from '@prisma/client';
import { createHash } from 'crypto';
import { Fmt } from '../payments/pay-vm';
import { dayKey } from '../field-service/fs-time';
import { Member, PpActor, PpContextService, num } from './pp-context.service';
import { ENGINE, LeaveType, TaxTable, monthlyTax } from './pp.constants';

export interface PpScope {
  tab: string;
  branch: string;
  dept: string;
  f: Record<string, Record<string, string>>;
  page: Record<string, number>;
  view: Record<string, string>;
  run: string;
}

export interface Emp {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  buId: string;
  buIds: string[];
  branchId: string;
  role: Member['role'];
  roleLabel: string;
  active: boolean;
  hasProfile: boolean;
  profileId: string | null;
  version: number;
  dept: string;
  title: string;
  type: string;
  mgr: string | null;
  basis: string | null;
  /** Monthly salary (Salaried) or hourly rate (Hourly); null = not set. */
  rate: number | null;
  start: Date;
  startSet: boolean;
  probationEnd: Date | null;
  contractEnd: Date | null;
  status: string;
  inPayroll: boolean;
  bankName: string | null;
  bankMask: string | null;
  bankTitle: string | null;
  taxStatus: string | null;
  taxMask: string | null;
  hasCommissionRule: boolean;
  exitedAt: Date | null;
}

export interface Leave {
  id: string;
  number: string;
  uid: string;
  buId: string;
  businessId: string;
  type: string;
  s: Date;
  e: Date;
  sKey: string;
  eKey: string;
  days: number;
  partial: boolean;
  status: string;
  reason: string;
  emerg: boolean;
  apr: string | null;
  rej: string | null;
  attachmentKey: string | null;
  createdAt: Date;
}

export interface RuleVer {
  ver: number;
  from: string;
  to: string | null;
  ee: number | null;
  er: number | null;
  by: string;
  at: string;
  why: string;
}
export interface Rule {
  id: string;
  number: string;
  name: string;
  type: string;
  cls: string;
  pp: string;
  method: string;
  elig: string;
  fin: string | null;
  prov: string | null;
  versions: RuleVer[];
  assigned: string[];
  status: string;
}

export interface Inp {
  basis: string | null;
  rate: number | null;
  hours: number;
  ot: number;
  otMult: number;
  tsOk: boolean;
  tsNeeded: boolean;
  comm: number;
  commPaidOutside: boolean;
  commRule: boolean;
  advances: { id: string; amount: number }[];
  adds: { label: string; amount: number }[];
  deds: { label: string; amount: number }[];
  unpaid: number;
  prorate: number;
  taxp: string | null;
  bank: string | null;
  rules: {
    id: string;
    name: string;
    type: string;
    pp: string;
    method: string;
    ver: number;
    ee: number | null;
    er: number | null;
    fin: string | null;
  }[];
}

export interface Calc {
  regular: number;
  leaveImp: number;
  ot: number;
  comm: number;
  tips: null;
  bonus: number;
  allow: number;
  gross: number;
  pre: number;
  pf: number;
  tax: number | null;
  post: number;
  adv: number;
  advIds: string[];
  net: number | null;
  er: number;
  cost: number;
  warn: string[];
  f: Record<string, string>;
  ver: string;
  taxVer: string;
  lines: { name: string; kind: string; amount: number }[];
  inp: Inp;
}

export interface Snapshot {
  at: string;
  hash: string;
  engine: string;
  tax: string;
  period: string;
  emps: { uid: string; inp: Inp }[];
  vers: Record<string, string>;
}

export interface RunExc {
  uid: string;
  msg: string;
  sev: 'Blocking' | 'Warning';
  ok: boolean;
  key: string;
}

export interface Ready {
  t: string;
  st: string;
  n: number;
  who: string[];
  note: string;
  src: string;
}

const DAY = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;
export const ymOf = (key: string) => key.slice(0, 7);
export const keyDate = (k: string) => new Date(`${k}T00:00:00Z`);
export const addDays = (k: string, n: number) =>
  new Date(keyDate(k).getTime() + n * DAY).toISOString().slice(0, 10);
export const diffDays = (a: string, b: string) =>
  Math.round((keyDate(a).getTime() - keyDate(b).getTime()) / DAY);
export const monthBounds = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return {
    start,
    end,
    startKey: start.toISOString().slice(0, 10),
    lastKey: new Date(end.getTime() - DAY).toISOString().slice(0, 10),
    days: Math.round((end.getTime() - start.getTime()) / DAY),
  };
};
export const periodLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};
const isRule = (r: unknown, t: string) =>
  !!r && typeof r === 'object' && (r as { type?: string }).type === t;

/**
 * Loads one People & Payroll dataset for the group (records keyed by the group root) and holds the
 * shared derivations every screen uses: scope, names, leave balances, the payroll inputs read from
 * Staff (attendance, timesheet approvals, commission rules, advances, manual line items), the
 * calculation engine, readiness and alerts. Nothing here invents a value — a missing input stays
 * missing and becomes a readiness blocker.
 */
@Injectable()
export class PpDataService {
  constructor(private readonly ctx: PpContextService) {}

  get db() {
    return this.ctx.db;
  }

  async load(a: PpActor, s: PpScope) {
    const rootId = a.rootId;
    const db = this.db;
    const [biz, group, cfg, members, profiles] = await Promise.all([
      this.ctx.business(rootId),
      this.ctx.branches(rootId),
      this.ctx.config(rootId),
      this.ctx.members(rootId, true),
      db.ppEmployee.findMany({ where: { businessId: rootId } }),
    ]);
    const tz = biz.timezone || 'UTC';
    const now = new Date();
    const today = dayKey(now, tz);
    const groupIds = group.map((g) => g.id);
    const bus = await db.businessUser.findMany({
      where: { businessId: { in: groupIds } },
      select: {
        id: true,
        userId: true,
        businessId: true,
        active: true,
        createdAt: true,
        updatedAt: true,
        commissionRule: true,
        hourlyRate: true,
      },
    });
    const buToUser = new Map(bus.map((b) => [b.id, b.userId]));
    const [
      jobs,
      cands,
      ints,
      offers,
      onbs,
      timeOff,
      rules,
      runs,
      cycles,
      reviews,
      courses,
      tas,
      ofbs,
    ] = await Promise.all([
      db.ppJob.findMany({
        where: { businessId: rootId },
        orderBy: { createdAt: 'asc' },
      }),
      db.ppCandidate.findMany({
        where: { businessId: rootId },
        orderBy: { appliedAt: 'asc' },
      }),
      db.ppInterview.findMany({
        where: { businessId: rootId },
        orderBy: { startsAt: 'asc' },
      }),
      db.ppOffer.findMany({
        where: { businessId: rootId },
        orderBy: { createdAt: 'asc' },
      }),
      db.ppOnboarding.findMany({
        where: { businessId: rootId },
        orderBy: { createdAt: 'asc' },
      }),
      db.timeOff.findMany({
        where: { businessId: { in: groupIds } },
        orderBy: { startsAt: 'desc' },
      }),
      db.ppRule.findMany({
        where: { businessId: rootId },
        orderBy: { createdAt: 'asc' },
      }),
      db.ppRun.findMany({
        where: { businessId: rootId },
        include: { lines: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.ppCycle.findMany({
        where: { businessId: rootId },
        orderBy: { startOn: 'desc' },
      }),
      db.ppReview.findMany({
        where: { businessId: rootId },
        orderBy: { createdAt: 'asc' },
      }),
      db.ppCourse.findMany({
        where: { businessId: rootId },
        orderBy: { createdAt: 'asc' },
      }),
      db.ppTraining.findMany({
        where: { businessId: rootId },
        orderBy: { dueOn: 'asc' },
      }),
      db.ppOffboarding.findMany({
        where: { businessId: rootId },
        orderBy: { lastDay: 'asc' },
      }),
    ]);
    const profByBu = new Map(profiles.map((p) => [p.businessUserId, p]));
    const emps: Emp[] = members.map((m) => {
      const p = m.buIds.map((b) => profByBu.get(b)).find(Boolean) ?? null;
      const rows = bus.filter((b) => b.userId === m.id);
      const main =
        rows.find((b) => b.id === (p?.businessUserId ?? m.buId)) ?? rows[0];
      const hourly = rows.map((b) => b.hourlyRate).find((x) => x != null);
      const commRule = rows.some(
        (b) =>
          isRule(b.commissionRule, 'percent') ||
          isRule(b.commissionRule, 'per_service'),
      );
      const basis =
        p?.payBasis ??
        (hourly != null ? 'Hourly' : commRule ? 'Commission only' : null);
      const rate =
        basis === 'Salaried'
          ? p?.monthlySalary != null
            ? num(p.monthlySalary)
            : null
          : basis === 'Hourly'
            ? hourly != null
              ? num(hourly)
              : null
            : basis === 'Commission only'
              ? 0
              : null;
      const ofb = ofbs.find(
        (o) => o.userId === m.id && o.status === 'Completed',
      );
      const active = rows.some((b) => b.active);
      const status = !active ? 'Exited' : (p?.status ?? 'Active');
      return {
        id: m.id,
        name: m.name,
        email: m.email,
        phone: m.phone,
        buId: main?.id ?? m.buId,
        buIds: m.buIds,
        branchId: main?.businessId ?? m.businessId,
        role: m.role,
        roleLabel: m.label,
        active,
        hasProfile: !!p,
        profileId: p?.id ?? null,
        version: p?.version ?? 0,
        dept: p?.department ?? '',
        title: p?.title ?? m.label,
        type: p?.employmentType ?? 'Full-time',
        mgr: p?.managerUserId ?? null,
        basis,
        rate,
        start: p?.startDate ?? main?.createdAt ?? new Date(),
        startSet: !!p?.startDate,
        probationEnd: p?.probationEnd ?? null,
        contractEnd: p?.contractEnd ?? null,
        status,
        inPayroll: p
          ? p.inPayroll && status !== 'Exited'
          : active && m.role !== 'owner',
        bankName: p?.bankName ?? null,
        bankMask: p?.bankAccountMask ?? null,
        bankTitle: p?.bankTitle ?? null,
        taxStatus: p?.taxStatus ?? null,
        taxMask: p?.taxIdMask ?? null,
        hasCommissionRule: commRule,
        exitedAt: !active ? (ofb?.lastDay ?? main?.updatedAt ?? null) : null,
      };
    });
    const leaves: Leave[] = timeOff
      .filter((t) => buToUser.has(t.staffUserId))
      .map((t) => {
        const sKey = dayKey(t.startsAt, tz);
        const eKey = dayKey(t.endsAt, tz);
        const days =
          t.days != null
            ? num(t.days)
            : t.partial
              ? 0.5
              : Math.max(1, diffDays(eKey, sKey) + 1);
        return {
          id: t.id,
          number: t.number ?? `LV-${t.id.slice(0, 6).toUpperCase()}`,
          uid: buToUser.get(t.staffUserId)!,
          buId: t.staffUserId,
          businessId: t.businessId,
          type: t.leaveType ?? '',
          s: t.startsAt,
          e: t.endsAt,
          sKey,
          eKey,
          days,
          partial: t.partial,
          status: t.status,
          reason: t.reason ?? '',
          emerg: t.emergency,
          apr: t.reviewedByUserId,
          rej: t.rejectReason,
          attachmentKey: t.attachmentKey,
          createdAt: t.createdAt,
        };
      });
    const fmt = new Fmt(biz.currency || 'PKR', tz);
    const meEmp = emps.find((e) => e.id === a.userId) ?? null;
    return {
      a,
      s,
      biz,
      group,
      cfg,
      tz,
      now,
      today,
      fmt,
      members,
      emps,
      me: meEmp,
      bus,
      jobs,
      cands,
      ints,
      offers,
      onbs,
      leaves,
      rules: rules.map((r) => this.rule(r, today)),
      runs,
      cycles,
      reviews,
      courses,
      tas,
      ofbs,
      period: today.slice(0, 7),
      memo: new Map<string, unknown>(),
    };
  }

  rule(r: Prisma.PpRuleGetPayload<object>, today: string): Rule {
    const versions = (r.versions as unknown as RuleVer[]) ?? [];
    const cur = this.ruleVer(versions, today);
    const anyFuture = versions.some((v) => v.from > today);
    const ended =
      versions.length > 0 &&
      versions.every((v) => v.to != null && v.to < today);
    return {
      id: r.id,
      number: r.number,
      name: r.name,
      type: r.type,
      cls: r.classification,
      pp: r.taxTreatment,
      method: r.method,
      elig: r.eligibility,
      fin: r.financeAccount,
      prov: r.provider,
      versions,
      assigned: (r.assigned as unknown as string[]) ?? [],
      status:
        r.status === 'Inactive' || ended
          ? 'Inactive'
          : cur
            ? 'Active'
            : anyFuture
              ? 'Scheduled'
              : 'Inactive',
    };
  }

  /** The rule version in force on day `k` (YYYY-MM-DD). */
  ruleVer(versions: RuleVer[], k: string) {
    return (
      [...versions]
        .sort((x, y) => y.ver - x.ver)
        .find((v) => v.from <= k && (v.to == null || v.to >= k)) ?? null
    );
  }

  // ── names & scope ───────────────────────────────────────────────────────

  emp(d: Data, id: string | null | undefined) {
    return id ? d.emps.find((e) => e.id === id) : undefined;
  }
  name(d: Data, id: string | null | undefined) {
    if (!id) return '—';
    return (
      this.emp(d, id)?.name ??
      d.members.find((m) => m.id === id)?.name ??
      'Former staff'
    );
  }
  brName(d: Data, id: string | null | undefined) {
    return d.group.find((g) => g.id === id)?.name ?? '—';
  }
  candName(d: Data, id: string | null | undefined) {
    return d.cands.find((c) => c.id === id)?.name ?? '—';
  }
  job(d: Data, id: string | null | undefined) {
    return d.jobs.find((j) => j.id === id);
  }
  /** A person the actor may see under their People scope and the header branch/department filters. */
  inScope(d: Data, uid: string, ignoreFilters = false) {
    const e = this.emp(d, uid);
    if (!e) return false;
    if (!ignoreFilters) {
      if (
        d.s.branch &&
        !(
          e.branchId === d.s.branch ||
          d.bus.some((b) => b.userId === uid && b.businessId === d.s.branch)
        )
      )
        return false;
      if (d.s.dept && e.dept !== d.s.dept) return false;
    }
    if (d.a.scope === 'org') return true;
    if (d.a.scope === 'team') return e.mgr === d.a.userId || uid === d.a.userId;
    return uid === d.a.userId;
  }
  staffV(d: Data) {
    return d.emps.filter((e) => e.status !== 'Exited' && this.inScope(d, e.id));
  }
  depts(d: Data) {
    return [
      ...new Set([
        ...d.cfg.payroll.departments,
        ...d.emps.map((e) => e.dept).filter(Boolean),
        ...d.jobs.map((j) => j.department),
      ]),
    ].sort();
  }
  off(d: Data, x: Date | null | undefined) {
    return x ? diffDays(dayKey(x, d.tz), d.today) : null;
  }
  offK(d: Data, k: string | null | undefined) {
    return k ? diffDays(k, d.today) : null;
  }
  dday(d: Data, x: Date | string | null | undefined) {
    if (!x) return '—';
    const k = typeof x === 'string' ? x : dayKey(x, d.tz);
    const n = diffDays(k, d.today);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    return keyDate(k).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      ...(Math.abs(n) > 200 ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  }
  money(d: Data, v: number | null | undefined, lock = false) {
    if (lock) return '🔒 Restricted';
    return d.fmt.money(v == null ? null : r2(v));
  }

  // ── leave ───────────────────────────────────────────────────────────────

  lt(d: Data, key: string): LeaveType | undefined {
    return d.cfg.leave.types.find((t) => t.key === key);
  }
  ltName(d: Data, key: string) {
    return this.lt(d, key)?.name ?? (key ? key : 'Time off (Staff)');
  }
  leaveYear(d: Data) {
    const m = Math.min(12, Math.max(1, d.cfg.leave.yearStartMonth || 1));
    const [y, mo] = d.today.split('-').map(Number);
    const yr = mo >= m ? y : y - 1;
    const start = `${yr}-${String(m).padStart(2, '0')}-01`;
    const end = `${yr + 1}-${String(m).padStart(2, '0')}-01`;
    return { start, end };
  }
  used(d: Data, uid: string, type: string) {
    const ly = this.leaveYear(d);
    return d.leaves
      .filter(
        (l) =>
          l.uid === uid &&
          l.type === type &&
          l.status === 'Approved' &&
          l.sKey >= ly.start &&
          l.sKey < ly.end,
      )
      .reduce((a, l) => a + l.days, 0);
  }
  bal(d: Data, uid: string, type: string): number | null {
    const t = this.lt(d, type);
    if (!t || t.entitlement == null) return null;
    return r2(t.entitlement - this.used(d, uid, type));
  }
  onLeave(d: Data, uid: string, k = d.today) {
    return d.leaves.find(
      (l) =>
        l.uid === uid && l.status === 'Approved' && l.sKey <= k && l.eKey >= k,
    );
  }
  /** Coverage conflicts for a leave window: same department + branch colleagues off, and real bookings. */
  async coverage(
    d: Data,
    l: { uid: string; sKey: string; eKey: string; buId?: string; id?: string },
  ) {
    const e = this.emp(d, l.uid);
    const out: string[] = [];
    if (!e) return out;
    if (e.dept) {
      const peers = d.emps.filter(
        (x) =>
          x.id !== e.id &&
          x.dept === e.dept &&
          x.branchId === e.branchId &&
          x.status !== 'Exited',
      );
      const off = peers.filter((p) =>
        d.leaves.some(
          (o) =>
            o.uid === p.id &&
            o.id !== l.id &&
            o.status === 'Approved' &&
            o.sKey <= l.eKey &&
            o.eKey >= l.sKey,
        ),
      );
      if (off.length)
        out.push(`${off.map((p) => p.name.split(' ')[0]).join(', ')} also off`);
      if (peers.length - off.length < 1)
        out.push(`No one else in ${e.dept} at ${this.brName(d, e.branchId)}`);
    }
    const from = new Date(`${l.sKey}T00:00:00Z`);
    const to = new Date(`${addDays(l.eKey, 1)}T00:00:00Z`);
    const [appts, shifts] = await Promise.all([
      this.db.appointment.count({
        where: {
          staffUserId: { in: e.buIds },
          startsAt: { gte: from, lt: to },
          status: {
            in: [AppointmentStatus.booked, AppointmentStatus.confirmed],
          },
        },
      }),
      this.db.staffShift.count({
        where: {
          staffUserId: { in: e.buIds },
          startsAt: { gte: from, lt: to },
        },
      }),
    ]);
    if (appts)
      out.push(`${appts} booking(s) assigned in this window (Bookings)`);
    if (shifts)
      out.push(`${shifts} scheduled shift(s) in this window (Staff schedule)`);
    return out;
  }

  // ── payroll inputs (read from Staff) ────────────────────────────────────

  payDate(d: Data, ym: string) {
    const b = monthBounds(ym);
    const pd = d.cfg.payroll.payDay;
    if (!pd || pd >= b.days) return b.lastKey;
    return `${ym}-${String(pd).padStart(2, '0')}`;
  }
  taxTable(d: Data): TaxTable | null {
    const T = d.cfg.tax.tables;
    return T.find((t) => t.key === d.cfg.tax.activeKey) ?? null;
  }
  payrollEmps(d: Data, ym: string) {
    const b = monthBounds(ym);
    return d.emps.filter(
      (e) =>
        e.inPayroll &&
        (e.status !== 'Exited' || (e.exitedAt && e.exitedAt >= b.start)) &&
        dayKey(e.start, d.tz) <= b.lastKey,
    );
  }

  /** Every payroll input for the period, read live from Staff, Leave and People records. */
  async inputs(
    d: Data,
    ym: string,
    uids?: string[],
  ): Promise<Map<string, Inp>> {
    const k = `inputs|${ym}|${uids?.join(',') ?? '*'}`;
    if (d.memo.has(k)) return d.memo.get(k) as Map<string, Inp>;
    const list = this.payrollEmps(d, ym).filter(
      (e) => !uids || uids.includes(e.id),
    );
    const b = monthBounds(ym);
    const buIds = list.flatMap((e) => e.buIds);
    const branchCfg = new Map(d.group.map((g) => [g.id, g]));
    const buBiz = new Map(d.bus.map((x) => [x.id, x.businessId]));
    const [att, approvals, orders, appts, advances, items, commPaid] =
      await Promise.all([
        this.db.attendance.findMany({
          where: {
            staffUserId: { in: buIds },
            checkIn: { gte: b.start, lt: b.end },
            checkOut: { not: null },
          },
          select: { staffUserId: true, checkIn: true, checkOut: true },
        }),
        this.db.timesheetApproval.findMany({
          where: {
            staffUserId: { in: buIds },
            month: ym,
            approvedAt: { not: null },
          },
          select: { staffUserId: true },
        }),
        this.db.order.groupBy({
          by: ['staffUserId'],
          where: {
            staffUserId: { in: buIds },
            status: OrderStatus.completed,
            isQuotation: false,
            createdAt: { gte: b.start, lt: b.end },
          },
          _sum: { total: true },
        }),
        this.db.appointment.findMany({
          where: {
            staffUserId: { in: buIds },
            status: AppointmentStatus.completed,
            startsAt: { gte: b.start, lt: b.end },
          },
          select: { staffUserId: true, serviceId: true },
        }),
        this.db.staffAdvance.findMany({
          where: {
            staffUserId: { in: buIds },
            status: StaffAdvanceStatus.outstanding,
          },
          orderBy: { createdAt: 'asc' },
          select: { id: true, staffUserId: true, amount: true },
        }),
        this.db.payrollLineItem.findMany({
          where: { staffUserId: { in: buIds }, month: ym },
          select: { staffUserId: true, label: true, amount: true, type: true },
        }),
        this.db.commissionPayment.findMany({
          where: { staffUserId: { in: buIds }, month: ym },
          select: { staffUserId: true, paidByUserId: true },
        }),
      ]);
    const runLocked = new Set(
      d.runs
        .filter(
          (r) =>
            r.period === ym &&
            !r.correctionOf &&
            r.status !== 'Cancelled' &&
            r.finalizedAt,
        )
        .flatMap((r) => r.lines.map((l) => l.userId)),
    );
    const out = new Map<string, Inp>();
    for (const e of list) {
      let hours = 0;
      let ot = 0;
      let otMult = 1.5;
      for (const bu of e.buIds) {
        const g = branchCfg.get(buBiz.get(bu) ?? '');
        const thr = g?.overtimeThresholdHoursPerWeek ?? 40;
        const bth = g?.breakThresholdHours ?? 6;
        const bh = (g?.breakMinutesPerShift ?? 0) / 60;
        if (g) otMult = num(g.overtimeRateMultiplier) || otMult;
        const weeks = new Map<number, number>();
        for (const r of att.filter((x) => x.staffUserId === bu)) {
          const raw = (r.checkOut!.getTime() - r.checkIn.getTime()) / 3600000;
          const h = raw > bth ? Math.max(0, raw - bh) : raw;
          hours += h;
          const wk = Math.floor(r.checkIn.getTime() / (7 * DAY));
          weeks.set(wk, (weeks.get(wk) ?? 0) + h);
        }
        for (const h of weeks.values()) ot += Math.max(0, h - thr);
      }
      const workedBus = e.buIds.filter((bu) =>
        att.some((x) => x.staffUserId === bu),
      );
      const tsNeeded = e.basis === 'Hourly' || ot > 0;
      const tsOk = workedBus.length
        ? workedBus.every((bu) => approvals.some((x) => x.staffUserId === bu))
        : e.buIds.some((bu) => approvals.some((x) => x.staffUserId === bu));
      let comm = 0;
      let commRule = false;
      for (const bu of e.buIds) {
        const rule = d.bus.find((x) => x.id === bu)?.commissionRule as
          Record<string, unknown> | undefined;
        if (isRule(rule, 'percent')) {
          commRule = true;
          comm +=
            num(orders.find((o) => o.staffUserId === bu)?._sum.total ?? 0) *
            (Number((rule as { value?: number }).value ?? 0) / 100);
        } else if (isRule(rule, 'per_service')) {
          commRule = true;
          const amounts =
            (rule as { amounts?: Record<string, number> }).amounts ?? {};
          comm += appts
            .filter((x) => x.staffUserId === bu)
            .reduce((a, x) => a + Number(amounts[x.serviceId] ?? 0), 0);
        }
      }
      const commPaidOutside =
        !runLocked.has(e.id) &&
        commPaid.some((c) => e.buIds.includes(c.staffUserId)) &&
        comm > 0;
      const unpaid = d.leaves
        .filter(
          (l) =>
            l.uid === e.id &&
            l.status === 'Approved' &&
            this.lt(d, l.type) &&
            !this.lt(d, l.type)!.paid &&
            l.eKey >= b.startKey &&
            l.sKey <= b.lastKey,
        )
        .reduce((a, l) => {
          if (l.partial) return a + 0.5;
          const s = l.sKey < b.startKey ? b.startKey : l.sKey;
          const en = l.eKey > b.lastKey ? b.lastKey : l.eKey;
          return a + Math.max(0, diffDays(en, s) + 1);
        }, 0);
      const startK = dayKey(e.start, d.tz);
      const endK = e.exitedAt ? dayKey(e.exitedAt, d.tz) : null;
      const from = startK > b.startKey ? startK : b.startKey;
      const to = endK && endK < b.lastKey ? endK : b.lastKey;
      const prorate =
        e.basis === 'Salaried'
          ? Math.max(0, Math.min(1, (diffDays(to, from) + 1) / b.days))
          : 1;
      const rules = d.rules
        .filter((r) => r.status !== 'Inactive' && r.assigned.includes(e.id))
        .map((r) => ({ r, v: this.ruleVer(r.versions, b.lastKey) }))
        .filter((x) => x.v)
        .map(({ r, v }) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          pp: r.pp,
          method: r.method,
          ver: v!.ver,
          ee: v!.ee,
          er: v!.er,
          fin: r.fin,
        }));
      out.set(e.id, {
        basis: e.basis,
        rate: e.rate,
        hours: r2(hours),
        ot: r2(ot),
        otMult,
        tsOk,
        tsNeeded,
        comm: commPaidOutside ? 0 : r2(comm),
        commPaidOutside,
        commRule,
        advances: advances
          .filter((x) => e.buIds.includes(x.staffUserId))
          .map((x) => ({ id: x.id, amount: num(x.amount) })),
        adds: items
          .filter((x) => e.buIds.includes(x.staffUserId) && x.type === 'add')
          .map((x) => ({ label: x.label, amount: num(x.amount) })),
        deds: items
          .filter((x) => e.buIds.includes(x.staffUserId) && x.type === 'deduct')
          .map((x) => ({ label: x.label, amount: num(x.amount) })),
        unpaid,
        prorate: r2(prorate * 10000) / 10000,
        taxp: e.taxStatus,
        bank: e.bankMask ? `${e.bankName ?? 'Bank'} ${e.bankMask}` : null,
        rules,
      });
    }
    d.memo.set(k, out);
    return out;
  }

  /** The payroll engine. Every figure is derived from the inputs and the configured rules/table. */
  calc(d: Data, i: Inp, table: TaxTable | null): Calc {
    const c = d.cfg.payroll;
    const warn: string[] = [];
    const lines: Calc['lines'] = [];
    const rate = i.rate ?? 0;
    const hr =
      i.basis === 'Hourly'
        ? rate
        : i.basis === 'Salaried'
          ? rate / (c.standardHours || 208)
          : 0;
    const regularHours = Math.max(0, i.hours - i.ot);
    const regular = r2(
      i.basis === 'Hourly'
        ? regularHours * rate
        : i.basis === 'Salaried'
          ? rate * i.prorate
          : 0,
    );
    const leaveImp =
      i.basis === 'Salaried' && i.unpaid
        ? -r2((i.unpaid * rate) / (c.workingDays || 26))
        : 0;
    const ot = r2(i.ot * hr * i.otMult);
    const bonus = r2(i.adds.reduce((a, x) => a + x.amount, 0));
    const base = i.basis === 'Salaried' ? rate : regular;
    const amt = (method: string, v: number | null) =>
      v == null
        ? 0
        : method.startsWith('Percentage')
          ? r2((base * v) / 100)
          : r2(v);
    let allow = 0;
    let pre = 0;
    let post = 0;
    let er = 0;
    for (const r of i.rules) {
      const ee = amt(r.method, r.ee);
      const erA = amt(r.method, r.er);
      const earning =
        r.type === 'Benefit (taxable)' || r.pp === 'Taxable earning';
      if (ee) {
        if (earning) allow += ee;
        else if (r.pp === 'Pre-tax') pre += ee;
        else post += ee;
        lines.push({
          name: `${r.name} v${r.ver}`,
          kind: earning
            ? 'earning'
            : r.pp === 'Pre-tax'
              ? 'pre-tax'
              : 'post-tax',
          amount: ee,
        });
      }
      if (erA) {
        er += erA;
        lines.push({
          name: `${r.name} v${r.ver} (employer)`,
          kind: 'employer',
          amount: erA,
        });
      }
    }
    const dedOther = r2(i.deds.reduce((a, x) => a + x.amount, 0));
    post += dedOther;
    const gross = r2(regular + leaveImp + ot + i.comm + bonus + allow);
    const taxable = r2(gross - pre);
    let tax: number | null = null;
    if (i.taxp === 'Exempt') tax = 0;
    else if (!i.taxp)
      warn.push('No tax profile — withholding cannot be calculated');
    else if (!table)
      warn.push('No tax table configured — withholding cannot be calculated');
    else tax = monthlyTax(table, taxable, i.taxp === 'Non-filer');
    let adv = 0;
    const advIds: string[] = [];
    if (tax != null) {
      let room = gross - pre - tax - post;
      for (const x of i.advances)
        if (x.amount <= room) {
          room -= x.amount;
          adv += x.amount;
          advIds.push(x.id);
        }
    }
    adv = r2(adv);
    const net = tax == null ? null : r2(gross - pre - tax - post - adv);
    if (net != null && net < 0) warn.push('Net pay is negative');
    if (i.basis == null || (i.basis !== 'Commission only' && !i.rate))
      warn.push('No pay rate');
    const m = (v: number) => d.fmt.money(r2(v));
    return {
      regular,
      leaveImp,
      ot,
      comm: i.comm,
      tips: null,
      bonus,
      allow: r2(allow),
      gross,
      pre: r2(pre),
      pf: r2(pre),
      tax,
      post: r2(post),
      adv,
      advIds,
      net,
      er: r2(er),
      cost: r2(gross + er),
      warn,
      lines,
      f: {
        regular:
          i.basis === 'Hourly'
            ? `${r2(regularHours)} h × ${m(rate)}`
            : i.basis === 'Salaried'
              ? `Monthly base ${m(rate)}${i.prorate < 1 ? ` × ${Math.round(i.prorate * 1000) / 10}% (part month)` : ''}`
              : 'Commission only',
        ot: i.ot ? `${i.ot} h × ${m(hr)} × ${i.otMult}` : '—',
        leave: i.unpaid
          ? `${i.unpaid} unpaid day(s) × base ÷ ${c.workingDays}`
          : '—',
        pf:
          lines
            .filter((x) => x.kind === 'pre-tax')
            .map((x) => x.name)
            .join(', ') || 'None',
        tax:
          i.taxp === 'Exempt'
            ? 'Exempt (payroll profile)'
            : !i.taxp
              ? 'Missing tax profile'
              : !table
                ? 'No tax table configured'
                : `${table.key} v${table.version} slab on ${m(taxable)} × 12${i.taxp === 'Non-filer' && table.nonFilerMultiplier !== 1 ? ` × ${table.nonFilerMultiplier} (non-filer)` : ''}`,
        comm: i.commPaidOutside
          ? 'Already marked paid in Staff for this month — not paid again'
          : i.commRule
            ? 'Staff commission rule'
            : 'No commission rule',
      },
      ver: ENGINE,
      taxVer: table ? `${table.key} v${table.version}` : 'no tax table',
      inp: i,
    };
  }

  hash(o: unknown) {
    return (
      'sha256:' +
      createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 16)
    );
  }

  async snapshot(d: Data, ym: string, uids?: string[]): Promise<Snapshot> {
    const inp = await this.inputs(d, ym, uids);
    const emps = [...inp.entries()].map(([uid, i]) => ({ uid, inp: i }));
    const vers = Object.fromEntries(
      d.rules.map((r) => [
        r.number,
        `v${this.ruleVer(r.versions, monthBounds(ym).lastKey)?.ver ?? '—'}`,
      ]),
    );
    const t = this.taxTable(d);
    return {
      at: d.now.toISOString(),
      hash: this.hash({ emps, vers }),
      engine: ENGINE,
      tax: t ? `${t.key} v${t.version}` : 'no tax table',
      period: ym,
      emps,
      vers,
    };
  }

  /** Readiness of the live inputs for a period (pp-core.js readiness). */
  async readiness(d: Data, ym = d.period): Promise<Ready[]> {
    const k = `ready|${ym}`;
    if (d.memo.has(k)) return d.memo.get(k) as Ready[];
    const inp = await this.inputs(d, ym);
    const E = [...inp.entries()];
    const table = this.taxTable(d);
    const c = d.cfg.payroll;
    const ids = (f: (i: Inp, uid: string) => boolean) =>
      E.filter(([uid, i]) => f(i, uid)).map(([uid]) => uid);
    const bl = (t: string, who: string[], src: string, note = ''): Ready => ({
      t,
      st: who.length ? 'Blocking' : 'Ready',
      n: who.length,
      who,
      note,
      src,
    });
    const wn = (t: string, who: string[], src: string, note = ''): Ready => ({
      t,
      st: who.length ? 'Warning' : 'Ready',
      n: who.length,
      who,
      note,
      src,
    });
    const b = monthBounds(ym);
    const pend = d.leaves
      .filter(
        (l) =>
          l.status === 'Submitted' &&
          inp.has(l.uid) &&
          l.sKey <= b.lastKey &&
          l.eKey >= b.startKey,
      )
      .map((l) => l.uid);
    const noProfile = d.emps
      .filter(
        (e) =>
          e.active &&
          e.role !== 'owner' &&
          !e.hasProfile &&
          !inp.has(e.id) &&
          e.basis == null,
      )
      .map((e) => e.id);
    const out: Ready[] = [
      bl(
        'Employee records',
        [...ids((_, uid) => !this.emp(d, uid)?.hasProfile), ...noProfile],
        'People & Payroll',
        'No payroll profile — pay basis, department and start date',
      ),
      bl(
        'Pay rates',
        ids(
          (i) => i.basis == null || (i.basis !== 'Commission only' && !i.rate),
        ),
        'Payroll profile',
      ),
      bl(
        'Timesheets (Staff)',
        ids((i) => i.tsNeeded && !i.tsOk),
        'Staff',
        'Timesheet for the month not approved in Staff',
      ),
      wn(
        'Overtime',
        ids((i) => i.ot > c.overtimeWarnHours),
        'Staff',
        `Above ${c.overtimeWarnHours} h policy`,
      ),
      wn(
        'Commissions (Staff)',
        ids((i) => i.commPaidOutside),
        'Staff',
        'Already marked paid in Staff — excluded from this run',
      ),
      {
        t: 'Tips',
        st: 'Not Tracked',
        n: 0,
        who: [],
        note: 'Noxtill doesn’t record tips — nothing is added',
        src: 'Staff',
      },
      wn(
        'Advances (Staff)',
        c.advanceWarnAmount
          ? ids(
              (i) =>
                i.advances.reduce((a, x) => a + x.amount, 0) >
                c.advanceWarnAmount!,
            )
          : [],
        'Staff',
      ),
      wn(
        'Leave',
        [...new Set(pend)],
        'Leave & PTO',
        'Requests in this period still awaiting a decision',
      ),
      {
        t: 'Benefits',
        st: 'Ready',
        n: d.rules.filter((r) => r.status === 'Active').length,
        who: [],
        note: `${d.rules.filter((r) => r.status === 'Active').length} active rule(s)`,
        src: 'People & Payroll',
      },
      wn(
        'Deductions',
        ids((i) => i.deds.length > 0),
        'Staff',
        'Manual deductions entered in Staff › Payroll',
      ),
      bl(
        'Tax profiles',
        table
          ? ids((i) => !i.taxp)
          : E.filter(([, i]) => i.taxp !== 'Exempt').map(([u]) => u),
        'Payroll profile',
        table
          ? 'Missing filer status'
          : 'No tax table configured in People settings',
      ),
      bl(
        'Payout / bank setup',
        ids((i) => !i.bank),
        'Payroll profile',
      ),
      {
        t: 'Approvals',
        st: 'Ready',
        n: d.runs.filter(
          (r) => r.period === ym && r.status === 'Approval Required',
        ).length,
        who: [],
        note: c.separationOfDuties
          ? 'Preparer can’t approve their own run (Owner override is audited)'
          : 'Separation of duties is off in settings',
        src: 'People & Payroll',
      },
    ];
    d.memo.set(k, out);
    return out;
  }

  runTot(lines: { calc: Prisma.JsonValue }[]) {
    const C = lines.map((l) => l.calc as unknown as Calc);
    const sum = (f: (c: Calc) => number | null) =>
      r2(C.reduce((a, c) => a + (f(c) ?? 0), 0));
    return {
      n: C.length,
      gross: sum((c) => c.gross),
      ded: sum((c) => c.pre + c.post + c.adv),
      tax: sum((c) => c.tax),
      er: sum((c) => c.er),
      cost: sum((c) => c.cost),
      net: sum((c) => c.net),
      comm: sum((c) => c.comm),
      adv: sum((c) => c.adv),
      pre: sum((c) => c.pre + c.post),
    };
  }

  /** The run for the current period that isn't a correction (pp-core.js PR-YYYY-MM). */
  curRun(d: Data, ym = d.period) {
    return [...d.runs]
      .reverse()
      .find(
        (r) => r.period === ym && !r.correctionOf && r.status !== 'Cancelled',
      );
  }

  // ── alerts (pp-core.js alerts) ──────────────────────────────────────────

  async alerts(d: Data) {
    if (d.memo.has('alerts')) return d.memo.get('alerts') as Alert[];
    const a = d.a;
    const out: Alert[] = [];
    const A = (
      sev: string,
      t: string,
      who: string | null,
      act: string,
      go: string,
      ref?: string,
    ) =>
      out.push({
        id: `${go}:${ref ?? who ?? ''}:${out.length}`,
        sev,
        t,
        who,
        act,
        go,
        ref: ref ?? who ?? '',
      });
    if (a.payroll || a.owner) {
      const rd = await this.readiness(d);
      rd.filter((x) => x.st === 'Blocking').forEach((x) =>
        A(
          'High',
          `Payroll blocked — ${x.t}: ${
            x.who
              .filter((w) => w !== '—')
              .map((s) => this.name(d, s))
              .join(', ') || x.note
          }`,
          x.who[0] && x.who[0] !== '—' ? x.who[0] : null,
          'Resolve input',
          'payroll',
          x.t,
        ),
      );
    }
    d.leaves
      .filter(
        (l) =>
          l.status === 'Submitted' &&
          this.inScope(d, l.uid) &&
          (a.leaveApprove || l.uid === a.userId),
      )
      .forEach((l) =>
        A(
          (this.offK(d, l.sKey) ?? 9) <= 2 ? 'High' : 'Medium',
          `Leave request awaiting approval (${this.dday(d, l.sKey)})`,
          l.uid,
          'Review leave',
          'leave',
          l.id,
        ),
      );
    if (a.recruit)
      d.offers
        .filter(
          (o) =>
            ['Sent', 'Viewed', 'Signature Requested'].includes(o.status) &&
            (this.off(d, o.expiresOn) ?? 99) <= 7,
        )
        .forEach((o) =>
          A(
            'Medium',
            `Offer expires ${this.dday(d, o.expiresOn)} — no response yet`,
            null,
            'Open offer',
            'offers',
            o.id,
          ),
        );
    d.tas
      .filter((t) => this.inScope(d, t.userId))
      .forEach((t) => {
        const st = this.taStatus(d, t);
        const ce = this.off(d, t.certExpires);
        if (st === 'Overdue')
          A(
            'Medium',
            `Mandatory training overdue — ${this.course(d, t.courseId)?.name ?? 'course'}`,
            t.userId,
            'Open training',
            'training',
            t.id,
          );
        else if (ce != null && ce <= 30)
          A(
            'Low',
            `Certificate expires ${this.dday(d, t.certExpires)} — ${this.course(d, t.courseId)?.name ?? 'course'}`,
            t.userId,
            'Open training',
            'training',
            t.id,
          );
      });
    if (a.offboard || a.owner)
      d.ofbs
        .filter((o) => o.status !== 'Completed')
        .forEach((o) =>
          A(
            'Medium',
            `Exit on ${this.dday(d, o.lastDay)} — ${this.ofbItems(o).filter((i) => !i.done && i.mand).length} mandatory item(s) open`,
            o.userId,
            'Open offboarding',
            'offboarding',
            o.id,
          ),
        );
    d.onbs
      .filter(
        (o) =>
          o.status !== 'Completed' &&
          (a.onboard || (o.userId && this.inScope(d, o.userId))),
      )
      .forEach((o) => {
        const late = this.onbItems(o).filter(
          (i) =>
            !i.done &&
            diffDays(addDays(dayKey(o.startDate, 'UTC'), i.off), d.today) < 0,
        );
        if (late.length)
          A(
            'Medium',
            `Onboarding overdue: ${late.map((i) => i.t).join(', ')}`,
            o.userId,
            'Open onboarding',
            'onboarding',
            o.id,
          );
      });
    d.ints
      .filter(
        (i) =>
          this.fbOver(d, i) && (a.recruit || this.ivs(i).includes(a.userId)),
      )
      .forEach((i) =>
        A(
          'Low',
          `Interview feedback overdue — ${this.ivs(i)
            .filter((v) => !this.sc(i)[v])
            .map((v) => this.name(d, v))
            .join(', ')}`,
          null,
          'Open interview',
          'interviews',
          i.id,
        ),
      );
    if (a.perf || a.owner)
      d.emps
        .filter(
          (e) =>
            e.status === 'Probation' && e.probationEnd && this.inScope(d, e.id),
        )
        .forEach((e) => {
          const left = this.off(d, e.probationEnd)!;
          if (left <= 30)
            A(
              'Low',
              `Probation review due (${left} days left)`,
              e.id,
              'Open performance',
              'performance',
            );
        });
    const rk: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
    const res = out
      .filter((x) => !x.who || this.inScope(d, x.who))
      .sort((x, y) => rk[x.sev] - rk[y.sev]);
    d.memo.set('alerts', res);
    return res;
  }

  // ── record helpers ──────────────────────────────────────────────────────

  course(d: Data, id: string) {
    return d.courses.find((c) => c.id === id);
  }
  taStatus(d: Data, t: Data['tas'][number]) {
    if (
      ['Assigned', 'In Progress'].includes(t.status) &&
      (this.off(d, t.dueOn) ?? 0) < 0
    )
      return 'Overdue';
    return t.status;
  }
  ivs(i: Data['ints'][number]) {
    return (i.interviewers as unknown as string[]) ?? [];
  }
  sc(i: Data['ints'][number]) {
    return (
      (i.scorecards as unknown as Record<
        string,
        { r: number[]; rec: string; note: string; ver: number; at: string }
      >) ?? {}
    );
  }
  fbOver(d: Data, i: Data['ints'][number]) {
    return (
      i.status === 'Completed' &&
      i.feedbackDue != null &&
      i.feedbackDue < d.now &&
      this.ivs(i).some((v) => !this.sc(i)[v])
    );
  }
  onbItems(o: Data['onbs'][number]) {
    return (o.items as unknown as OnbItem[]) ?? [];
  }
  ofbItems(o: Data['ofbs'][number]) {
    return (o.items as unknown as OfbItem[]) ?? [];
  }
  runHist(r: Data['runs'][number]) {
    return (
      (r.history as unknown as { t: string; by: string; at: string }[]) ?? []
    );
  }
  runExc(r: Data['runs'][number]) {
    return (r.exceptions as unknown as RunExc[]) ?? [];
  }
  candHist(c: Data['cands'][number]) {
    return (
      (c.history as unknown as { t: string; at: string; by?: string }[]) ?? []
    );
  }
  offerVers(o: Data['offers'][number]) {
    return (
      (o.versions as unknown as {
        ver: number;
        comp: number;
        st: string;
        at: string;
      }[]) ?? []
    );
  }
  goals(r: Data['reviews'][number]) {
    return (r.goals as unknown as { t: string; w: number; p: number }[]) ?? [];
  }
  payoutSt(r: Data['runs'][number]) {
    const v = r.lines.map((l) => l.payout);
    if (!v.length || v.every((x) => x === 'Pending')) return '—';
    if (v.every((x) => x === 'Paid')) return 'Paid';
    if (v.some((x) => x === 'Failed'))
      return v.some((x) => x === 'Paid') ? 'Partially Paid' : 'Payout Failed';
    return v.some((x) => x === 'Paid') ? 'Partially Paid' : 'Processing';
  }
}

export interface Alert {
  id: string;
  sev: string;
  t: string;
  who: string | null;
  act: string;
  go: string;
  ref: string;
}
export interface OnbItem {
  ms: string;
  t: string;
  owner: string;
  off: number;
  done: boolean;
  mand: boolean;
  kind: string;
  ref: string | null;
  task: string | null;
  taskId?: string | null;
  ovr: string | null;
  doneAt?: string | null;
}
export interface OfbItem {
  t: string;
  kind: string;
  ref: string | null;
  done: boolean;
  mand: boolean;
  owner: string;
  verified?: boolean;
  ovr: string | null;
  task?: string | null;
  taskId?: string | null;
  doneAt?: string | null;
}

export type Data = Awaited<ReturnType<PpDataService['load']>>;
