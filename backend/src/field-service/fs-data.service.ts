import { Injectable } from '@nestjs/common';
import type {
  AmAsset,
  FsAgreement,
  FsApproval,
  FsInspection,
  FsLabor,
  FsRequest,
  FsServiceType,
  FsSite,
  FsTemplate,
  FsWarranty,
  Prisma,
} from '@prisma/client';
import { Fmt } from '../payments/pay-vm';
import { FsActor, FsContextService, num } from './fs-context.service';
import { DONE, FsConfig, OPEN } from './fs.constants';
import { dayKey, dayOffset, hh, hourOf, keyPlus, mins, zoned } from './fs-time';

export interface FsScope {
  tab: string;
  /** Header territory filter ('' = all). */
  zone: string;
  f: Record<string, Record<string, string>>;
  page: Record<string, number>;
  /** View picks: woCols, calView, wTab, insView. */
  view: Record<string, string>;
  /** Current work order id (detail screen). */
  cur: string;
  sec: string;
  /** Dispatch / calendar day offset. */
  dDay: number;
  /** Technician preview on the workspace (dispatchers and managers). */
  techView: string;
}

export function parseFsScope(q: Record<string, unknown>): FsScope {
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
  const day = Number(q.dDay ?? 0);
  return {
    tab: str(q.tab, 'overview'),
    zone: str(q.zone, ''),
    f: j(q.f) as Record<string, Record<string, string>>,
    page: j(q.page) as Record<string, number>,
    view: j(q.view) as Record<string, string>,
    cur: str(q.cur, ''),
    sec: str(q.sec, 'services'),
    dDay: Number.isFinite(day)
      ? Math.max(-31, Math.min(62, Math.round(day)))
      : 0,
    techView: str(q.techView, ''),
  };
}

const woInclude = {
  parts: { include: { moves: { orderBy: { createdAt: 'asc' } } } },
} satisfies Prisma.FsWorkOrderInclude;
export type W = Prisma.FsWorkOrderGetPayload<{ include: typeof woInclude }>;
export type WPart = W['parts'][number];
export type Plan = Prisma.FsPlanGetPayload<{ include: { instances: true } }>;

export interface Tech {
  /** User id (Staff). */
  id: string;
  profileId: string;
  name: string;
  buIds: string[];
  skills: string[];
  certs: string[];
  zones: string[];
  track: boolean;
  manual: string | null;
  lastZone: string | null;
  lastZoneAt: Date | null;
  defShift: [number, number];
  rate: number | null;
}

export interface Elig {
  blocks: string[];
  warns: string[];
  tr: number | null;
  ot: boolean;
  from: string | null;
  load: number;
  comps: [string, number, number][];
  score: number;
}

/** Everything one screen or drawer reads, loaded once per request. */
export interface Data {
  a: FsActor;
  s: FsScope;
  cfg: FsConfig;
  fmt: Fmt;
  tz: string;
  now: Date;
  /** Business-clock hour now (decimal). */
  nowH: number;
  biz: { id: string; name: string; currency: string; timezone: string };
  group: { id: string; name: string; parentId: string | null }[];
  svc: Map<string, FsServiceType>;
  svcList: FsServiceType[];
  templates: FsTemplate[];
  techs: Tech[];
  people: { id: string; name: string; label: string; rate: number | null }[];
  names: Map<string, string>;
  customers: Map<
    string,
    {
      id: string;
      name: string;
      phone: string;
      email: string | null;
      address: string | null;
      businessId: string;
    }
  >;
  sites: Map<string, FsSite>;
  siteList: FsSite[];
  assets: Map<string, AmAsset>;
  equipment: AmAsset[];
  eqSite: Map<string, string>;
  catNames: Map<string, string>;
  meters: Map<string, number>;
  requests: FsRequest[];
  wos: W[];
  labor: FsLabor[];
  inspections: FsInspection[];
  plans: Plan[];
  agreements: FsAgreement[];
  /** Contracts (Contracts module) agreements may reference — label + status only. */
  contracts: Map<
    string,
    { number: string; title: string; status: string; cpId: string }
  >;
  warranty: FsWarranty[];
  approvals: FsApproval[];
  files: Map<string, { stage: string; n: number }[]>;
  products: Map<
    string,
    {
      id: string;
      name: string;
      sku: string | null;
      stock: number;
      cost: number;
      price: number;
      businessId: string;
    }
  >;
  orders: Map<
    string,
    {
      id: string;
      orderNo: number;
      total: number;
      paid: number;
      status: string;
      quote: boolean;
      quoteStatus: string | null;
    }
  >;
  payReqs: Map<string, { id: string; status: string; amount: number }>;
  shifts: Map<string, { s: Date; e: Date }[]>;
  timeOff: Map<string, { s: Date; e: Date }[]>;
  /** Users who have any Staff shift on record (they follow Staff shifts, not the default). */
  usesShifts: Set<string>;
}

@Injectable()
export class FsDataService {
  constructor(private readonly ctx: FsContextService) {}

  private get db() {
    return this.ctx.db;
  }

  async load(a: FsActor, s: FsScope): Promise<Data> {
    const rootId = a.rootId;
    const [cfg, biz, group, members] = await Promise.all([
      this.ctx.config(rootId),
      this.ctx.business(rootId),
      this.ctx.branches(rootId),
      this.ctx.members(rootId),
    ]);
    const gids = group.map((g) => g.id);
    const where = { businessId: rootId };
    const tz = biz.timezone || 'UTC';
    const now = new Date();
    const from = zoned(keyPlus(-2, tz, now), 0, tz);
    const to = zoned(keyPlus(40, tz, now), 0, tz);
    const [
      svcList,
      templates,
      profiles,
      siteList,
      eqMaps,
      requests,
      wos,
      labor,
      inspections,
      plans,
      agreements,
      warranty,
      approvals,
      files,
    ] = await Promise.all([
      this.db.fsServiceType.findMany({ where, orderBy: { code: 'asc' } }),
      this.db.fsTemplate.findMany({
        where,
        orderBy: [{ code: 'asc' }, { version: 'asc' }],
      }),
      this.db.fsTechnician.findMany({
        where: { ...where, active: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.db.fsSite.findMany({ where, orderBy: { label: 'asc' } }),
      this.db.fsEquipmentSite.findMany({ where }),
      this.db.fsRequest.findMany({ where, orderBy: { createdAt: 'desc' } }),
      this.db.fsWorkOrder.findMany({
        where,
        include: woInclude,
        orderBy: { number: 'desc' },
      }),
      this.db.fsLabor.findMany({ where, orderBy: { startAt: 'desc' } }),
      this.db.fsInspection.findMany({ where, orderBy: { startedAt: 'desc' } }),
      this.db.fsPlan.findMany({
        where,
        include: { instances: true },
        orderBy: { number: 'asc' },
      }),
      this.db.fsAgreement.findMany({ where, orderBy: { number: 'desc' } }),
      this.db.fsWarranty.findMany({ where, orderBy: { createdAt: 'desc' } }),
      this.db.fsApproval.findMany({
        where: { ...where, status: 'Pending' },
        orderBy: { createdAt: 'desc' },
      }),
      this.db.fsFile.groupBy({
        by: ['woId', 'stage'],
        where: { ...where, woId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const eqSite = new Map(eqMaps.map((m) => [m.assetId, m.siteId]));
    const assetIds = new Set<string>([
      ...eqMaps.map((m) => m.assetId),
      ...(requests.map((r) => r.assetId).filter(Boolean) as string[]),
      ...(wos.map((w) => w.assetId).filter(Boolean) as string[]),
      ...(plans.map((p) => p.assetId).filter(Boolean) as string[]),
      ...warranty.map((w) => w.assetId),
    ]);
    const [assetRows, cats] = await Promise.all([
      this.db.amAsset.findMany({
        where: {
          businessId: rootId,
          OR: [{ ownerType: 'Customer-owned' }, { id: { in: [...assetIds] } }],
        },
        orderBy: { number: 'asc' },
      }),
      this.db.amCategory.findMany({
        where: { businessId: rootId },
        select: { id: true, name: true },
      }),
    ]);
    const assets = new Map(assetRows.map((x) => [x.id, x]));
    const equipment = assetRows.filter(
      (x) => x.ownerType === 'Customer-owned' && x.status !== 'Archived',
    );
    const meterAssets = plans
      .filter((p) => p.trigger === 'Usage hours' && p.assetId)
      .map((p) => p.assetId as string);
    const meterRows = meterAssets.length
      ? await this.db.amReading.findMany({
          where: { businessId: rootId, assetId: { in: meterAssets } },
          orderBy: [{ takenAt: 'desc' }, { createdAt: 'desc' }],
          select: {
            assetId: true,
            value: true,
            correctionOfId: true,
            id: true,
          },
        })
      : [];
    const corrected = new Set(
      meterRows.map((r) => r.correctionOfId).filter(Boolean),
    );
    const meters = new Map<string, number>();
    for (const r of meterRows)
      if (!corrected.has(r.id) && !meters.has(r.assetId))
        meters.set(r.assetId, num(r.value));

    const cusIds = new Set<string>([
      ...siteList.map((x) => x.customerId),
      ...requests.map((x) => x.customerId),
      ...wos.map((x) => x.customerId),
      ...agreements.map((x) => x.customerId),
      ...warranty.map((x) => x.customerId),
      ...plans.map((x) => x.customerId),
      ...(equipment.map((x) => x.customerId).filter(Boolean) as string[]),
    ]);
    const prodIds = new Set<string>(
      wos.flatMap((w) => w.parts.map((p) => p.productId)),
    );
    svcList.forEach((x) =>
      (Array.isArray(x.partProductIds)
        ? (x.partProductIds as string[])
        : []
      ).forEach((p) => prodIds.add(p)),
    );
    const orderIds = wos
      .flatMap((w) => [w.quoteOrderId, w.invoiceOrderId])
      .filter(Boolean) as string[];
    const payIds = wos.map((w) => w.payRequestId).filter(Boolean) as string[];
    const buIds = members.flatMap((m) => m.buIds);
    const [customers, products, orders, pays, shifts, offs, anyShift] =
      await Promise.all([
        this.db.customer.findMany({
          where: { id: { in: [...cusIds] }, businessId: { in: gids } },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            address: true,
            businessId: true,
          },
        }),
        this.db.product.findMany({
          where: { id: { in: [...prodIds] } },
          select: {
            id: true,
            name: true,
            sku: true,
            stockQty: true,
            costPrice: true,
            sellingPrice: true,
            businessId: true,
          },
        }),
        (orderIds.length
          ? this.db.order.findMany({
              where: { id: { in: orderIds } },
              select: {
                id: true,
                orderNo: true,
                total: true,
                status: true,
                isQuotation: true,
                quotationStatus: true,
                payments: { select: { amount: true, method: true } },
              },
            })
          : Promise.resolve([])) as Promise<
          {
            id: string;
            orderNo: number;
            total: Prisma.Decimal;
            status: string;
            isQuotation: boolean;
            quotationStatus: string | null;
            payments: { amount: Prisma.Decimal; method: string }[];
          }[]
        >,
        (payIds.length
          ? this.db.payRequest.findMany({
              where: { id: { in: payIds } },
              select: { id: true, status: true, amount: true },
            })
          : Promise.resolve([])) as Promise<
          { id: string; status: string; amount: Prisma.Decimal | null }[]
        >,
        this.db.staffShift.findMany({
          where: {
            staffUserId: { in: buIds },
            status: { not: 'cancelled' },
            startsAt: { lt: to },
            endsAt: { gt: from },
          },
          select: { staffUserId: true, startsAt: true, endsAt: true },
          orderBy: { startsAt: 'asc' },
        }),
        this.db.timeOff.findMany({
          where: {
            staffUserId: { in: buIds },
            approved: true,
            startsAt: { lt: to },
            endsAt: { gt: from },
          },
          select: { staffUserId: true, startsAt: true, endsAt: true },
        }),
        this.db.staffShift.groupBy({
          by: ['staffUserId'],
          where: { staffUserId: { in: buIds } },
        }),
      ]);
    const buToUser = new Map<string, string>();
    members.forEach((m) => m.buIds.forEach((b) => buToUser.set(b, m.id)));
    const shiftMap = new Map<string, { s: Date; e: Date }[]>();
    for (const x of shifts) {
      const u = buToUser.get(x.staffUserId);
      if (!u) continue;
      shiftMap.set(u, [
        ...(shiftMap.get(u) ?? []),
        { s: x.startsAt, e: x.endsAt },
      ]);
    }
    const offMap = new Map<string, { s: Date; e: Date }[]>();
    for (const x of offs) {
      const u = buToUser.get(x.staffUserId);
      if (!u) continue;
      offMap.set(u, [...(offMap.get(u) ?? []), { s: x.startsAt, e: x.endsAt }]);
    }
    const usesShifts = new Set(
      anyShift
        .map((x) => buToUser.get(x.staffUserId))
        .filter(Boolean) as string[],
    );
    const names = new Map(members.map((m) => [m.id, m.name]));
    const techs: Tech[] = profiles
      .filter((p) => names.has(p.userId))
      .map((p) => {
        const m = members.find((x) => x.id === p.userId)!;
        return {
          id: p.userId,
          profileId: p.id,
          name: m.name,
          buIds: m.buIds,
          skills: (p.skills as string[]) ?? [],
          certs: (p.certs as string[]) ?? [],
          zones: (p.territories as string[]) ?? [],
          track: p.tracking,
          manual: p.manualStatus,
          lastZone: p.lastZone,
          lastZoneAt: p.lastZoneAt,
          defShift: [num(p.shiftStart), num(p.shiftEnd)],
          rate: m.rate,
        };
      });
    const fileMap = new Map<string, { stage: string; n: number }[]>();
    for (const f of files) {
      if (!f.woId) continue;
      fileMap.set(f.woId, [
        ...(fileMap.get(f.woId) ?? []),
        { stage: f.stage, n: f._count._all },
      ]);
    }
    return {
      a,
      s,
      cfg,
      fmt: new Fmt(biz.currency || 'PKR', tz),
      tz,
      now,
      nowH: hourOf(now, tz),
      biz: { ...biz, timezone: tz },
      group,
      svc: new Map(svcList.map((x) => [x.id, x])),
      svcList,
      templates,
      techs,
      people: members.map((m) => ({
        id: m.id,
        name: m.name,
        label: m.label,
        rate: m.rate,
      })),
      names,
      customers: new Map(customers.map((c) => [c.id, c])),
      sites: new Map(siteList.map((x) => [x.id, x])),
      siteList,
      assets,
      equipment,
      eqSite,
      catNames: new Map(cats.map((c) => [c.id, c.name])),
      meters,
      requests,
      wos,
      labor,
      inspections,
      plans,
      agreements,
      contracts: new Map(
        (
          await this.db.ctContract.findMany({
            where: {
              businessId: rootId,
              id: {
                in: agreements
                  .map((g) => g.contractId)
                  .filter((x): x is string => !!x),
              },
            },
            select: {
              id: true,
              number: true,
              title: true,
              status: true,
              cpId: true,
            },
          })
        ).map((c) => [c.id, c]),
      ),
      warranty,
      approvals,
      files: fileMap,
      products: new Map(
        products.map((p) => [
          p.id,
          {
            id: p.id,
            name: p.name,
            sku: p.sku,
            stock: p.stockQty,
            cost: num(p.costPrice),
            price: num(p.sellingPrice),
            businessId: p.businessId,
          },
        ]),
      ),
      orders: new Map(
        orders.map((o) => [
          o.id,
          {
            id: o.id,
            orderNo: o.orderNo,
            total: num(o.total),
            paid: o.payments
              .filter((p) => p.method !== 'credit')
              .reduce((x, p) => x + num(p.amount), 0),
            status: o.status,
            quote: o.isQuotation,
            quoteStatus: o.quotationStatus,
          },
        ]),
      ),
      payReqs: new Map(
        pays.map((p) => [
          p.id,
          { id: p.id, status: p.status, amount: num(p.amount) },
        ]),
      ),
      shifts: shiftMap,
      timeOff: offMap,
      usesShifts,
    };
  }

  // ── lookups ─────────────────────────────────────────────────────────────

  W(d: Data, id: string) {
    return d.wos.find((w) => w.id === id || w.number === id);
  }
  cname(d: Data, id: string | null | undefined) {
    return (id && d.customers.get(id)?.name) || '—';
  }
  tname(d: Data, id: string | null | undefined) {
    return id ? (d.names.get(id) ?? 'Former staff') : 'Unassigned';
  }
  tech(d: Data, id: string | null | undefined) {
    return id ? d.techs.find((t) => t.id === id) : undefined;
  }
  sv(d: Data, id: string | null | undefined) {
    return id ? d.svc.get(id) : undefined;
  }
  svName(d: Data, id: string | null | undefined) {
    return this.sv(d, id)?.name ?? '—';
  }
  site(d: Data, id: string | null | undefined) {
    return id ? d.sites.get(id) : undefined;
  }
  zoneOf(d: Data, w: { siteId: string | null; assetId?: string | null }) {
    const s = this.site(
      d,
      w.siteId ?? (w.assetId ? d.eqSite.get(w.assetId) : null),
    );
    return s?.zone ?? '—';
  }
  addr(d: Data, siteId: string | null | undefined, customerId?: string) {
    const s = this.site(d, siteId);
    if (s) return s.address;
    const c = customerId ? d.customers.get(customerId) : undefined;
    return c?.address || '—';
  }
  partName(d: Data, productId: string) {
    return d.products.get(productId)?.name ?? 'Removed product';
  }
  tplOf(
    d: Data,
    w: { templateId: string | null; serviceTypeId: string | null },
  ) {
    if (w.templateId) return d.templates.find((t) => t.id === w.templateId);
    const sv = this.sv(d, w.serviceTypeId);
    return sv?.templateId
      ? d.templates.find((t) => t.id === sv.templateId)
      : undefined;
  }
  tplItems(
    t: FsTemplate | undefined,
  ): { t: string; type: string; req: boolean; ev: boolean }[] {
    return t && Array.isArray(t.items)
      ? (t.items as { t: string; type: string; req: boolean; ev: boolean }[])
      : [];
  }
  answers(w: W): (number | string | null)[] {
    return Array.isArray(w.checklist)
      ? (w.checklist as (number | string | null)[])
      : [];
  }
  photos(d: Data, woId: string) {
    return (d.files.get(woId) ?? []).filter((f) => f.n > 0).map((f) => f.stage);
  }
  money(d: Data, n: number | null | undefined) {
    return n == null ? '—' : d.fmt.money(n);
  }

  // ── time ────────────────────────────────────────────────────────────────

  day(d: Data, w: { startAt: Date | null }) {
    return w.startAt ? dayOffset(w.startAt, d.tz, d.now) : null;
  }
  h(d: Data, w: { startAt: Date | null }) {
    return w.startAt ? hourOf(w.startAt, d.tz) : null;
  }
  dday(d: Data, off: number | null | undefined) {
    if (off == null) return '—';
    if (off === 0) return 'Today';
    if (off === 1) return 'Tomorrow';
    if (off === -1) return 'Yesterday';
    return new Date(
      `${keyPlus(off, d.tz, d.now)}T12:00:00Z`,
    ).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    });
  }
  ddate(d: Data, x: Date | null | undefined) {
    return x ? this.dday(d, dayOffset(x, d.tz, d.now)) : '—';
  }
  win(d: Data, w: W) {
    const day = this.day(d, w);
    const h = this.h(d, w);
    return day == null || h == null
      ? 'Not scheduled'
      : `${this.dday(d, day)} ${hh(h)}–${hh(h + w.durMin / 60)}`;
  }
  ago(d: Data, x: Date) {
    return (d.now.getTime() - x.getTime()) / 60000;
  }

  // ── SLA ─────────────────────────────────────────────────────────────────

  slaLeft(d: Data, w: W): number | null {
    if (!w.slaDueAt) return null;
    const ref = w.slaPausedAt ?? d.now;
    return (w.slaDueAt.getTime() - ref.getTime()) / 60000;
  }
  slaSt(d: Data, w: W): string {
    if (!OPEN.includes(w.status))
      return w.status === 'Cancelled' ? 'None' : 'Met';
    if (!w.slaDueAt) return 'None';
    if (w.status === 'Awaiting Customer') return 'Paused';
    const m = this.slaLeft(d, w)!;
    return m < 0
      ? 'Breached'
      : m < 60
        ? 'At Risk'
        : m < 180
          ? 'Warning'
          : 'Healthy';
  }
  slaText(d: Data, w: W) {
    return mins(this.slaLeft(d, w));
  }

  // ── parts ───────────────────────────────────────────────────────────────

  /** Units held by reservations on other open jobs (Field Service holds; Inventory has no reservations). */
  heldElsewhere(d: Data, productId: string, exceptPartId?: string) {
    let n = 0;
    for (const w of d.wos)
      if (OPEN.includes(w.status))
        for (const p of w.parts)
          if (p.productId === productId && p.id !== exceptPartId)
            n += Math.max(0, p.reserved - p.issued);
    return n;
  }
  available(d: Data, productId: string, exceptPartId?: string) {
    const pr = d.products.get(productId);
    if (!pr) return null;
    return Math.max(
      0,
      pr.stock - this.heldElsewhere(d, productId, exceptPartId),
    );
  }
  partSt(d: Data, p: WPart): string {
    if (p.issued && p.used + p.returned >= p.issued)
      return p.used ? 'Used' : 'Returned';
    if (p.issued >= p.required) return 'Issued';
    if (p.reserved >= p.required) return 'Reserved';
    const av = this.available(d, p.productId, p.id);
    if (av == null) return 'Unavailable';
    if (p.purchaseOrderId) return 'Requested';
    return av + p.reserved >= p.required ? 'Needed' : 'Missing';
  }
  ready(d: Data, w: W): string {
    if (!w.parts.length) return 'None';
    const L = w.parts.map((p) => this.partSt(d, p));
    if (L.includes('Unavailable')) return 'Unavailable';
    if (L.includes('Missing')) return 'Missing';
    if (L.every((s) => ['Reserved', 'Issued', 'Used', 'Returned'].includes(s)))
      return 'Ready';
    return 'Partial';
  }

  // ── technicians ─────────────────────────────────────────────────────────

  /** Shift on a business day: Staff shifts when the person has any, else their field default. */
  shiftOn(d: Data, t: Tech, off: number): [number, number] | null {
    const key = keyPlus(off, d.tz, d.now);
    const dayStart = zoned(key, 0, d.tz).getTime();
    const dayEnd = dayStart + 86400000;
    const offs = d.timeOff.get(t.id) ?? [];
    if (
      offs.some(
        (o) =>
          o.s.getTime() < dayEnd - 3600000 &&
          o.e.getTime() > dayStart + 3600000,
      )
    )
      return null;
    if (d.usesShifts.has(t.id)) {
      const L = (d.shifts.get(t.id) ?? []).filter(
        (x) => x.s.getTime() < dayEnd && x.e.getTime() > dayStart,
      );
      if (!L.length) return null;
      const s = Math.min(
        ...L.map((x) => (x.s.getTime() < dayStart ? 0 : hourOf(x.s, d.tz))),
      );
      const e = Math.max(
        ...L.map((x) =>
          x.e.getTime() > dayEnd ? 24 : hourOf(x.e, d.tz) || 24,
        ),
      );
      return [s, e];
    }
    return t.defShift;
  }
  shiftSource(d: Data, t: Tech) {
    return d.usesShifts.has(t.id)
      ? 'Staff shift'
      : 'Field default (no Staff shifts on record)';
  }
  techDay(d: Data, tid: string, off: number, exceptId?: string) {
    return d.wos.filter(
      (w) =>
        w.techUserId === tid &&
        w.startAt &&
        this.day(d, w) === off &&
        w.id !== exceptId &&
        !['Cancelled', 'Closed', 'Completed'].includes(w.status),
    );
  }
  techStatus(d: Data, t: Tech): string {
    if (t.manual === 'Off Duty' || t.manual === 'Break') return t.manual;
    const mine = d.wos.filter((w) => w.techUserId === t.id);
    if (mine.some((w) => ['Arrived', 'In Progress'].includes(w.status)))
      return 'On Job';
    if (mine.some((w) => w.status === 'En Route')) return 'En Route';
    const sh = this.shiftOn(d, t, 0);
    if (!sh || d.nowH < sh[0] || d.nowH >= sh[1]) return 'Off Duty';
    if (
      this.techDay(d, t.id, 0).some((w) =>
        ['Assigned', 'Dispatched', 'Scheduled'].includes(w.status),
      )
    )
      return 'Scheduled';
    return 'Available';
  }
  locFresh(d: Data, t: Tech): { st: string; t: string; m?: number } {
    const sh = this.shiftOn(d, t, 0);
    const onShift = !!sh && d.nowH >= sh[0] && d.nowH < sh[1];
    if (
      !d.cfg.tech.tracking ||
      !t.track ||
      !t.lastZone ||
      !t.lastZoneAt ||
      !onShift
    )
      return {
        st: 'Tracking off',
        t: !t.lastZone
          ? 'No check-in yet today'
          : 'Location not shared (policy / off shift)',
      };
    const m = this.ago(d, t.lastZoneAt);
    return m > d.cfg.tech.staleMin
      ? { st: 'Stale', t: `Last check-in ${Math.round(m)} minutes ago`, m }
      : { st: 'Fresh', t: `Checked in ${Math.max(1, Math.round(m))}m ago`, m };
  }
  /** Zone-based travel estimate in minutes (no routing provider). */
  travel(d: Data, fromZone: string | null, toZone: string): number | null {
    if (!fromZone || toZone === '—') return null;
    if (fromZone === toZone) return d.cfg.travel.same;
    const adj = d.cfg.adj[fromZone] ?? [];
    const back = d.cfg.adj[toZone] ?? [];
    return adj.includes(toZone) || back.includes(fromZone)
      ? d.cfg.travel.adj
      : d.cfg.travel.other;
  }
  /** Share of a technician's finished jobs with no repeat visit on the same asset inside the window. */
  ftfOf(d: Data, tid?: string) {
    const win = d.cfg.warranty.repeatWindowDays * 86400000;
    const done = d.wos.filter(
      (w) => DONE.includes(w.status) && (!tid || w.techUserId === tid),
    );
    if (!done.length) return null;
    const ok = done.filter((w) => {
      if (w.unresolved) return false;
      if (!w.assetId || !w.completedAt) return true;
      const t0 = w.completedAt.getTime();
      return !d.wos.some(
        (x) =>
          x.id !== w.id &&
          x.assetId === w.assetId &&
          x.status !== 'Cancelled' &&
          x.createdAt.getTime() > t0 &&
          x.createdAt.getTime() - t0 <= win &&
          !x.planId,
      );
    });
    return { v: ok.length / done.length, n: done.length };
  }

  elig(d: Data, w: W, tid: string, off: number, h: number): Elig {
    const t = this.tech(d, tid);
    const s = this.sv(d, w.serviceTypeId);
    const blocks: string[] = [];
    const warns: string[] = [];
    const zone = this.zoneOf(d, w);
    const end = h + w.durMin / 60;
    if (!t)
      return {
        blocks: ['TECHNICIAN_UNAVAILABLE — not set up as a field technician'],
        warns,
        tr: null,
        ot: false,
        from: null,
        load: 0,
        comps: [],
        score: 0,
      };
    const sh = this.shiftOn(d, t, off);
    if (!sh)
      blocks.push(
        `TECHNICIAN_UNAVAILABLE — ${t.name} has no shift ${this.dday(d, off).toLowerCase()} (${this.shiftSource(d, t)} / approved time off)`,
      );
    else if (off === 0 && t.manual === 'Off Duty')
      blocks.push(
        `TECHNICIAN_UNAVAILABLE — ${t.name} is marked off duty today`,
      );
    if (s && !t.skills.includes(s.skill))
      blocks.push(
        `TECHNICIAN_SKILL_MISMATCH — ${s.name} needs ${s.skill}; ${t.name} has ${t.skills.join(', ') || 'no skills recorded'}`,
      );
    if (s?.cert && !t.certs.includes(s.cert))
      blocks.push(`Missing certification: ${s.cert}`);
    const day = this.techDay(d, tid, off, w.id);
    const clash = day.find((o) => {
      const oh = this.h(d, o)!;
      return h < oh + o.durMin / 60 && end > oh;
    });
    if (clash) {
      const oh = this.h(d, clash)!;
      blocks.push(
        `SCHEDULE_CONFLICT — overlaps ${clash.number} (${hh(oh)}–${hh(oh + clash.durMin / 60)})`,
      );
    }
    if (off < 0 || (off === 0 && h < d.nowH - 0.1))
      blocks.push(`Start time ${hh(h)} is already past`);
    if (day.length >= d.cfg.dispatch.maxJobsPerDay)
      warns.push(
        `Already ${day.length} jobs that day (limit ${d.cfg.dispatch.maxJobsPerDay})`,
      );
    const ot = !!sh && (h < sh[0] || end > sh[1]);
    if (ot && sh)
      warns.push(
        `Overtime — outside shift ${hh(sh[0])}–${hh(sh[1])}${d.cfg.approvals.overtime ? ' (needs approval)' : ''}`,
      );
    if (zone !== '—' && !t.zones.includes(zone))
      warns.push(
        `Outside territory (${zone} not in ${t.zones.join(', ') || 'no territories'})`,
      );
    const prev = day
      .filter((o) => this.h(d, o)! + o.durMin / 60 <= h)
      .sort((a, b) => this.h(d, b)! - this.h(d, a)!)[0];
    const from = prev
      ? this.zoneOf(d, prev)
      : off === 0 && t.lastZone
        ? t.lastZone
        : (t.zones[0] ?? null);
    const tr = this.travel(d, from === '—' ? null : from, zone);
    if (
      prev &&
      tr != null &&
      this.h(d, prev)! + prev.durMin / 60 + tr / 60 > h + 0.01
    )
      warns.push(`Tight travel — ${tr} min from ${prev.number} (${from})`);
    const rd = this.ready(d, w);
    if (['Missing', 'Partial', 'Unavailable'].includes(rd))
      warns.push(`Parts ${rd.toLowerCase()}`);
    const left = this.slaLeft(d, w);
    const arriveMin = off * 1440 + (h - d.nowH) * 60 + (tr ?? 0);
    if (left != null && OPEN.includes(w.status) && arriveMin > left)
      warns.push(
        `SLA — arrival ${hh(h)} is after the SLA deadline (${mins(left)})`,
      );
    const load = day.reduce((x, o) => x + o.durMin / 60, 0);
    const ftf = this.ftfOf(d, tid);
    const comps: [string, number, number][] = [
      [
        'Skill fit',
        s && t.skills.includes(s.skill)
          ? s.cert && !t.certs.includes(s.cert)
            ? 10
            : 30
          : 0,
        30,
      ],
      [
        'Distance',
        tr == null
          ? 0
          : tr <= d.cfg.travel.same
            ? 25
            : tr <= d.cfg.travel.adj
              ? 14
              : 4,
        25,
      ],
      ['Workload', Math.max(0, Math.round(20 - load * 3)), 20],
      ['First-time fix', ftf ? Math.round(ftf.v * 15) : 0, 15],
      ['Territory', zone !== '—' && t.zones.includes(zone) ? 10 : 0, 10],
    ];
    return {
      blocks,
      warns,
      tr,
      ot,
      from,
      load,
      comps,
      score: blocks.length ? 0 : comps.reduce((x, c) => x + c[1], 0),
    };
  }
  suggest(d: Data, w: W, off: number, h: number) {
    return d.techs
      .map((t) => ({ t, e: this.elig(d, w, t.id, off, h) }))
      .sort(
        (a, b) =>
          b.e.score - a.e.score || a.e.blocks.length - b.e.blocks.length,
      );
  }
  nextSlot(
    d: Data,
    tid: string,
    dur: number,
    off: number,
    exceptId?: string,
  ): number | null {
    const t = this.tech(d, tid);
    if (!t) return null;
    const sh = this.shiftOn(d, t, off);
    if (!sh) return null;
    const day = this.techDay(d, tid, off, exceptId);
    for (
      let h = Math.max(sh[0], off === 0 ? Math.ceil(d.nowH * 2) / 2 : sh[0]);
      h + dur / 60 <= sh[1];
      h += 0.5
    )
      if (
        !day.some(
          (o) =>
            h < this.h(d, o)! + o.durMin / 60 && h + dur / 60 > this.h(d, o)!,
        )
      )
        return h;
    return null;
  }
  nextSlotAny(d: Data, w: W, off: number) {
    const s = this.sv(d, w.serviceTypeId);
    const c = d.techs
      .filter((t) => !s || t.skills.includes(s.skill))
      .map((t) => this.nextSlot(d, t.id, w.durMin, off, w.id))
      .filter((h): h is number => h != null);
    return c.length
      ? Math.min(...c)
      : off === 0
        ? Math.min(20, Math.ceil(d.nowH * 2) / 2)
        : 9;
  }

  // ── execution gates ─────────────────────────────────────────────────────

  completionGaps(d: Data, w: W, res?: string): string[] {
    const tp = this.tplOf(d, w);
    const ans = this.answers(w);
    const g: string[] = [];
    if (d.cfg.checklist.requireAll)
      this.tplItems(tp).forEach((it, i) => {
        if (it.req && (ans[i] == null || ans[i] === ''))
          g.push(`Checklist: ${it.t}`);
      });
    if (d.cfg.proof.afterPhoto && !this.photos(d, w.id).includes('after'))
      g.push('After photo');
    w.parts.forEach((p) => {
      if (p.issued && p.used + p.returned < p.issued)
        g.push(
          `Account for issued ${this.partName(d, p.productId)} (use or return)`,
        );
    });
    if (!d.labor.some((l) => l.woId === w.id)) g.push('Labor time');
    if (d.cfg.proof.signature && !w.signedBy) g.push('Customer signature');
    if (d.cfg.proof.resolution && !(res ?? w.resolution))
      g.push('Resolution notes');
    return g;
  }

  /** Coverage of a job: agreement (with remaining visits), warranty case, or chargeable. */
  coverage(
    d: Data,
    w: { agreementId: string | null; warrantyId: string | null },
  ) {
    if (w.agreementId)
      return `Service agreement ${d.agreements.find((x) => x.id === w.agreementId)?.number ?? ''}`.trim();
    if (w.warrantyId)
      return `Warranty ${d.warranty.find((x) => x.id === w.warrantyId)?.number ?? ''}`.trim();
    return 'Chargeable';
  }
  agrUsed(d: Data, g: FsAgreement) {
    return d.wos.filter(
      (w) =>
        w.agreementId === g.id &&
        w.status !== 'Cancelled' &&
        w.status !== 'Draft',
    ).length;
  }
  activeAgreement(
    d: Data,
    customerId: string,
    svcId?: string | null,
    assetId?: string | null,
  ) {
    const today = dayKey(d.now, d.tz);
    return d.agreements.find((g) => {
      if (g.customerId !== customerId || g.status !== 'Active') return false;
      if (
        g.endOn.toISOString().slice(0, 10) < today ||
        g.startOn.toISOString().slice(0, 10) > today
      )
        return false;
      const svcs = (g.serviceTypeIds as string[]) ?? [];
      const as = (g.assetIds as string[]) ?? [];
      if (svcId && svcs.length && !svcs.includes(svcId)) return false;
      if (assetId && as.length && !as.includes(assetId)) return false;
      return true;
    });
  }
  /** Agreement end in business days from today. */
  agrEnd(d: Data, g: FsAgreement) {
    return Math.round(
      (Date.parse(g.endOn.toISOString().slice(0, 10)) -
        Date.parse(dayKey(d.now, d.tz))) /
        86400000,
    );
  }
  agrStatus(d: Data, g: FsAgreement) {
    if (g.status === 'Active' && this.agrEnd(d, g) < 0) return 'Expired';
    return g.status === 'Active' && this.agrEnd(d, g) <= 30
      ? 'Renewing Soon'
      : g.status;
  }

  /** Invoice payment state as Payments & Billing / Orders know it (never assumed). */
  payState(d: Data, w: W): string {
    if (!w.invoiceOrderId) return 'Not Required';
    const o = d.orders.get(w.invoiceOrderId);
    if (o && o.total > 0 && o.paid >= o.total - 0.005) return 'Paid';
    const pr = w.payRequestId ? d.payReqs.get(w.payRequestId) : undefined;
    if (pr) {
      if (pr.status === 'Paid') return 'Paid';
      if (['Partially Paid'].includes(pr.status)) return 'Partially Paid';
      if (['Processing'].includes(pr.status)) return 'Processing';
      if (['Failed', 'Expired', 'Cancelled'].includes(pr.status))
        return pr.status === 'Failed' ? 'Failed' : 'Pending';
      return 'Payment Link Sent';
    }
    return o && o.paid > 0 ? 'Partially Paid' : 'Pending';
  }

  /** Plan next due as a business-day offset (null for usage plans without a date). */
  planNext(d: Data, p: Plan): number | null {
    if (p.trigger === 'Usage hours') {
      if (p.nextDueMeter == null || !p.assetId) return null;
      const m = d.meters.get(p.assetId);
      if (m == null) return null;
      return m >= num(p.nextDueMeter) ? 0 : null;
    }
    return p.nextDueOn
      ? Math.round(
          (Date.parse(p.nextDueOn.toISOString().slice(0, 10)) -
            Date.parse(dayKey(d.now, d.tz))) /
            86400000,
        )
      : null;
  }

  /** Requests and jobs a technician-only person may see. */
  woVisible(d: Data, w: W) {
    if (d.a.techOnly && w.techUserId !== d.a.userId) return false;
    if (d.s.zone && this.zoneOf(d, w) !== d.s.zone) return false;
    return true;
  }
  wosV(d: Data) {
    return d.wos.filter((w) => this.woVisible(d, w));
  }
}
