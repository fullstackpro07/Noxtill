import { Injectable } from '@nestjs/common';
import type {
  AmAsset,
  AmCategory,
  AmCustomField,
  AmDocument,
  AmDowntime,
  AmEvent,
  AmLocation,
  AmPmTemplate,
  AmReading,
  Prisma,
} from '@prisma/client';
import { Fmt } from '../payments/pay-vm';
import { AmActor, AmContextService, num } from './am-context.service';
import {
  AmConfig,
  DONE_WO,
  FINAL_ASSET,
  HEALTH,
  OPEN_REQ,
} from './am.constants';

export interface AmScope {
  tab: string;
  /** Branch (Business id) filter; '' = all the person may see. */
  branch: string;
  /** Period in days for downtime / cost windows: 30 | 90 | 365. */
  period: number;
  /** Per-block filters, e.g. f.reg = { q, st, cond, ... }. */
  f: Record<string, Record<string, string>>;
  page: Record<string, number>;
  /** Segment picks, e.g. seg.ovDue = 'Overdue', seg.reg = 'dates', seg.d = 'meter'. */
  seg: Record<string, string>;
  /** Current asset id (detail screen). */
  cur: string;
  sec: string;
  sort: string;
  arch: boolean;
  techAll: boolean;
}

export function parseScope(q: Record<string, unknown>): AmScope {
  const j = (v: unknown) => {
    try {
      return typeof v === 'string' && v
        ? (JSON.parse(v) as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  };
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
  const period = Number(q.period ?? 90);
  return {
    tab: str(q.tab, 'overview'),
    branch: str(q.branch, ''),
    period: [30, 90, 365].includes(period) ? period : 90,
    f: j(q.f) as Record<string, Record<string, string>>,
    page: j(q.page) as Record<string, number>,
    seg: j(q.seg) as Record<string, string>,
    cur: str(q.cur, ''),
    sec: str(q.sec, 'numbering'),
    sort: str(q.sort, 'num'),
    arch: q.arch === '1' || q.arch === 'true',
    techAll: q.techAll === '1' || q.techAll === 'true',
  };
}

const woInclude = {
  checklist: { orderBy: { seq: 'asc' } },
  parts: { include: { moves: { orderBy: { createdAt: 'asc' } } } },
  labor: { orderBy: { createdAt: 'asc' } },
  costs: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.AmWorkOrderInclude;
const planInclude = {
  instances: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.AmPmPlanInclude;

export type AAsset = AmAsset;
export type AWo = Prisma.AmWorkOrderGetPayload<{ include: typeof woInclude }>;
export type APlan = Prisma.AmPmPlanGetPayload<{ include: typeof planInclude }>;
export type AReq = Prisma.AmRequestGetPayload<{ include: { notes: true } }>;
export type ADown = AmDowntime;
export type AEvent = AmEvent;
export type AReading = AmReading;

export interface Health {
  score: number | null;
  band: 'Healthy' | 'Attention Needed' | 'Critical' | 'Unknown';
  factors: [string, number][];
}
export interface Metrics {
  /** Unplanned / planned downtime hours in the period. */
  uh: number;
  ph: number;
  /** Unplanned failures in the period. */
  f: number;
  avail: number;
  mtbf: number | null;
  mttr: number | null;
  events: ADown[];
}

/** Everything one screen / drawer reads, loaded once and scoped to the person and branch filter. */
export interface Data {
  a: AmActor;
  s: AmScope;
  cfg: AmConfig;
  fmt: Fmt;
  now: Date;
  group: { id: string; name: string; parentId: string | null }[];
  /** Every asset in the group (lookups), and the ones in scope (lists / KPIs). */
  all: AAsset[];
  assets: AAsset[];
  ids: Set<string>;
  cats: AmCategory[];
  locs: AmLocation[];
  teams: Prisma.AmTeamGetPayload<{ include: { members: true } }>[];
  templates: AmPmTemplate[];
  cfields: AmCustomField[];
  readings: AReading[];
  requests: AReq[];
  wos: AWo[];
  plans: APlan[];
  events: AEvent[];
  down: ADown[];
  docs: AmDocument[];
  products: Map<
    string,
    {
      id: string;
      name: string;
      stock: number;
      cost: number;
      businessId: string;
    }
  >;
  customers: Map<string, string>;
  names: Map<string, string>;
  people: {
    id: string;
    name: string;
    role: string;
    label: string;
    rate: number | null;
  }[];
  suppliers: { id: string; name: string }[];
  finAssets: Map<
    string,
    { id: string; number: string; name: string; cost: number; status: string }
  >;
  dismissed: Set<string>;
}

const H = 3600_000;

@Injectable()
export class AmDataService {
  constructor(private readonly ctx: AmContextService) {}

  private get db() {
    return this.ctx.db;
  }

  async load(a: AmActor, s: AmScope): Promise<Data> {
    const rootId = a.rootId;
    const [cfg, biz, nm] = await Promise.all([
      this.ctx.config(rootId),
      this.ctx.business(rootId),
      this.ctx.names(rootId),
    ]);
    const where = { businessId: rootId };
    const [
      all,
      cats,
      locs,
      templates,
      cfields,
      readings,
      requests,
      wos,
      plans,
      events,
      down,
      docs,
      dismissed,
    ] = await Promise.all([
      this.db.amAsset.findMany({ where, orderBy: { number: 'asc' } }),
      this.db.amCategory.findMany({ where, orderBy: [{ name: 'asc' }] }),
      this.db.amLocation.findMany({ where, orderBy: [{ code: 'asc' }] }),
      this.db.amPmTemplate.findMany({ where, orderBy: { name: 'asc' } }),
      this.db.amCustomField.findMany({ where, orderBy: { name: 'asc' } }),
      this.db.amReading.findMany({
        where,
        orderBy: [{ takenAt: 'asc' }, { createdAt: 'asc' }],
      }),
      this.db.amRequest.findMany({
        where,
        include: { notes: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.db.amWorkOrder.findMany({
        where,
        include: woInclude,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.amPmPlan.findMany({
        where,
        include: planInclude,
        orderBy: { createdAt: 'asc' },
      }),
      this.db.amEvent.findMany({ where, orderBy: { occurredAt: 'desc' } }),
      this.db.amDowntime.findMany({ where, orderBy: { startAt: 'desc' } }),
      this.db.amDocument.findMany({ where, orderBy: { createdAt: 'desc' } }),
      this.db.amInsightDismissal.findMany({ where, select: { key: true } }),
    ]);
    // Branch scope: the person's branches (if limited) and the header branch filter.
    const allowed = a.branches;
    const inScope = (x: AAsset) =>
      (!allowed || (x.branchId != null && allowed.includes(x.branchId))) &&
      (!s.branch || x.branchId === s.branch);
    const assets = all.filter(inScope);
    const ids = new Set(assets.map((x) => x.id));
    // Parts and their Inventory products.
    const productIds = [
      ...new Set([
        ...wos.flatMap((w) => w.parts.map((p) => p.productId)),
        ...all.map((x) => x.productId).filter((x): x is string => !!x),
      ]),
    ];
    const prods = productIds.length
      ? await this.db.product.findMany({
          where: { id: { in: productIds } },
          select: {
            id: true,
            name: true,
            stockQty: true,
            costPrice: true,
            businessId: true,
          },
        })
      : [];
    const custIds = [
      ...new Set(all.map((x) => x.customerId).filter((x): x is string => !!x)),
    ];
    const custs = custIds.length
      ? await this.db.customer.findMany({
          where: { id: { in: custIds } },
          select: { id: true, name: true, phone: true },
        })
      : [];
    const finIds = [
      ...new Set(all.map((x) => x.finAssetId).filter((x): x is string => !!x)),
    ];
    const fins = finIds.length
      ? await this.db.finAsset.findMany({
          where: { id: { in: finIds }, businessId: rootId },
          select: {
            id: true,
            number: true,
            name: true,
            cost: true,
            status: true,
          },
        })
      : [];
    return {
      a,
      s,
      cfg,
      fmt: new Fmt(biz.currency, biz.timezone || 'UTC'),
      now: new Date(),
      group: nm.group,
      all,
      assets,
      ids,
      cats,
      locs,
      teams: nm.teams,
      templates,
      cfields,
      readings,
      requests,
      wos,
      plans,
      events,
      down,
      docs,
      products: new Map(
        prods.map((p) => [
          p.id,
          {
            id: p.id,
            name: p.name,
            stock: p.stockQty,
            cost: num(p.costPrice),
            businessId: p.businessId,
          },
        ]),
      ),
      customers: new Map(custs.map((c) => [c.id, c.name || c.phone])),
      names: nm.map,
      people: nm.people,
      suppliers: nm.suppliers,
      finAssets: new Map(
        fins.map((f) => [
          f.id,
          {
            id: f.id,
            number: f.number,
            name: f.name,
            cost: num(f.cost),
            status: f.status,
          },
        ]),
      ),
      dismissed: new Set(dismissed.map((x) => x.key)),
    };
  }

  // ── lookups ─────────────────────────────────────────────────────────────

  A(d: Data, id: string | null | undefined) {
    return id ? d.all.find((x) => x.id === id) : undefined;
  }
  catName(d: Data, id: string | null | undefined) {
    return d.cats.find((c) => c.id === id)?.name ?? '—';
  }
  loc(d: Data, id: string | null | undefined) {
    return id ? d.locs.find((l) => l.id === id) : undefined;
  }
  branchName(d: Data, id: string | null | undefined) {
    return d.group.find((g) => g.id === id)?.name ?? '—';
  }
  /** Branch › Site › Floor › Room. */
  locPath(d: Data, locId: string | null | undefined, branchId?: string | null) {
    const out: string[] = [];
    let l = this.loc(d, locId);
    const br = l?.branchId ?? branchId;
    let guard = 0;
    while (l && guard++ < 20) {
      out.unshift(l.name);
      l = this.loc(d, l.parentId);
    }
    if (br) out.unshift(this.branchName(d, br));
    return out.join(' › ') || 'Unassigned';
  }
  locShort(d: Data, x: AAsset) {
    const l = this.loc(d, x.locationId);
    if (!x.branchId && !l) return 'Unassigned';
    return `${this.branchName(d, l?.branchId ?? x.branchId)}${l ? ` › ${l.name}` : ''}`;
  }
  person(d: Data, id: string | null | undefined) {
    if (!id) return '—';
    if (id === 'System') return 'System';
    return d.names.get(id) ?? '—';
  }
  assignee(
    d: Data,
    x: {
      assigneeUserId: string | null;
      teamId: string | null;
      supplierId: string | null;
    },
  ) {
    if (x.supplierId) return this.person(d, x.supplierId);
    if (x.assigneeUserId) return this.person(d, x.assigneeUserId);
    if (x.teamId) return this.person(d, x.teamId);
    return 'Unassigned';
  }
  ownerLabel(d: Data, x: AAsset) {
    if (x.ownerType === 'Customer-owned')
      return `Customer · ${x.customerId ? (d.customers.get(x.customerId) ?? '—') : '—'}`;
    if (x.ownerType === 'Business-owned') return 'Business';
    return x.ownerType;
  }
  tplName(d: Data, id: string | null | undefined) {
    return d.templates.find((t) => t.id === id)?.name ?? '—';
  }
  unit(x: AAsset) {
    return x.meterUnit ?? '';
  }

  // ── meters ──────────────────────────────────────────────────────────────

  readingsOf(d: Data, assetId: string) {
    return d.readings.filter((r) => r.assetId === assetId);
  }
  /** Readings minus the ones a correction superseded (originals stay in history). */
  effReadings(d: Data, assetId: string) {
    const rs = this.readingsOf(d, assetId);
    const corrected = new Set(
      rs.filter((r) => r.correctionOfId).map((r) => r.correctionOfId),
    );
    return rs.filter((r) => !corrected.has(r.id));
  }
  meterNow(d: Data, assetId: string) {
    const r = this.effReadings(d, assetId);
    return r.length ? r[r.length - 1] : null;
  }

  // ── maintenance links ─────────────────────────────────────────────────

  openReqs(d: Data, assetId: string) {
    return d.requests.filter(
      (r) => r.assetId === assetId && OPEN_REQ.includes(r.status),
    );
  }
  openWOs(d: Data, assetId?: string) {
    return d.wos.filter(
      (w) => (!assetId || w.assetId === assetId) && !DONE_WO.includes(w.status),
    );
  }
  plansOf(d: Data, assetId: string) {
    return d.plans.filter((p) => p.assetId === assetId);
  }
  /** Days until the plan is due; meter plans already past their meter count as due today. */
  dueDay(d: Data, p: APlan): number | null {
    const byDate = p.nextDueOn ? d.fmt.daysFrom(p.nextDueOn) : null;
    if (p.trigger !== 'Time' && p.nextDueMeter != null) {
      const m = this.meterNow(d, p.assetId);
      if (m && num(m.value) >= num(p.nextDueMeter))
        return byDate == null ? 0 : Math.min(byDate, 0);
    }
    return byDate;
  }
  isOverdue(d: Data, p: APlan) {
    const n = this.dueDay(d, p);
    return p.status === 'Active' && n != null && n < 0;
  }
  nextDue(d: Data, assetId: string) {
    return (
      this.plansOf(d, assetId)
        .filter((p) => p.status === 'Active' && this.dueDay(d, p) != null)
        .sort((x, y) => this.dueDay(d, x)! - this.dueDay(d, y)!)[0] ?? null
    );
  }
  /** Past its due date (business timezone), not completed. */
  woOverdue(d: Data, w: AWo) {
    return !DONE_WO.includes(w.status) && d.fmt.daysFrom(w.dueAt) < 0;
  }
  woCost(w: AWo) {
    return w.costs.reduce((s, c) => s + num(c.amount), 0);
  }
  isDown(d: Data, assetId: string) {
    return d.down.some((x) => x.assetId === assetId && !x.endAt);
  }
  lastService(d: Data, assetId: string) {
    return d.events.find(
      (e) =>
        e.assetId === assetId &&
        ['Maintenance', 'Repair', 'Calibration', 'Warranty Service'].includes(
          e.type,
        ),
    );
  }

  // ── downtime math (hours) ─────────────────────────────────────────────

  dEnd(d: Data, x: ADown) {
    return (x.endAt ?? d.now).getTime();
  }
  /** Hours of x, clipped to start no earlier than `from` (ms). */
  dHours(d: Data, x: ADown, from?: number) {
    const s = Math.max(x.startAt.getTime(), from ?? -Infinity);
    return Math.max(0, (this.dEnd(d, x) - s) / H);
  }
  periodStart(d: Data) {
    return d.now.getTime() - d.s.period * 86400000;
  }
  inPeriod(d: Data, x: ADown) {
    return this.dEnd(d, x) > this.periodStart(d);
  }
  downIn(d: Data, assetId: string | null, kind?: string) {
    return d.down.filter(
      (x) =>
        (!assetId || x.assetId === assetId) &&
        (!kind || x.kind === kind) &&
        this.inPeriod(d, x),
    );
  }
  /** Availability, MTBF (≥2 failures), MTTR (≥1 failure) for one asset over the period. */
  metrics(d: Data, assetId: string): Metrics {
    const P0 = this.periodStart(d);
    const Hh = d.s.period * 24;
    const un = this.downIn(d, assetId, 'Unplanned');
    const pl = this.downIn(d, assetId, 'Planned');
    const uh = un.reduce((s, x) => s + this.dHours(d, x, P0), 0);
    const ph = pl.reduce((s, x) => s + this.dHours(d, x, P0), 0);
    const f = un.length;
    const avail = Hh - ph > 0 ? ((Hh - ph - uh) / (Hh - ph)) * 100 : 100;
    return {
      uh,
      ph,
      f,
      avail,
      mtbf: f >= 2 ? (Hh - ph - uh) / f : null,
      mttr: f >= 1 ? uh / f : null,
      events: [...un, ...pl],
    };
  }
  fmtH(h: number | null) {
    if (h == null || !Number.isFinite(h)) return '—';
    return h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`;
  }

  // ── transparent health score ──────────────────────────────────────────

  health(d: Data, x: AAsset): Health {
    const cs = d.cfg.condition.find((c) => c[0] === x.condition)?.[1];
    if (cs == null)
      return {
        score: null,
        band: 'Unknown',
        factors: [
          [
            'Condition is Unknown — record an inspection to score this asset',
            0,
          ],
        ],
      };
    const F: [string, number][] = [[`Condition: ${x.condition}`, cs]];
    const rq = this.openReqs(d, x.id).filter((r) =>
      ['Critical', 'High'].includes(r.priority),
    );
    if (rq.length)
      F.push([
        `${rq.length} open high/critical request(s)`,
        HEALTH.openHighReq * rq.length,
      ]);
    const od = this.plansOf(d, x.id).filter((p) => this.isOverdue(d, p));
    if (od.length)
      F.push([`${od.length} overdue PM plan(s)`, HEALTH.overduePm * od.length]);
    const since90 = d.now.getTime() - 90 * 86400000;
    const fl = d.down.filter(
      (z) =>
        z.assetId === x.id &&
        z.kind === 'Unplanned' &&
        z.startAt.getTime() > since90,
    ).length;
    if (fl) F.push([`${fl} failure(s) in 90 days`, HEALTH.failure90 * fl]);
    if (this.isDown(d, x.id)) F.push(['Currently down', HEALTH.down]);
    const since30 = d.now.getTime() - 30 * 86400000;
    const insp = d.events.filter(
      (e) =>
        e.assetId === x.id &&
        e.type === 'Inspection' &&
        e.result === 'Fail' &&
        e.occurredAt.getTime() > since30,
    ).length;
    if (insp)
      F.push([
        `${insp} failed inspection(s) in 30 days`,
        HEALTH.failedInsp30 * insp,
      ]);
    const score = Math.max(
      0,
      Math.min(
        100,
        F.reduce((s, f) => s + f[1], 0),
      ),
    );
    return {
      score,
      band:
        score >= 75 ? 'Healthy' : score >= 50 ? 'Attention Needed' : 'Critical',
      factors: F,
    };
  }

  /** [label, colour, band] for the warranty. */
  wty(d: Data, x: AAsset): [string, string, string | null] {
    if (!x.warrantyEnd) return ['No warranty', '#475467', null];
    const n = d.fmt.daysFrom(x.warrantyEnd);
    const day = d.fmt.day(x.warrantyEnd);
    if (n < 0) return [`Expired ${day}`, '#667085', 'expired'];
    if (n <= 30) return [`Expires ${day}`, '#B42318', '30'];
    if (n <= 90) return [`Expires ${day}`, '#B54708', n <= 60 ? '60' : '90'];
    return [`Until ${day}`, '#0E8442', null];
  }
  wtyDays(d: Data, x: AAsset) {
    return x.warrantyEnd ? d.fmt.daysFrom(x.warrantyEnd) : null;
  }

  live(x: AAsset) {
    return !FINAL_ASSET.includes(x.status);
  }
}
