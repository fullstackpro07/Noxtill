import { Injectable } from '@nestjs/common';
import type { FsEvent, FsFile } from '@prisma/client';
import {
  K,
  R,
  btn,
  card,
  cell,
  cols,
  emptyRows,
  fBtns,
  fChips,
  fRead,
  fSel,
  fTog,
  fTxt,
  kpiRow,
  mkBars,
  row,
  seg,
  hoistSegActs,
} from '../payments/pay-vm';
import { FsActor, FsContextService, num } from './fs-context.service';
import { Data, FsDataService, FsScope, W, WPart } from './fs-data.service';
import {
  CHANNELS,
  DONE,
  FS_CST,
  FS_SECS,
  FS_TABS,
  LABOR_TYPES,
  LIVE_SECS,
  OPEN,
  PRIO_CELL,
  PRIORITIES,
  REQ_FINAL,
  REQ_OPEN,
  REQ_STATUSES,
  SLOTS,
  WT,
  patternNumber,
} from './fs.constants';
import { agoM, hh, wall } from './fs-time';

const LOCK = '🔒';
type Btn = ReturnType<typeof btn>;
type Sel = {
  k: string;
  l: string;
  v: string;
  opts: { v: string; t: string }[];
  bd: string;
  bg: string;
};

const sel2 = (
  k: string,
  l: string,
  v: string | undefined,
  opts: (string | [string, string])[],
): Sel => ({
  k,
  l,
  v: v ?? '',
  opts: opts.map((x) =>
    typeof x === 'string' ? { v: x, t: x } : { v: x[0], t: x[1] },
  ),
  bd: v ? '#12A150' : '#E6EAF0',
  bg: v ? '#F7FCF9' : '#fff',
});
const nOn = (f: Record<string, string> | undefined, skip: string[] = []) =>
  Object.entries(f ?? {}).filter(([k, v]) => v && !skip.includes(k)).length ||
  null;

/** Server-built view-models for the 16 Field Service screens (fs-core.js v*). */
@Injectable()
export class FsViewsService {
  constructor(
    private readonly ctx: FsContextService,
    private readonly data: FsDataService,
  ) {}

  // ── chips ──────────────────────────────────────────────────────────────
  chip(st: string) {
    const C = FS_CST[st] ?? ['#344054', '#F2F4F7', ''];
    return { t: (C[2] ? `${C[2]} ` : '') + st, fg: C[0], bg: C[1] };
  }
  stc(st: string, s = '') {
    const c = this.chip(st);
    return cell({ bt: c.t, bfg: c.fg, bbg: c.bg, s });
  }
  prioCell(p: string) {
    const m = PRIO_CELL[p] ?? [p, '#475467', '#F2F4F7'];
    return cell({ bt: m[0], bfg: m[1], bbg: m[2] });
  }
  slaCell(d: Data, w: W) {
    const st = this.data.slaSt(d, w);
    const c = this.chip(st);
    return cell({
      bt: c.t,
      bfg: c.fg,
      bbg: c.bg,
      s: ['Met', 'None'].includes(st)
        ? ''
        : st === 'Paused'
          ? 'Clock paused'
          : this.data.slaText(d, w),
    });
  }
  mono(t: string, o: Record<string, unknown> = {}) {
    return cell({
      t,
      fw: 800,
      fg: '#101828',
      ff: 'ui-monospace,monospace',
      ...o,
    });
  }
  money(d: Data, n: number | null | undefined) {
    return d.a.money ? this.data.money(d, n) : LOCK;
  }
  phone(d: Data, id: string) {
    const c = d.customers.get(id);
    return d.a.pii ? c?.phone || '—' : LOCK;
  }
  assetOf(d: Data, id: string | null | undefined) {
    return id ? d.assets.get(id) : undefined;
  }

  allowed(a: FsActor, k: string) {
    if (k === 'settings')
      return a.settings || a.approve || a.owner || !a.techOnly;
    if (a.techOnly)
      return ['technician', 'detail', 'inspections', 'parts', 'labor'].includes(
        k,
      );
    return true;
  }

  woCells(d: Data, w: W) {
    const a = this.assetOf(d, w.assetId);
    return [
      this.mono(w.number),
      cell({ t: this.data.cname(d, w.customerId), s: this.data.zoneOf(d, w) }),
      cell({ t: a ? a.name : '—', s: a?.serial ?? '', opt: '1' }),
      cell({ t: this.data.svName(d, w.serviceTypeId), opt: '1' }),
      this.prioCell(w.priority),
      this.stc(w.status),
      cell({
        t: this.data.tname(d, w.techUserId),
        fg: w.techUserId ? '#344054' : '#B42318',
        fw: w.techUserId ? 600 : 700,
      }),
      cell({ t: this.data.win(d, w) }),
      this.stc(this.data.ready(d, w)),
      this.slaCell(d, w),
    ];
  }
  woMobile(
    d: Data,
    w: W,
  ): [string, string, { t: string; fg: string; bg: string }[]] {
    return [
      `${w.number} · ${this.data.cname(d, w.customerId)}`,
      `${this.data.svName(d, w.serviceTypeId)} · ${this.data.win(d, w)} · ${this.data.tname(d, w.techUserId)}`,
      [this.chip(w.status), this.chip(this.data.slaSt(d, w))],
    ];
  }
  woActs(d: Data, w: W) {
    const a = d.a;
    if (a.readOnly) return ['Open'];
    const o = ['Open'];
    const nx = WT[w.status] ?? [];
    if (a.approve && nx.includes('Approved')) o.push('Approve');
    if (
      a.dispatch &&
      [
        'Approved',
        'Scheduled',
        'Assigned',
        'Awaiting Parts',
        'Awaiting Customer',
      ].includes(w.status)
    )
      o.push(w.techUserId ? 'Reassign' : 'Assign', 'Schedule');
    if (a.dispatch && w.status === 'Assigned') o.push('Dispatch');
    if (a.workorder && OPEN.includes(w.status)) o.push('Change priority');
    if (a.workorder && nx.includes('Cancelled')) o.push('Cancel');
    if (a.workorder) o.push('Duplicate');
    return o;
  }

  // ── header ─────────────────────────────────────────────────────────────

  header(d: Data) {
    const T = FS_TABS.find((t) => t[0] === d.s.tab) ?? FS_TABS[0];
    const cur = d.s.tab === 'detail' ? this.data.W(d, d.s.cur) : undefined;
    const a = d.a;
    const H: Record<string, Btn[]> = {
      overview: [btn('newreq', 'New Service Request', 'primary', !a.request)],
      requests: [btn('newreq', 'New request', 'primary', !a.request)],
      workorders: [btn('newwo', 'New work order', 'primary', !a.workorder)],
      dispatch: [btn('dsp-opt', 'Optimize suggestions', 'ghost', !a.dispatch)],
      inspections: [btn('newtpl', 'New template', 'primary', !a.plan)],
      labor: [btn('lab-new', 'Add manual time', 'primary', !a.execute)],
      pm: [btn('pm-new', 'New plan', 'primary', !a.plan)],
      agreements: [btn('agr-new', 'New agreement', 'primary', !a.agreement)],
      warranty: [
        btn(
          'wrn-new',
          'Open warranty case',
          'primary',
          !a.agreement && !a.request,
        ),
      ],
      settings: [btn('audit', 'View audit')],
    };
    const unas = this.data
      .wosV(d)
      .filter(
        (w) => !w.techUserId && ['Approved', 'Scheduled'].includes(w.status),
      ).length;
    const triage = d.requests.filter((r) =>
      ['New', 'Untriaged'].includes(r.status),
    ).length;
    return {
      title: cur
        ? `${cur.number} · ${this.data.svName(d, cur.serviceTypeId)}`
        : T[3],
      sub: cur
        ? `${cur.status} · ${this.data.cname(d, cur.customerId)} · ${cur.priority}`
        : T[4],
      icon: T[5],
      roleLabel: `${a.roleLabel} · ${a.name}`,
      tabs: FS_TABS.filter(
        (t) =>
          (t[0] !== 'detail' || d.s.tab === 'detail') && this.allowed(a, t[0]),
      ).map((t) => ({
        k: t[0],
        label: t[0] === 'detail' ? (cur ? cur.number : 'Work order') : t[1],
        path: t[2],
        badge:
          t[0] === 'requests' && triage
            ? String(triage)
            : t[0] === 'dispatch' && unas
              ? String(unas)
              : null,
      })),
      hdrActs: H[d.s.tab] ?? [],
      sels: ['overview', 'workorders', 'dispatch', 'map'].includes(d.s.tab)
        ? [
            {
              k: 'zone',
              l: 'Branch / service region',
              v: d.s.zone,
              opts: [
                { v: '', t: 'All territories' },
                ...d.cfg.territories.map((z) => ({ v: z, t: z })),
              ],
            },
          ]
        : [],
      more: [
        ...(a.request ? [{ v: 'newreq', t: 'New service request' }] : []),
        ...(a.export ? [{ v: 'export', t: 'Export' }] : []),
        { v: 'audit', t: 'Audit / history' },
        ...(a.approve
          ? [{ v: 'approvals', t: `Approvals (${d.approvals.length})` }]
          : []),
      ],
      lock: d.cfg.lock ? `Dispatch locked by ${d.cfg.lock.by}` : null,
      loadedAt: d.now.toISOString(),
      me: a.userId,
      techOnly: a.techOnly,
    };
  }

  async screen(a: FsActor, s: FsScope) {
    const d = await this.data.load(a, s);
    const head = this.header(d);
    if (!this.allowed(a, s.tab))
      return {
        head,
        gate: {
          t: `${(FS_TABS.find((t) => t[0] === s.tab) ?? FS_TABS[0])[3]} isn’t available for your role`,
          d: 'Restricted values are never sent to this browser.',
        },
      };
    if (s.tab === 'settings')
      return { head, settings: await this.vSettings(d) };
    const fn: Record<string, (x: Data) => unknown[] | Promise<unknown[]>> = {
      overview: (x) => this.vOverview(x),
      requests: (x) => this.vRequests(x),
      workorders: (x) => this.vWorkOrders(x),
      dispatch: (x) => this.vDispatch(x),
      calendar: (x) => this.vCalendar(x),
      map: (x) => this.vMap(x),
      detail: (x) => this.vDetail(x),
      technician: (x) => this.vTechnician(x),
      inspections: (x) => this.vInspections(x),
      parts: (x) => this.vParts(x),
      labor: (x) => this.vLabor(x),
      equipment: (x) => this.vEquipment(x),
      pm: (x) => this.vPM(x),
      agreements: (x) => this.vAgreements(x),
      warranty: (x) => this.vWarranty(x),
    };
    const i = FS_TABS.findIndex((t) => t[0] === s.tab);
    const rows = hoistSegActs(await (fn[s.tab] ?? fn.overview)(d), head);
    return {
      head,
      rows,
      screenLabel: `${String(i + 1).padStart(2, '0')} ${(FS_TABS[i] ?? FS_TABS[0])[3]}`,
    };
  }

  // ===== 1 Overview =========================================================

  attention(d: Data) {
    const out: {
      id: string;
      sev: string;
      t: string;
      w: W | null;
      act: string;
      kind: string;
      apr?: string;
    }[] = [];
    const A = (sev: string, t: string, w: W, act: string, kind: string) =>
      out.push({ id: `${kind}:${w.id}:${out.length}`, sev, t, w, act, kind });
    for (const w of this.data.wosV(d)) {
      const sl = this.data.slaSt(d, w);
      const day = this.data.day(d, w);
      const h = this.data.h(d, w);
      if (
        !w.techUserId &&
        ['Approved', 'Open'].includes(w.status) &&
        ['Emergency', 'Urgent', 'High'].includes(w.priority)
      )
        A(
          w.priority === 'Emergency' ? 'High' : 'Medium',
          `Unassigned ${w.priority.toLowerCase()} job`,
          w,
          'Assign',
          'wo',
        );
      if (sl === 'Breached')
        A('High', `SLA breached ${this.data.slaText(d, w)}`, w, 'Open', 'sla');
      else if (sl === 'At Risk')
        A(
          'High',
          `SLA breach approaching — ${this.data.slaText(d, w)}`,
          w,
          'Open',
          'sla',
        );
      if (this.data.ready(d, w) === 'Missing' && OPEN.includes(w.status))
        A(
          'Medium',
          `Required part unavailable — ${w.parts
            .filter((p) => this.data.partSt(d, p) === 'Missing')
            .map((p) => this.data.partName(d, p.productId))
            .join(', ')}`,
          w,
          'Open parts',
          'parts',
        );
      if (w.status === 'Awaiting Customer')
        A(
          'Medium',
          `Customer unavailable — ${w.note || 'awaiting customer'}`,
          w,
          'Reschedule',
          'wo',
        );
      if (w.status === 'Awaiting Approval')
        A(
          'Medium',
          `Approval required — ${w.approvalReason ?? ''}`,
          w,
          'Review',
          'wo',
        );
      if (w.status === 'Paused' || w.status === 'Awaiting Parts')
        A(
          'Low',
          `Job ${w.status.toLowerCase()}${w.note ? ` — ${w.note}` : ''}`,
          w,
          'Open',
          'wo',
        );
      if (
        ['Assigned', 'Dispatched'].includes(w.status) &&
        day === 0 &&
        h != null &&
        h < d.nowH
      )
        A(
          'High',
          `Technician running late — ${this.data.tname(d, w.techUserId)} not en route for ${hh(h)}`,
          w,
          'Open',
          'wo',
        );
    }
    if (d.a.approve)
      for (const p of d.approvals) {
        const w = d.wos.find((x) => x.id === p.subjectId) ?? null;
        out.push({
          id: `apr:${p.id}`,
          sev: 'Medium',
          t: `Approval required — ${p.kind}: ${p.what}`,
          w,
          act: 'Decide',
          kind: 'apr',
          apr: p.id,
        });
      }
    const rk: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
    return out.sort((x, y) => rk[x.sev] - rk[y.sev]);
  }

  vOverview(d: Data) {
    const f = d.s.f.ov ?? {};
    const all = this.data.wosV(d);
    const W = all.filter(
      (w) =>
        (!f.tech || w.techUserId === f.tech) &&
        (!f.svc || w.serviceTypeId === f.svc) &&
        (!f.st || w.status === f.st) &&
        (!f.prio || w.priority === f.prio),
    );
    if (!d.wos.length && !d.requests.length)
      return emptyRows(
        d.svcList.length
          ? 'No service requests yet.'
          : 'Set up Field Service first.',
        d.svcList.length
          ? 'Start by logging a customer request — it becomes a work order after triage.'
          : 'Add service types, territories and technician profiles in Settings, then log the first request.',
        [
          d.svcList.length
            ? btn('newreq', 'Create First Request', 'primary', !d.a.request)
            : btn('go:settings', 'Open Settings', 'primary', !d.a.settings),
        ],
      );
    const today = W.filter(
      (w) => this.data.day(d, w) === 0 && w.status !== 'Cancelled',
    );
    const open = W.filter((w) => OPEN.includes(w.status));
    const ftf = this.data.ftfOf(d);
    const done = W.filter((w) => DONE.includes(w.status));
    const st = new Map(d.techs.map((t) => [t.id, this.data.techStatus(d, t)]));
    const kpis = [
      K(
        'o:req',
        'Open Service Requests',
        d.requests.filter((r) => REQ_OPEN.includes(r.status)).length,
        `${d.requests.filter((r) => ['New', 'Untriaged'].includes(r.status)).length} untriaged`,
        null,
        '#2E90FA',
      ),
      K(
        'o:unas',
        'Unassigned Work Orders',
        open.filter((w) => !w.techUserId && w.status !== 'Draft').length,
        `${open.filter((w) => !w.techUserId && ['Emergency', 'Urgent'].includes(w.priority)).length} urgent`,
        open.some((w) => !w.techUserId && w.priority === 'Emergency')
          ? '#B42318'
          : null,
        '#F04438',
      ),
      K(
        'o:today',
        'Today’s Visits',
        today.length,
        `${today.filter((w) => DONE.includes(w.status)).length} done`,
        null,
        '#12A150',
      ),
      K(
        'o:act',
        'Technicians Active',
        `${d.techs.filter((t) => ['On Job', 'En Route'].includes(st.get(t.id)!)).length} / ${d.techs.filter((t) => st.get(t.id) !== 'Off Duty').length}`,
        'On job or en route · from Staff shifts',
        null,
        '#12A150',
      ),
      K(
        'o:sla',
        'SLA at Risk',
        open.filter((w) =>
          ['At Risk', 'Breached'].includes(this.data.slaSt(d, w)),
        ).length,
        `${open.filter((w) => this.data.slaSt(d, w) === 'Breached').length} breached`,
        '#B42318',
        '#F04438',
      ),
      K(
        'o:parts',
        'Jobs Awaiting Parts',
        open.filter(
          (w) =>
            w.status === 'Awaiting Parts' ||
            this.data.ready(d, w) === 'Missing',
        ).length,
        '',
        null,
        '#F79009',
      ),
      K(
        'o:sig',
        'Signatures Pending',
        W.filter(
          (w) => ['In Progress', 'Arrived'].includes(w.status) && !w.signedBy,
        ).length,
        'On active jobs',
        null,
        '#6941C6',
      ),
      K(
        'o:done',
        'Completed Today',
        done.filter(
          (w) => w.completedAt && this.data.ddate(d, w.completedAt) === 'Today',
        ).length,
        '',
        null,
        '#12A150',
      ),
      K(
        'o:ftf',
        'First-Time Fix Rate',
        ftf ? `${Math.round(ftf.v * 100)}%` : '—',
        ftf
          ? `${ftf.n} completed jobs · no repeat within ${d.cfg.warranty.repeatWindowDays}d`
          : 'Not enough history',
        null,
        '#12A150',
      ),
      K(
        'o:over',
        'Overdue Work Orders',
        open.filter(
          (w) =>
            (this.data.day(d, w) ?? 0) < 0 ||
            this.data.slaSt(d, w) === 'Breached',
        ).length,
        'Past window or SLA',
        null,
        '#F04438',
      ),
    ];
    const att = this.attention(d).filter((x) => !x.w || all.includes(x.w));
    const resp = done
      .filter((w) => w.arrivedAt)
      .map((w) => {
        const r = w.requestId
          ? d.requests.find((x) => x.id === w.requestId)
          : undefined;
        return (
          (w.arrivedAt!.getTime() - (r?.createdAt ?? w.createdAt).getTime()) /
          60000
        );
      });
    const durs = done
      .map((w) =>
        d.labor
          .filter((l) => l.woId === w.id && l.type !== 'Travel' && l.endAt)
          .reduce(
            (x, l) =>
              x +
              (l.endAt!.getTime() - l.startAt.getTime()) / 60000 -
              l.breakMin,
            0,
          ),
      )
      .filter((m) => m > 0);
    const byStatus = Object.entries(
      W.reduce<Record<string, number>>(
        (o, w) => ((o[w.status] = (o[w.status] ?? 0) + 1), o),
        {},
      ),
    ).sort((x, y) => y[1] - x[1]);
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'ov-f',
          filters: {
            search: null,
            sels: [
              sel2('tech', 'Technician', f.tech, [
                ['', 'Any technician'],
                ...d.techs.map((t) => [t.id, t.name] as [string, string]),
              ]),
              sel2('svc', 'Service type', f.svc, [
                ['', 'Any service'],
                ...d.svcList.map((s) => [s.id, s.name] as [string, string]),
              ]),
              sel2('st', 'Status', f.st, [['', 'Any status'], ...OPEN]),
              sel2('prio', 'Priority', f.prio, [
                ['', 'Any priority'],
                ...d.cfg.priorities,
              ]),
            ],
            nOn: nOn(f),
            count: `${W.length} work orders in scope`,
          },
        }),
      ]),
      R('minmax(0,1fr)', [
        card({
          id: 'ov-att',
          title: 'Urgent attention',
          sub: 'What needs a decision now',
          table: att.length
            ? {
                hasActs: true,
                cols: cols([
                  'Severity',
                  'Issue',
                  'Work order',
                  'Customer',
                  ['Technician', '1'],
                  'Status',
                  'Next action',
                ]),
                rows: att.map((x) =>
                  row(
                    x.id,
                    [
                      cell({
                        bt:
                          x.sev === 'High'
                            ? '▲ High'
                            : x.sev === 'Medium'
                              ? '● Medium'
                              : '▽ Low',
                        bfg:
                          x.sev === 'High'
                            ? '#B42318'
                            : x.sev === 'Medium'
                              ? '#B54708'
                              : '#475467',
                        bbg:
                          x.sev === 'High'
                            ? '#FEF3F2'
                            : x.sev === 'Medium'
                              ? '#FEF6E7'
                              : '#F2F4F7',
                      }),
                      cell({ t: x.t, fw: 700, fg: '#101828', mw: '280px' }),
                      cell({
                        t: x.w?.number ?? '—',
                        ff: 'ui-monospace,monospace',
                      }),
                      cell({
                        t: x.w ? this.data.cname(d, x.w.customerId) : '—',
                      }),
                      cell({
                        t: x.w ? this.data.tname(d, x.w.techUserId) : '—',
                        opt: '1',
                      }),
                      x.w ? this.stc(x.w.status) : this.stc('Pending'),
                      cell({ t: x.act, fg: '#0E8442', fw: 700 }),
                    ],
                    x.kind === 'apr'
                      ? ['Approve', 'Reject']
                      : [x.act, 'Open'].filter((v, i, L) => L.indexOf(v) === i),
                    [
                      x.t,
                      `${x.w?.number ?? ''} · ${x.w ? this.data.cname(d, x.w.customerId) : ''}`,
                      x.w ? [this.chip(x.w.status)] : [],
                    ],
                  ),
                ),
              }
            : null,
          empty: att.length ? null : { t: 'Nothing urgent', d: '', acts: [] },
          acts: [
            btn(
              'go:dispatch',
              'Open dispatch',
              'ghost',
              !this.allowed(d.a, 'dispatch'),
            ),
            btn('go:map', 'Open map', 'ghost', !this.allowed(d.a, 'map')),
          ],
        }),
      ]),
      R('minmax(0,1.4fr) minmax(0,1fr)', [
        card({
          id: 'ov-today',
          title: 'Today’s field operations',
          sub: `${today.length} visits`,
          table: today.length
            ? {
                hasActs: true,
                cols: cols([
                  'Time',
                  'WO',
                  'Customer',
                  ['Site', '1'],
                  'Technician',
                  ['Service', '1'],
                  'Status',
                  'SLA',
                ]),
                rows: today
                  .sort((x, y) => this.data.h(d, x)! - this.data.h(d, y)!)
                  .map((w) =>
                    row(
                      w.id,
                      [
                        cell({ t: hh(this.data.h(d, w)), fw: 800 }),
                        cell({ t: w.number, ff: 'ui-monospace,monospace' }),
                        cell({ t: this.data.cname(d, w.customerId) }),
                        cell({ t: this.data.zoneOf(d, w), opt: '1' }),
                        cell({ t: this.data.tname(d, w.techUserId) }),
                        cell({
                          t: this.data.svName(d, w.serviceTypeId),
                          opt: '1',
                        }),
                        this.stc(w.status),
                        this.slaCell(d, w),
                      ],
                      ['Open'],
                      this.woMobile(d, w),
                    ),
                  ),
              }
            : null,
          empty: today.length
            ? null
            : {
                t: 'No work orders are scheduled today.',
                d: '',
                acts: [
                  btn('go:workorders', 'View unscheduled work', 'primary'),
                ],
              },
        }),
        card({
          id: 'ov-cap',
          title: 'Team capacity',
          sub: 'Read from Staff shifts — not edited here',
          table: d.techs.length
            ? {
                hasActs: true,
                cols: cols([
                  'Technician',
                  'Status',
                  'Today',
                  ['Location', '1'],
                ]),
                rows: d.techs.map((t) => {
                  const dd = this.data.techDay(d, t.id, 0);
                  const hrs = dd.reduce((x, o) => x + o.durMin / 60, 0);
                  const sh = this.data.shiftOn(d, t, 0);
                  const lf = this.data.locFresh(d, t);
                  return row(
                    t.id,
                    [
                      cell({ t: t.name, fw: 700, s: t.skills.join(', ') }),
                      this.stc(st.get(t.id)!),
                      cell({
                        t: `${dd.length} jobs · ${hrs.toFixed(1)} h`,
                        s: sh
                          ? `${Math.round((hrs / (sh[1] - sh[0])) * 100)}% utilised`
                          : 'No shift today',
                      }),
                      cell({
                        t: d.a.dispatch ? (t.lastZone ?? '—') : LOCK,
                        s: d.a.dispatch ? lf.t : '',
                        opt: '1',
                      }),
                    ],
                    ['Open'],
                    [
                      t.name,
                      `${st.get(t.id)} · ${dd.length} jobs`,
                      [this.chip(st.get(t.id)!)],
                    ],
                  );
                }),
              }
            : null,
          empty: d.techs.length
            ? null
            : {
                t: 'No technician profiles',
                d: 'Add skills and territories for your field staff in Settings › Technician policies.',
                acts: [
                  btn('go:settings', 'Open Settings', 'primary', !d.a.settings),
                ],
              },
        }),
      ]),
      R('minmax(0,1fr) minmax(0,1fr)', [
        card({
          title: 'Jobs by status',
          bars: byStatus.length ? mkBars(byStatus, '#12A150') : null,
          empty: byStatus.length
            ? null
            : { t: 'No jobs in scope', d: '', acts: [] },
        }),
        card({
          title: 'Response & duration',
          fields: [
            fRead(
              'Average response (request → arrival)',
              resp.length
                ? `${this.hm(resp.reduce((x, y) => x + y, 0) / resp.length)} (last ${resp.length} jobs)`
                : 'Not enough history',
            ),
            fRead(
              'Average job duration',
              durs.length
                ? `${Math.round(durs.reduce((x, y) => x + y, 0) / durs.length)} min (from labor entries)`
                : '—',
            ),
            fRead(
              'First-time fix definition',
              `Resolved on the first qualifying visit with no repeat field visit on the same asset within ${d.cfg.warranty.repeatWindowDays} days (preventive visits don’t count as repeats)`,
            ),
          ],
        }),
      ]),
    ];
  }
  hm(m: number) {
    const a = Math.round(m);
    return a >= 60 ? `${Math.floor(a / 60)} h ${a % 60} m` : `${a} m`;
  }

  // ===== 2 Requests =========================================================

  entitlement(
    d: Data,
    r: {
      customerId: string;
      serviceTypeId: string | null;
      assetId: string | null;
    },
  ) {
    const g = this.data.activeAgreement(
      d,
      r.customerId,
      r.serviceTypeId,
      r.assetId,
    );
    if (g) return `Agreement ${g.number}`;
    const w = r.assetId
      ? d.warranty.find(
          (x) =>
            x.assetId === r.assetId &&
            !['Closed', 'Rejected', 'Completed'].includes(x.status),
        )
      : undefined;
    if (w) return `Warranty ${w.number}`;
    return 'Chargeable';
  }

  reqActs(d: Data, r: { status: string }) {
    const o = ['Open'];
    if (d.a.request && !REQ_FINAL.includes(r.status))
      o.push(
        'Triage',
        'Convert to work order',
        'Request more information',
        'Reject',
      );
    return o;
  }

  vRequests(d: Data) {
    const all = d.requests;
    const f = d.s.f.req ?? {};
    const q = (f.q ?? '').trim().toLowerCase();
    const cnt = (st: string) => all.filter((r) => r.status === st).length;
    const tri = all
      .filter(
        (r) =>
          r.triagedAt &&
          d.now.getTime() - r.createdAt.getTime() < 30 * 86400000,
      )
      .map((r) => (r.triagedAt!.getTime() - r.createdAt.getTime()) / 60000);
    const kpis = [
      K('r:New', 'New Requests', cnt('New'), '', null, '#2E90FA'),
      K(
        'r:Untriaged',
        'Untriaged',
        cnt('Untriaged') + cnt('New'),
        'Need a triage decision',
        null,
        '#F79009',
      ),
      K(
        'r:urg',
        'Urgent',
        all.filter(
          (r) =>
            ['Emergency', 'Urgent'].includes(r.priority) &&
            !REQ_FINAL.includes(r.status),
        ).length,
        '',
        '#B42318',
        '#F04438',
      ),
      K(
        'r:Awaiting Customer',
        'Awaiting Customer',
        cnt('Awaiting Customer') + cnt('Need More Information'),
        '',
        null,
        '#F79009',
      ),
      K(
        'r:Ready for Work Order',
        'Ready for Work Order',
        cnt('Ready for Work Order'),
        '',
        null,
        '#12A150',
      ),
      K('r:Rejected', 'Rejected', cnt('Rejected'), '', null, '#98A2B3'),
      K(
        'r:tt',
        'Average Triage Time',
        tri.length ? this.hm(tri.reduce((x, y) => x + y, 0) / tri.length) : '—',
        tri.length
          ? `Last 30 days · ${tri.length} triaged`
          : 'Not enough history',
        null,
        '#98A2B3',
      ),
    ];
    if (!all.length)
      return [
        kpiRow(kpis),
        ...emptyRows('No service requests yet.', '', [
          btn('newreq', 'Create First Request', 'primary', !d.a.request),
        ]),
      ];
    const L = all.filter(
      (r) =>
        (!q ||
          [
            r.number,
            this.data.cname(d, r.customerId),
            r.issue,
            this.assetOf(d, r.assetId)?.serial ?? '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(q)) &&
        (!f.st || r.status === f.st) &&
        (!f.prio || r.priority === f.prio) &&
        (!f.ch || r.channel === f.ch),
    );
    const files = new Set<string>();
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'req',
          acts: [btn('newreq', 'New request', 'primary', !d.a.request)],
          filters: {
            search: 'Search request, customer, issue or serial',
            q: f.q ?? '',
            sels: [
              sel2('st', 'Status', f.st, [['', 'Any status'], ...REQ_STATUSES]),
              sel2('prio', 'Priority', f.prio, [
                ['', 'Any priority'],
                ...d.cfg.priorities,
              ]),
              sel2('ch', 'Channel', f.ch, [['', 'Any channel'], ...CHANNELS]),
            ],
            nOn: nOn(f, ['q']) ?? (f.q ? 1 : null),
            count: `${L.length} requests`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Request #',
                  'Customer',
                  ['Site', '1'],
                  ['Asset', '1'],
                  'Issue',
                  ['Service type', '1'],
                  'Channel',
                  'Priority',
                  ['Requested', '1'],
                  'Entitlement',
                  'Status',
                  ['Owner', '1'],
                ]),
                rows: L.map((r) => {
                  const x = this.assetOf(d, r.assetId);
                  return row(
                    r.id,
                    [
                      this.mono(r.number, {
                        s: agoM(this.data.ago(d, r.createdAt)),
                      }),
                      cell({ t: this.data.cname(d, r.customerId) }),
                      cell({
                        t: this.data.site(d, r.siteId)?.zone ?? '—',
                        opt: '1',
                      }),
                      cell({ t: x ? x.name : '—', opt: '1' }),
                      cell({
                        t: r.issue,
                        mw: '240px',
                        s: files.has(r.id) ? 'Photos' : '',
                      }),
                      cell({
                        t: this.data.svName(d, r.serviceTypeId),
                        opt: '1',
                      }),
                      cell({ t: r.channel, s: r.sourceRef ?? '' }),
                      this.prioCell(r.priority),
                      cell({ t: r.window ?? '—', opt: '1' }),
                      cell({ t: this.entitlement(d, r) }),
                      this.stc(
                        r.status,
                        r.status === 'Converted' ||
                          r.status === 'Rejected' ||
                          r.status === 'Sent to Helpdesk'
                          ? (r.outcome ?? '')
                          : '',
                      ),
                      cell({
                        t: r.ownerId
                          ? this.data.tname(d, r.ownerId)
                          : 'Unassigned',
                        opt: '1',
                      }),
                    ],
                    this.reqActs(d, r),
                    [
                      `${r.number} · ${this.data.cname(d, r.customerId)}`,
                      r.issue,
                      [this.chip(r.status)],
                    ],
                  );
                }),
              }
            : null,
          empty: L.length
            ? null
            : {
                t: 'No requests match these filters.',
                d: '',
                acts: [btn('clear:req', 'Clear Filters', 'primary')],
              },
          info: 'Conversations stay in Unified Inbox / Helpdesk — requests keep only the source reference. Triage suggestions never convert a request on their own.',
        }),
      ]),
    ];
  }

  // ===== 3 Work orders ======================================================

  woFiltered(d: Data) {
    const f = d.s.f.wo ?? {};
    const q = (f.q ?? '').trim().toLowerCase();
    const pr = d.cfg.priorities;
    return this.data
      .wosV(d)
      .filter(
        (w) =>
          (!q ||
            [
              w.number,
              this.data.cname(d, w.customerId),
              this.data.tname(d, w.techUserId),
              this.assetOf(d, w.assetId)?.serial ?? '',
              this.data.addr(d, w.siteId, w.customerId),
              this.data.svName(d, w.serviceTypeId),
            ]
              .join(' ')
              .toLowerCase()
              .includes(q)) &&
          (!f.st ||
            (f.st === 'open'
              ? OPEN.includes(w.status)
              : f.st === 'unassigned'
                ? !w.techUserId && OPEN.includes(w.status)
                : w.status === f.st)) &&
          (!f.tech ||
            (f.tech === 'me'
              ? w.techUserId === d.a.userId
              : w.techUserId === f.tech)) &&
          (!f.prio || w.priority === f.prio) &&
          (!f.svc || w.serviceTypeId === f.svc) &&
          (!f.zone || this.data.zoneOf(d, w) === f.zone) &&
          (!f.parts || this.data.ready(d, w) === f.parts) &&
          (!f.sla || this.data.slaSt(d, w) === f.sla) &&
          (!f.agr ||
            (f.agr === 'agr'
              ? !!w.agreementId
              : f.agr === 'wrn'
                ? !!w.warrantyId
                : !w.agreementId && !w.warrantyId)) &&
          (!f.day ||
            (f.day === 'today'
              ? this.data.day(d, w) === 0
              : f.day === 'none'
                ? !w.startAt
                : (this.data.day(d, w) ?? -1) > 0)),
      )
      .sort((a, b) =>
        f.sort === 'sla'
          ? (this.data.slaLeft(d, a) ?? 1e9) - (this.data.slaLeft(d, b) ?? 1e9)
          : f.sort === 'prio'
            ? pr.indexOf(a.priority) - pr.indexOf(b.priority)
            : b.number.localeCompare(a.number),
      );
  }

  vWorkOrders(d: Data) {
    const all = this.data.wosV(d);
    const f = d.s.f.wo ?? {};
    const L = this.woFiltered(d);
    const adv = d.s.view.woCols === 'adv';
    const c = (st: string) => all.filter((w) => w.status === st).length;
    const kpis = [
      K(
        'w:open',
        'Open',
        all.filter((w) => OPEN.includes(w.status)).length,
        '',
        null,
        '#2E90FA',
      ),
      K(
        'w:unassigned',
        'Unassigned',
        all.filter((w) => !w.techUserId && OPEN.includes(w.status)).length,
        '',
        null,
        '#F04438',
      ),
      K(
        'w:Scheduled',
        'Scheduled',
        c('Scheduled') + c('Assigned'),
        '',
        null,
        '#6941C6',
      ),
      K(
        'w:Dispatched',
        'Dispatched',
        c('Dispatched') + c('En Route'),
        '',
        null,
        '#2E90FA',
      ),
      K(
        'w:In Progress',
        'In Progress',
        c('In Progress') + c('Arrived') + c('Paused'),
        '',
        null,
        '#F79009',
      ),
      K(
        'w:Awaiting Parts',
        'Awaiting Parts',
        c('Awaiting Parts'),
        '',
        null,
        '#F04438',
      ),
      K(
        'w:Breached',
        'Overdue',
        all.filter((w) => this.data.slaSt(d, w) === 'Breached').length,
        'SLA breached',
        '#B42318',
        '#F04438',
      ),
      K(
        'w:Completed',
        'Completed Today',
        all.filter(
          (w) =>
            w.status === 'Completed' &&
            w.completedAt &&
            this.data.ddate(d, w.completedAt) === 'Today',
        ).length,
        '',
        null,
        '#12A150',
      ),
      K('w:Cancelled', 'Cancelled', c('Cancelled'), '', null, '#98A2B3'),
    ];
    if (!all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          d.a.techOnly ? 'No jobs assigned to you.' : 'No work orders yet.',
          'Work orders come from requests, Helpdesk, preventive plans or manual creation.',
          [btn('newwo', 'New work order', 'primary', !d.a.workorder)],
        ),
      ];
    const pg = Math.min(
      d.s.page.wo ?? 0,
      Math.max(0, Math.ceil(L.length / 10) - 1),
    );
    const rows = L.slice(pg * 10, pg * 10 + 10);
    const sel = d.a.dispatch;
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'wo',
          seg: seg(
            [
              ['def', 'Default columns'],
              ['adv', 'All columns'],
            ],
            adv ? 'adv' : 'def',
          ),
          acts: [
            btn('newwo', 'New work order', 'primary', !d.a.workorder),
            btn('export', 'Export', 'ghost', !d.a.export),
          ],
          filters: {
            search:
              'Search WO, customer, technician, serial, address or service',
            q: f.q ?? '',
            sels: [
              sel2('view', 'Saved view', f.view, [
                ['', 'Saved views…'],
                ['mine', 'My work orders'],
                ['unassigned', 'Unassigned'],
                ['emergency', 'Emergency'],
                ['today', 'Today’s visits'],
                ['sla', 'SLA at risk'],
                ['parts', 'Waiting parts'],
                ['warranty', 'Warranty jobs'],
                ['agr', 'Agreement jobs'],
                ['ready', 'Ready to dispatch'],
              ]),
              sel2('st', 'Status', f.st, [
                ['', 'Any status'],
                ['open', 'All open'],
                ['unassigned', 'Unassigned'],
                ...Object.keys(WT),
              ]),
              sel2('tech', 'Technician', f.tech, [
                ['', 'Any technician'],
                ...d.techs.map((t) => [t.id, t.name] as [string, string]),
              ]),
              sel2('prio', 'Priority', f.prio, [
                ['', 'Any priority'],
                ...d.cfg.priorities,
              ]),
              sel2('svc', 'Service type', f.svc, [
                ['', 'Any service'],
                ...d.svcList.map((s) => [s.id, s.name] as [string, string]),
              ]),
              sel2('zone', 'Territory', f.zone, [
                ['', 'Any territory'],
                ...d.cfg.territories,
              ]),
              sel2('parts', 'Parts readiness', f.parts, [
                ['', 'Any parts state'],
                'Ready',
                'Partial',
                'Missing',
                'None',
                'Unavailable',
              ]),
              sel2('sla', 'SLA', f.sla, [
                ['', 'Any SLA'],
                'Healthy',
                'Warning',
                'At Risk',
                'Breached',
                'Paused',
                'Met',
              ]),
              sel2('agr', 'Coverage', f.agr, [
                ['', 'Any coverage'],
                ['agr', 'Service agreement'],
                ['wrn', 'Warranty'],
                ['none', 'Chargeable'],
              ]),
              sel2('day', 'Date', f.day, [
                ['', 'Any date'],
                ['today', 'Today'],
                ['future', 'Upcoming'],
                ['none', 'Not scheduled'],
              ]),
              sel2('sort', 'Sort', f.sort, [
                ['', 'Newest'],
                ['sla', 'SLA soonest'],
                ['prio', 'Priority'],
              ]),
            ],
            nOn: nOn(f, ['sort', 'view', 'q']),
            count: `${L.length} work orders`,
          },
          bulk: sel
            ? {
                acts: [
                  btn('bk-assign', 'Bulk assign'),
                  btn('bk-sched', 'Bulk schedule'),
                  btn('bk-status', 'Bulk status'),
                ],
              }
            : null,
          table: L.length
            ? {
                sel,
                hasActs: true,
                cols: cols([
                  'WO #',
                  'Customer',
                  ['Asset', '1'],
                  ['Service', '1'],
                  'Priority',
                  'Status',
                  'Technician',
                  'Window',
                  'Parts',
                  'SLA',
                  ...(adv
                    ? [
                        'Agreement',
                        'Warranty',
                        'Quote',
                        'Invoice',
                        'Duration',
                        'Created',
                      ]
                    : []),
                ]),
                rows: rows.map((w) =>
                  row(
                    w.id,
                    [
                      ...this.woCells(d, w),
                      ...(adv
                        ? [
                            cell({
                              t:
                                d.agreements.find((g) => g.id === w.agreementId)
                                  ?.number ?? '—',
                            }),
                            cell({
                              t:
                                d.warranty.find((x) => x.id === w.warrantyId)
                                  ?.number ?? '—',
                            }),
                            cell({
                              t: w.quoteOrderId
                                ? `#${d.orders.get(w.quoteOrderId)?.orderNo ?? '—'}`
                                : '—',
                            }),
                            cell({
                              t: w.invoiceOrderId
                                ? `#${d.orders.get(w.invoiceOrderId)?.orderNo ?? '—'} · ${this.data.payState(d, w)}`
                                : '—',
                            }),
                            cell({ t: `${w.durMin} min` }),
                            cell({ t: this.data.ddate(d, w.createdAt) }),
                          ]
                        : []),
                    ],
                    this.woActs(d, w),
                    this.woMobile(d, w),
                  ),
                ),
              }
            : null,
          pager:
            L.length > 10
              ? {
                  t: `Showing ${pg * 10 + 1}–${Math.min(L.length, pg * 10 + 10)} of ${L.length}`,
                  noPrev: pg === 0,
                  noNext: (pg + 1) * 10 >= L.length,
                }
              : null,
          empty: L.length
            ? null
            : {
                t: 'No work orders match these filters.',
                d: '',
                acts: [btn('clear:wo', 'Clear Filters', 'primary')],
              },
          info: 'Status changes follow the validated lifecycle (no jumps). Bulk changes validate every row and list what was skipped.',
        }),
      ]),
    ];
  }

  // ===== 4 Dispatch =========================================================

  vDispatch(d: Data) {
    const day = d.s.dDay;
    const F = d.s.f.dsp ?? {};
    const q = (F.q ?? '').toLowerCase();
    const techs = d.techs
      .filter((t) => !F.skill || t.skills.includes(F.skill))
      .filter((t) => !d.s.zone || t.zones.includes(d.s.zone));
    const unas = this.data
      .wosV(d)
      .filter(
        (w) =>
          OPEN.includes(w.status) &&
          (!w.techUserId || !w.startAt) &&
          !['Draft', 'Open', 'Awaiting Approval'].includes(w.status),
      )
      .filter(
        (w) =>
          !q ||
          `${w.number}${this.data.cname(d, w.customerId)}`
            .toLowerCase()
            .includes(q),
      );
    const sort = F.sort || 'sla';
    const pr = d.cfg.priorities;
    unas.sort((a, b) =>
      sort === 'prio'
        ? pr.indexOf(a.priority) - pr.indexOf(b.priority)
        : sort === 'parts'
          ? (this.data.ready(d, a) === 'Ready' ? 0 : 1) -
            (this.data.ready(d, b) === 'Ready' ? 0 : 1)
          : (this.data.slaLeft(d, a) ?? 1e9) - (this.data.slaLeft(d, b) ?? 1e9),
    );
    const lanes = techs.map((t) => {
      const dd = this.data.techDay(d, t.id, day);
      const hrs = dd.reduce((x, o) => x + o.durMin / 60, 0);
      const sh = this.data.shiftOn(d, t, day);
      const st = this.data.techStatus(d, t);
      return row(
        t.id,
        [
          cell({
            t: t.name,
            fw: 800,
            fg: '#101828',
            s: `${t.skills.join(', ')} · ${sh ? `${hh(sh[0])}–${hh(sh[1])}` : 'no shift'}`,
          }),
          this.stc(day === 0 ? st : sh ? 'Available' : 'Off Duty'),
          cell({
            t: `${hrs.toFixed(1)} h`,
            s: sh ? `${Math.round((hrs / (sh[1] - sh[0])) * 100)}%` : '',
          }),
          ...SLOTS.map(([a, b]) => {
            const jobs = dd.filter(
              (o) =>
                this.data.h(d, o)! < b &&
                this.data.h(d, o)! + o.durMin / 60 > a,
            );
            const out = !sh || a < sh[0] || a >= sh[1];
            return cell({
              t:
                jobs
                  .map(
                    (o) =>
                      `${o.number.slice(-3)} ${this.data.cname(d, o.customerId).split(' ')[0]}`,
                  )
                  .join(' · ') || (out ? '— off shift' : '·'),
              s: jobs
                .map((o) => `${hh(this.data.h(d, o))} ${o.status}`)
                .join(' · '),
              fg: jobs.some((o) =>
                ['At Risk', 'Breached'].includes(this.data.slaSt(d, o)),
              )
                ? '#B42318'
                : out
                  ? '#98A2B3'
                  : '#344054',
              fw: jobs.length ? 700 : 400,
            });
          }),
        ],
        d.a.readOnly || !d.a.dispatch
          ? ['Open technician']
          : [
              'Open technician',
              'Notify technician',
              ...dd
                .filter((o) => o.status === 'Assigned')
                .map((o) => `Dispatch ${o.number}`),
            ],
        [
          `${t.name} · ${st}`,
          dd.map((o) => `${hh(this.data.h(d, o))} ${o.number}`).join(', ') ||
            'No jobs',
          [this.chip(st)],
        ],
      );
    });
    const dayOpts: [string, string][] = [
      ['0', 'Today'],
      ['1', 'Tomorrow'],
      ['2', this.data.dday(d, 2)],
      ['3', this.data.dday(d, 3)],
    ];
    return [
      R('minmax(0,1fr)', [
        card({
          id: 'dsp-q',
          title: 'Unassigned queue',
          sub: `${unas.length} jobs ready to plan · use Assign (keyboard-accessible) — every assignment is validated first`,
          filters: {
            search: 'Search queue',
            q: F.q ?? '',
            sels: [
              sel2('sort', 'Sort by', sort, [
                ['sla', 'SLA soonest'],
                ['prio', 'Urgency'],
                ['parts', 'Parts readiness'],
              ]),
              sel2('skill', 'Skill', F.skill, [
                ['', 'Any skill'],
                ...d.cfg.skills,
              ]),
              sel2('day', 'Day', String(day), dayOpts),
            ],
            nOn: null,
            count: '',
          },
          table: unas.length
            ? {
                hasActs: true,
                cols: cols([
                  'WO',
                  'Customer / area',
                  'Service · skill',
                  'Priority',
                  'Duration',
                  'Parts',
                  'SLA',
                  'Best suggestion',
                ]),
                rows: unas.map((w) => {
                  const h = this.data.nextSlotAny(d, w, day);
                  const best = d.cfg.dispatch.autoSuggest
                    ? this.data
                        .suggest(d, w, day, h)
                        .find((x) => !x.e.blocks.length)
                    : undefined;
                  const sv = this.data.sv(d, w.serviceTypeId);
                  return row(
                    w.id,
                    [
                      this.mono(w.number),
                      cell({
                        t: this.data.cname(d, w.customerId),
                        s: this.data.zoneOf(d, w),
                      }),
                      cell({
                        t: sv?.name ?? '—',
                        s: `${sv?.skill ?? '—'}${sv?.cert ? ` + ${sv.cert}` : ''}`,
                      }),
                      this.prioCell(w.priority),
                      cell({ t: `${w.durMin} min` }),
                      this.stc(this.data.ready(d, w)),
                      this.slaCell(d, w),
                      d.cfg.dispatch.autoSuggest
                        ? cell({
                            t: best
                              ? `${best.t.name} · ${best.e.score}/100`
                              : 'No eligible technician',
                            s: best
                              ? `${hh(h)} · ${best.e.tr ?? '—'} min travel`
                              : '',
                            fg: best ? '#0E8442' : '#B42318',
                            fw: 700,
                          })
                        : cell({
                            t: 'Suggestions off (Settings › Dispatch rules)',
                            fg: '#667085',
                          }),
                    ],
                    d.a.readOnly || !d.a.dispatch
                      ? ['Open']
                      : ['Assign', 'Suggest technician', 'Open'],
                    [
                      `${w.number} · ${this.data.cname(d, w.customerId)}`,
                      `${sv?.name ?? '—'} · ${w.priority}`,
                      [this.chip(this.data.slaSt(d, w))],
                    ],
                  );
                }),
              }
            : null,
          empty: unas.length
            ? null
            : {
                t: 'Queue is clear',
                d: 'Every approved job has a technician and time.',
                acts: [],
              },
          acts: [
            btn('dsp-opt', 'Optimize suggestions', 'ghost', !d.a.dispatch),
            btn(
              'dsp-lock',
              d.cfg.lock ? 'Unlock dispatch' : 'Lock dispatch',
              'ghost',
              !d.a.approve,
            ),
            btn('go:map', 'Open map'),
          ],
        }),
      ]),
      R('minmax(0,1fr)', [
        card({
          id: 'dsp-l',
          title: `Technician lanes · ${this.data.dday(d, day)}`,
          sub: `${d.cfg.lock ? `🔒 Dispatch locked by ${d.cfg.lock.by} — only managers can change assignments. ` : ''}Shift and availability come from Staff. Red = SLA risk.`,
          table: lanes.length
            ? {
                hasActs: true,
                cols: cols([
                  'Technician',
                  'Status',
                  'Load',
                  ...SLOTS.map(([a, b]) => `${hh(a)}–${hh(b)}`),
                ]),
                rows: lanes,
              }
            : null,
          empty: lanes.length
            ? null
            : {
                t: 'No technicians',
                d: 'Add technician profiles (skills, territories) in Settings › Technician policies.',
                acts: [
                  btn('go:settings', 'Open Settings', 'primary', !d.a.settings),
                ],
              },
        }),
      ]),
    ];
  }

  // ===== 5 Calendar =========================================================

  vCalendar(d: Data) {
    const v = d.s.view.calView || 'day';
    const all = this.data
      .wosV(d)
      .filter((w) => w.startAt && w.status !== 'Cancelled');
    const sg = seg(
      [
        ['day', 'Day'],
        ['week', 'Week'],
        ['month', 'Month'],
        ['tech', 'Technician'],
      ],
      v,
    );
    const acts = [
      btn(
        'go:dispatch',
        'Assign technician',
        'ghost',
        !this.allowed(d.a, 'dispatch'),
      ),
    ];
    if (v === 'day' || v === 'tech') {
      const day = d.s.dDay;
      const L = all
        .filter((w) => this.data.day(d, w) === day)
        .sort((a, b) =>
          v === 'tech'
            ? this.data
                .tname(d, a.techUserId)
                .localeCompare(this.data.tname(d, b.techUserId)) ||
              this.data.h(d, a)! - this.data.h(d, b)!
            : this.data.h(d, a)! - this.data.h(d, b)!,
        );
      return [
        R('minmax(0,1fr)', [
          card({
            id: 'cal',
            seg: sg,
            acts,
            title: `${this.data.dday(d, day)}${v === 'tech' ? ' · by technician' : ''}`,
            filters: {
              search: null,
              sels: [
                sel2('day', 'Day', String(day), [
                  ['0', 'Today'],
                  ['1', 'Tomorrow'],
                  ['-1', 'Yesterday'],
                  ['2', this.data.dday(d, 2)],
                  ['3', this.data.dday(d, 3)],
                ]),
              ],
              nOn: null,
              count: `${L.length} appointments`,
            },
            table: L.length
              ? {
                  hasActs: true,
                  cols: cols([
                    'Time',
                    'WO',
                    'Customer',
                    ['Site', '1'],
                    'Technician',
                    'Service',
                    'Duration',
                    'Status',
                    'Priority',
                  ]),
                  rows: L.map((w) => {
                    const h = this.data.h(d, w)!;
                    return row(
                      w.id,
                      [
                        cell({
                          t: `${hh(h)}–${hh(h + w.durMin / 60)}`,
                          fw: 800,
                        }),
                        cell({ t: w.number, ff: 'ui-monospace,monospace' }),
                        cell({ t: this.data.cname(d, w.customerId) }),
                        cell({ t: this.data.zoneOf(d, w), opt: '1' }),
                        cell({ t: this.data.tname(d, w.techUserId) }),
                        cell({ t: this.data.svName(d, w.serviceTypeId) }),
                        cell({ t: `${w.durMin} min` }),
                        this.stc(w.status),
                        this.prioCell(w.priority),
                      ],
                      d.a.readOnly
                        ? ['Open work order']
                        : [
                            'Open work order',
                            'Reschedule',
                            'Notify customer',
                            'Cancel',
                          ],
                      this.woMobile(d, w),
                    );
                  }),
                }
              : null,
            empty: L.length
              ? null
              : {
                  t: 'No work orders are scheduled for this day.',
                  d: '',
                  acts: [
                    btn('go:dispatch', 'View unscheduled work', 'primary'),
                  ],
                },
            info: 'Field visits are scheduled here; they are not copied into Bookings (Bookings keeps service appointments).',
          }),
        ]),
      ];
    }
    const wd = wall(d.now, d.tz).wd;
    const start = v === 'week' ? -wd : -wd - 7;
    const n = v === 'week' ? 7 : 35;
    const days: {
      d: string;
      bd: string;
      bg: string;
      fw: number;
      fg: string;
      items: { id: string; t: string; bg: string; fg: string }[];
    }[] = [];
    for (let i = 0; i < n; i++) {
      const off = start + i;
      const items = all
        .filter((w) => this.data.day(d, w) === off)
        .sort((a, b) => this.data.h(d, a)! - this.data.h(d, b)!)
        .map((w) => {
          const risk = ['At Risk', 'Breached'].includes(this.data.slaSt(d, w));
          return {
            id: w.id,
            t: `${hh(this.data.h(d, w))} ${w.number.slice(-3)} ${this.data.cname(d, w.customerId).split(' ')[0]}`,
            bg: risk ? '#FEF3F2' : '#EFF8FF',
            fg: risk ? '#B42318' : '#175CD3',
          };
        });
      days.push({
        d: this.data.dday(d, off),
        bd: off === 0 ? '#12A150' : '#E6EAF0',
        bg: off < 0 ? '#FAFBFC' : '#fff',
        fw: off === 0 ? 800 : 600,
        fg: off === 0 ? '#0E8442' : '#475467',
        items,
      });
    }
    return [
      R('minmax(0,1fr)', [
        card({
          id: 'cal-g',
          seg: sg,
          acts,
          title: v === 'week' ? 'This week' : 'Month',
          cal: {
            aria: 'Service calendar',
            head: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            days,
          },
        }),
      ]),
    ];
  }

  // ===== 6 Map ==============================================================

  vMap(d: Data) {
    if (!d.a.dispatch)
      return emptyRows(
        'Technician locations are restricted',
        'Location is visible only to dispatchers and managers, during shifts, per company policy.',
        [btn('go:workorders', 'Open work orders', 'primary')],
      );
    const f = d.s.f.map ?? {};
    const wos = this.data
      .wosV(d)
      .filter((w) => OPEN.includes(w.status) && w.status !== 'Draft')
      .filter(
        (w) =>
          (!f.st || w.status === f.st) && (!f.prio || w.priority === f.prio),
      );
    const techs = d.techs.filter((t) => !f.tech || t.id === f.tech);
    const zones = d.cfg.territories
      .filter((z) => !d.s.zone || z === d.s.zone)
      .map((z) => {
        const tz = techs.filter(
          (t) =>
            t.lastZone === z && this.data.locFresh(d, t).st !== 'Tracking off',
        );
        const jz = wos.filter((w) => this.data.zoneOf(d, w) === z);
        const un = jz.filter((w) => !w.techUserId).length;
        return {
          id: z,
          t: z,
          d: `${tz.map((t) => `◉ ${t.name.split(' ')[0]} (${this.data.locFresh(d, t).st.toLowerCase()})`).join(' · ') || 'No technicians here'} | ${jz.map((w) => `${['Emergency', 'Urgent'].includes(w.priority) ? '▲' : '●'} ${w.number.slice(-3)}`).join(' ') || 'No open jobs'}`,
          badge: un ? `${un} unassigned` : `${jz.length} jobs`,
          bbg: un ? '#FEF3F2' : '#F2F4F7',
          bfg: un ? '#B42318' : '#344054',
          bg: '#fff',
          aria: `Territory ${z}`,
          stats: [
            { l: 'Technicians', v: String(tz.length), fg: '#101828' },
            { l: 'Open jobs', v: String(jz.length), fg: '#101828' },
            {
              l: 'SLA risk',
              v: String(
                jz.filter((w) =>
                  ['At Risk', 'Breached'].includes(this.data.slaSt(d, w)),
                ).length,
              ),
              fg: '#B42318',
            },
          ],
        };
      });
    return [
      R('minmax(0,1fr)', [
        card({
          id: 'map-z',
          title: 'Territories',
          sub: 'Zone board with text markers (◉ technician at last check-in · ● job · ▲ urgent). No map tiles or GPS — technician location is the territory of their last on-site check-in.',
          filters: {
            search: null,
            sels: [
              sel2('tech', 'Technician', f.tech, [
                ['', 'Any technician'],
                ...d.techs.map((t) => [t.id, t.name] as [string, string]),
              ]),
              sel2('st', 'Job status', f.st, [
                ['', 'Any open status'],
                ...OPEN,
              ]),
              sel2('prio', 'Priority', f.prio, [
                ['', 'Any priority'],
                ...d.cfg.priorities,
              ]),
            ],
            nOn: nOn(f),
            count: '',
          },
          qcards: zones.length ? zones : null,
          empty: zones.length
            ? null
            : {
                t: 'No territories',
                d: 'Add territories in Settings › Territories.',
                acts: [
                  btn('go:settings', 'Open Settings', 'primary', !d.a.settings),
                ],
              },
        }),
      ]),
      R('minmax(0,1fr) minmax(0,1fr)', [
        card({
          id: 'map-t',
          title: 'Technicians',
          table: techs.length
            ? {
                hasActs: true,
                cols: cols([
                  'Technician',
                  'Status',
                  'Last location',
                  'Current / next WO',
                  'ETA',
                ]),
                rows: techs.map((t) => {
                  const lf = this.data.locFresh(d, t);
                  const dd = this.data
                    .techDay(d, t.id, 0)
                    .sort((a, b) => this.data.h(d, a)! - this.data.h(d, b)!);
                  const cur = d.wos.find(
                    (o) =>
                      o.techUserId === t.id &&
                      ['En Route', 'Arrived', 'In Progress'].includes(o.status),
                  );
                  const nx = dd.find((o) =>
                    ['Assigned', 'Dispatched', 'Scheduled'].includes(o.status),
                  );
                  const st = this.data.techStatus(d, t);
                  const c = this.chip(lf.st);
                  return row(
                    t.id,
                    [
                      cell({ t: t.name, fw: 700 }),
                      this.stc(st),
                      cell({
                        bt:
                          lf.st === 'Fresh'
                            ? `● ${t.lastZone}`
                            : lf.st === 'Stale'
                              ? `⧗ ${t.lastZone}`
                              : '○ Not shared',
                        bfg: c.fg,
                        bbg: c.bg,
                        s: lf.t,
                      }),
                      cell({
                        t: `${cur ? `${cur.number} (${cur.status})` : '—'}${nx ? ` → ${nx.number}` : ''}`,
                        s: nx ? this.data.cname(d, nx.customerId) : '',
                      }),
                      cell({
                        t:
                          cur && cur.status === 'En Route'
                            ? lf.st === 'Fresh'
                              ? `${this.data.travel(d, t.lastZone, this.data.zoneOf(d, cur)) ?? '—'} min (zone estimate)`
                              : 'ETA unavailable (stale)'
                            : '—',
                      }),
                    ],
                    [
                      'Open technician',
                      ...(d.a.dispatch
                        ? ['Contact technician', 'View route']
                        : []),
                    ],
                    [
                      t.name,
                      `${st} · ${lf.t}`,
                      [this.chip(st), this.chip(lf.st)],
                    ],
                  );
                }),
              }
            : null,
          empty: techs.length ? null : { t: 'No technicians', d: '', acts: [] },
        }),
        card({
          id: 'map-j',
          title: 'Open jobs',
          table: wos.length
            ? {
                hasActs: true,
                cols: cols([
                  'WO',
                  'Customer',
                  'Address',
                  'Priority',
                  'Technician',
                  'Status',
                ]),
                rows: wos.map((w) =>
                  row(
                    w.id,
                    [
                      this.mono(w.number),
                      cell({ t: this.data.cname(d, w.customerId) }),
                      cell({
                        t: this.data.addr(d, w.siteId, w.customerId),
                        s: this.data.zoneOf(d, w),
                        mw: '200px',
                      }),
                      this.prioCell(w.priority),
                      cell({ t: this.data.tname(d, w.techUserId) }),
                      this.stc(w.status),
                    ],
                    [
                      'Open work order',
                      ...(!w.techUserId && d.a.dispatch
                        ? ['Assign nearest suitable']
                        : d.a.dispatch
                          ? ['Reassign']
                          : []),
                    ],
                    this.woMobile(d, w),
                  ),
                ),
              }
            : null,
          empty: wos.length ? null : { t: 'No open jobs', d: '', acts: [] },
        }),
      ]),
    ];
  }

  // ===== 7 Work order detail =================================================

  primaryAct(d: Data, w: W) {
    const m: Record<string, string> = {
      Draft: 'Submit',
      Open: 'Approve',
      'Awaiting Approval': 'Approve',
      Approved: 'Assign',
      Scheduled: 'Assign',
      Assigned: 'Dispatch',
      Dispatched: 'Start travel',
      'En Route': 'Arrived',
      Arrived: 'Start job',
      'In Progress': 'Complete work',
      Paused: 'Resume',
      'Awaiting Parts': 'Resume',
      'Awaiting Customer': 'Schedule',
      Completed: 'Close',
      Closed: 'Reopen',
    };
    const x = m[w.status];
    const a = d.a;
    if (!x) return null;
    if (['Approve', 'Close'].includes(x) && !a.approve) return null;
    if (x === 'Reopen' && !a.approve && !a.workorder) return null;
    if (['Assign', 'Dispatch', 'Schedule'].includes(x) && !a.dispatch)
      return null;
    if (x === 'Submit' && !a.workorder) return null;
    if (
      [
        'Start travel',
        'Arrived',
        'Start job',
        'Complete work',
        'Resume',
      ].includes(x) &&
      (!a.execute || (w.techUserId !== a.userId && !a.dispatch && !a.approve))
    )
      return null;
    return x;
  }
  partActs(d: Data, w: W, p: WPart) {
    const o: string[] = [];
    const st = this.data.partSt(d, p);
    const a = d.a;
    if (['Closed', 'Cancelled'].includes(w.status)) return ['View inventory'];
    if (a.parts && ['Needed', 'Requested', 'Missing'].includes(st))
      o.push('Reserve');
    if (a.parts && ['Reserved', 'Needed', 'Requested'].includes(st))
      o.push('Issue');
    if ((a.execute || a.parts) && p.issued - p.used - p.returned > 0)
      o.push('Use', 'Return');
    if (a.parts && st === 'Missing' && !p.purchaseOrderId)
      o.push('Create procurement request');
    o.push('View inventory');
    return o;
  }
  durOf(d: Data, l: { startAt: Date; endAt: Date | null; breakMin: number }) {
    const m = l.endAt
      ? Math.round(
          (l.endAt.getTime() - l.startAt.getTime()) / 60000 - l.breakMin,
        )
      : Math.round((d.now.getTime() - l.startAt.getTime()) / 60000);
    return {
      m,
      t: l.endAt ? `${Math.floor(m / 60)}h ${m % 60}m` : `running ${m} min`,
    };
  }

  async events(d: Data, woId: string): Promise<FsEvent[]> {
    return this.ctx.db.fsEvent.findMany({
      where: { businessId: d.a.rootId, woId },
      orderBy: { createdAt: 'asc' },
    });
  }
  async filesOf(d: Data, woId: string): Promise<FsFile[]> {
    return this.ctx.db.fsFile.findMany({
      where: { businessId: d.a.rootId, woId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async vDetail(d: Data) {
    const w = this.data.W(d, d.s.cur);
    if (!w || !this.data.woVisible(d, w))
      return emptyRows(
        w ? 'This work order isn’t assigned to you' : 'Work order not found',
        w ? 'Technicians only see their own jobs.' : '',
        [
          btn(
            d.a.techOnly ? 'go:technician' : 'go:workorders',
            'Back',
            'primary',
          ),
        ],
      );
    const tab = d.s.view.wTab || 'ov';
    const x = this.assetOf(d, w.assetId);
    const si = this.data.site(d, w.siteId);
    const cu = d.customers.get(w.customerId);
    const sv = this.data.sv(d, w.serviceTypeId);
    const tp = this.data.tplOf(d, w);
    const items = this.data.tplItems(tp);
    const ans = this.data.answers(w);
    const nx = this.primaryAct(d, w);
    const sl = this.data.slaSt(d, w);
    const photos = this.data.photos(d, w.id);
    const kp = [
      K(
        'wt:ov',
        'Status',
        w.status,
        `v${w.version}`,
        null,
        this.chip(w.status).fg,
      ),
      K(
        'wt:sched',
        'Window',
        this.data.win(d, w),
        this.data.tname(d, w.techUserId),
        null,
        '#6941C6',
      ),
      K(
        'wt:sla',
        'SLA',
        sl,
        this.data.slaText(d, w),
        ['At Risk', 'Breached'].includes(sl) ? '#B42318' : null,
        '#F04438',
      ),
      K(
        'wt:parts',
        'Parts',
        this.data.ready(d, w),
        `${w.parts.length} lines`,
        null,
        '#F79009',
      ),
      K(
        'wt:chk',
        'Checklist',
        `${ans.filter((v) => v != null && v !== '').length} / ${items.length}`,
        tp ? `${tp.name} v${tp.version}` : 'No checklist',
        null,
        '#12A150',
      ),
      K(
        'wt:proof',
        'Customer proof',
        w.signedBy ? 'Signed' : 'Not captured',
        w.signedBy ?? sv?.proof ?? '',
        null,
        '#2E90FA',
      ),
    ];
    const head = card({
      id: 'w-h',
      title: `${w.number} · ${sv?.name ?? '—'}`,
      sub: `${this.data.cname(d, w.customerId)} · ${this.data.addr(d, w.siteId, w.customerId)} · ${w.priority} priority`,
      acts: [
        btn(d.a.techOnly ? 'go:technician' : 'go:workorders', '← Back'),
        ...(nx ? [btn(`w:${nx}`, nx, 'primary')] : []),
        btn('w:report', 'Service report'),
        btn('w:more', 'More actions'),
      ],
      seg: seg(
        [
          ['ov', 'Overview'],
          ['site', 'Customer & site'],
          ['asset', 'Asset'],
          ['sched', 'Schedule'],
          ['chk', 'Checklist'],
          ['parts', 'Parts', w.parts.length],
          ['labor', 'Labor'],
          ['files', 'Photos'],
          ['tl', 'Timeline'],
          ['proof', 'Proof'],
          ['fin', 'Financial'],
          ['hist', 'History'],
        ],
        tab,
      ),
    });
    const T = (
      c: (string | [string, string?])[],
      rows: ReturnType<typeof row>[],
      acts?: boolean,
    ) => ({ hasActs: !!acts, cols: cols(c), rows });
    let body: ReturnType<typeof card>;
    if (tab === 'site')
      body = card({
        id: 'w-site',
        title: 'Customer & site (CRM record)',
        fields: [
          fRead('Customer', cu ? cu.name : '—'),
          fRead('Phone', this.phone(d, w.customerId)),
          fRead('Email', d.a.pii ? cu?.email || '—' : LOCK),
          fRead(
            'Address',
            si ? `${si.address}, ${si.zone}` : cu?.address || '—',
          ),
          fRead('Access instructions', si?.access || '—'),
          fRead('Safety', si?.safety || '—'),
        ],
        acts: [btn('ext:customers', 'Open in CRM')],
        info: 'Identity is edited only in Customers CRM.',
      });
    else if (tab === 'asset')
      body = x
        ? card({
            id: 'w-asset',
            title: `${x.name} (Assets & Maintenance)`,
            fields: [
              fRead(
                'Serial / model',
                `${x.serial || 'Serial not recorded'} · ${[x.manufacturer, x.model].filter(Boolean).join(' ') || '—'}`,
              ),
              fRead(
                'Installed',
                x.installedOn ? x.installedOn.toISOString().slice(0, 10) : '—',
              ),
              fRead(
                'Warranty',
                !x.warrantyEnd
                  ? 'None on record'
                  : x.warrantyEnd < d.now
                    ? `Expired ${x.warrantyEnd.toISOString().slice(0, 10)}`
                    : `Until ${x.warrantyEnd.toISOString().slice(0, 10)}`,
              ),
              fRead(
                'Last service',
                (() => {
                  const last = d.wos
                    .filter(
                      (o) =>
                        o.assetId === x.id && o.id !== w.id && o.completedAt,
                    )
                    .sort(
                      (a, b) =>
                        b.completedAt!.getTime() - a.completedAt!.getTime(),
                    )[0];
                  return last
                    ? `${this.data.ddate(d, last.completedAt)} · ${last.number}`
                    : '—';
                })(),
              ),
              fRead(
                'Service history',
                d.wos
                  .filter((o) => o.assetId === x.id && o.id !== w.id)
                  .map((o) => `${o.number} ${o.status}`)
                  .join(' · ') || 'None',
              ),
            ],
            acts: [btn(`ext:asset:${x.id}`, 'Open asset')],
          })
        : card({
            empty: {
              t: 'No asset linked',
              d: 'Link customer equipment from Assets & Maintenance (customer-owned assets).',
              acts: [],
            },
          });
    else if (tab === 'sched')
      body = card({
        id: 'w-sched',
        title: 'Schedule & technician',
        fields: [
          fRead('Window', this.data.win(d, w)),
          fRead(
            'Technician',
            `${this.data.tname(d, w.techUserId)}${w.techUserId && this.data.tech(d, w.techUserId) ? ` · ${this.data.tech(d, w.techUserId)!.skills.join(', ')}` : ''}`,
          ),
          fRead(
            'Required skill',
            `${sv?.skill ?? '—'}${sv?.cert ? ` + ${sv.cert}` : ''}`,
          ),
          fRead('Estimated duration', `${w.durMin} min`),
          fRead(
            'Booking reference',
            'Not created — field visits are scheduled here and aren’t copied into Bookings',
          ),
          fBtns('', [
            btn(
              'w:Assign',
              w.techUserId ? 'Reassign' : 'Assign',
              'primary',
              !d.a.dispatch,
            ),
            btn('w:Schedule', 'Reschedule', 'ghost', !d.a.dispatch),
          ]),
        ],
      });
    else if (tab === 'chk')
      body = card({
        id: 'w-chk',
        title: tp ? `${tp.name} · v${tp.version}` : 'No checklist',
        sub: 'Required items need an answer; photo items need evidence.',
        table: tp
          ? T(
              ['#', 'Item', 'Type', 'Required', 'Evidence', 'Result'],
              items.map((it, i) =>
                row(
                  `${w.id}|${i}`,
                  [
                    cell({ t: String(i + 1) }),
                    cell({
                      t: it.t,
                      fw: 700,
                      s:
                        ((w.checklistNotes as Record<string, string>) ?? {})[
                          String(i)
                        ] ?? '',
                    }),
                    cell({ t: it.type }),
                    cell({ t: it.req ? 'Yes' : 'No' }),
                    cell({
                      t: it.ev
                        ? photos.length
                          ? 'Photo attached'
                          : 'Photo needed'
                        : '—',
                    }),
                    ans[i] == null || ans[i] === ''
                      ? this.stc('Pending')
                      : ans[i] === 'na'
                        ? this.stc('N/A')
                        : ans[i] === 1
                          ? this.stc('Passed')
                          : ans[i] === 0
                            ? this.stc('Failed')
                            : cell({ t: String(ans[i]), fw: 700 }),
                  ],
                  d.a.execute && ['Arrived', 'In Progress'].includes(w.status)
                    ? ['Pass', 'Fail', 'N/A', 'Record value']
                    : [],
                  [it.t, it.type, []],
                ),
              ),
              true,
            )
          : null,
        empty: tp
          ? null
          : {
              t: 'No checklist on this service type',
              d: 'Publish a checklist template for it in Inspections › Templates.',
              acts: [],
            },
      });
    else if (tab === 'parts')
      body = card({
        id: 'w-parts',
        acts: [
          btn(
            'w:Add part',
            'Add part',
            'ghost',
            !d.a.parts && !d.a.execute && !d.a.workorder,
          ),
        ],
        table: w.parts.length
          ? T(
              [
                'Part',
                'SKU',
                'Required',
                'Reserved',
                'Issued',
                'Used',
                'Returned',
                'Status',
                ...(d.a.money ? ['Unit cost'] : []),
              ],
              w.parts.map((p) => {
                const pr = d.products.get(p.productId);
                return row(
                  `${w.id}|${p.id}`,
                  [
                    cell({ t: this.data.partName(d, p.productId), fw: 700 }),
                    cell({ t: pr?.sku ?? '—', ff: 'ui-monospace,monospace' }),
                    cell({ t: String(p.required) }),
                    cell({ t: String(p.reserved) }),
                    cell({ t: String(p.issued) }),
                    cell({ t: String(p.used) }),
                    cell({ t: String(p.returned) }),
                    this.stc(this.data.partSt(d, p)),
                    ...(d.a.money
                      ? [cell({ t: this.data.money(d, pr?.cost) })]
                      : []),
                  ],
                  this.partActs(d, w, p),
                  [
                    this.data.partName(d, p.productId),
                    `${p.used}/${p.required} used`,
                    [this.chip(this.data.partSt(d, p))],
                  ],
                );
              }),
              true,
            )
          : null,
        empty: w.parts.length
          ? null
          : { t: 'No parts on this job', d: '', acts: [] },
        info: 'Listing a part never moves stock. Reservations are held here; issuing and returning write real Inventory movements.',
      });
    else if (tab === 'labor') {
      const L = d.labor.filter((l) => l.woId === w.id);
      body = card({
        id: 'w-labor',
        acts: [btn('w:Add labor', 'Add labor', 'ghost', !d.a.execute)],
        table: L.length
          ? T(
              [
                'Technician',
                'Type',
                'Start',
                'End',
                'Break',
                'Duration',
                'Billable',
                'Status',
              ],
              L.map((l) =>
                row(
                  l.id,
                  [
                    cell({ t: this.data.tname(d, l.techUserId) }),
                    cell({ t: l.type }),
                    cell({ t: d.fmt.dtm(l.startAt) }),
                    cell({ t: l.endAt ? d.fmt.dtm(l.endAt) : 'running' }),
                    cell({ t: `${l.breakMin} min` }),
                    cell({ t: this.durOf(d, l).t }),
                    cell({ t: l.billable ? 'Yes' : 'No' }),
                    this.stc(l.status),
                  ],
                  [],
                  [l.type, this.durOf(d, l).t, [this.chip(l.status)]],
                ),
              ),
            )
          : null,
        empty: L.length ? null : { t: 'No labor captured', d: '', acts: [] },
      });
    } else if (tab === 'files') {
      const F = await this.filesOf(d, w.id);
      const by = (s: string) => F.filter((f) => f.stage === s);
      body = card({
        id: 'w-files',
        title: 'Photos & documents',
        fields: [
          fRead(
            'Before',
            by('before')
              .map((f) => f.name)
              .join(', ') || 'Not uploaded',
          ),
          fRead(
            'During',
            by('during')
              .map((f) => f.name)
              .join(', ') || 'Not uploaded',
          ),
          fRead(
            'After',
            by('after')
              .map((f) => f.name)
              .join(', ') || 'Not uploaded',
          ),
          fBtns('', [
            btn(
              'w:Upload photo',
              'Upload photo',
              'primary',
              !d.a.execute || ['Closed', 'Cancelled'].includes(w.status),
            ),
          ]),
        ],
        table: F.length
          ? T(
              ['File', 'Stage', 'Size', 'Uploaded', 'By'],
              F.map((f) =>
                row(
                  f.id,
                  [
                    cell({ t: f.name, fw: 700 }),
                    cell({ t: f.stage }),
                    cell({ t: `${Math.max(1, Math.round(f.size / 1024))} KB` }),
                    cell({ t: d.fmt.dtm(f.createdAt) }),
                    cell({ t: this.data.tname(d, f.byUserId) }),
                  ],
                  ['Download'],
                  [f.name, f.stage, []],
                ),
              ),
              true,
            )
          : null,
        info: 'Files are stored once on the job (private storage, signed download links).',
      });
    } else if (tab === 'tl') {
      const ev = await this.events(d, w.id);
      body = card({
        id: 'w-tl',
        table: T(
          ['When', 'Event', 'By'],
          [...ev]
            .reverse()
            .map((e) =>
              row(
                e.id,
                [
                  cell({ t: d.fmt.dtm(e.createdAt) }),
                  cell({ t: e.text, fw: 700 }),
                  cell({ t: e.byName }),
                ],
                [],
                [e.text, e.byName, []],
              ),
            ),
        ),
      });
    } else if (tab === 'proof')
      body = card({
        id: 'w-proof',
        title: 'Customer proof',
        fields: [
          fRead(
            'Signed by',
            w.signedBy
              ? `${w.signedBy} · ${d.fmt.dtm(w.signedAt)}`
              : 'Not captured',
          ),
          fRead(
            'Acknowledgement',
            w.signedBy
              ? 'Customer confirms work was performed as described'
              : '—',
          ),
          fRead('Customer notes', w.signNote || '—'),
          fRead('Resolution', w.resolution || '—'),
          fRead(
            'Important',
            'A signature is evidence of service — it is NOT payment confirmation.',
          ),
          fBtns('', [
            btn(
              'w:Capture signature',
              'Capture signature',
              'primary',
              !d.a.execute ||
                !['In Progress', 'Arrived'].includes(w.status) ||
                !!w.signedBy,
            ),
          ]),
        ],
      });
    else if (tab === 'fin') {
      const qo = w.quoteOrderId ? d.orders.get(w.quoteOrderId) : undefined;
      const io = w.invoiceOrderId ? d.orders.get(w.invoiceOrderId) : undefined;
      const ps = this.data.payState(d, w);
      body = card({
        id: 'w-fin',
        title: 'Financial references (owned by Orders & Payments)',
        fields: [
          fRead('Coverage', this.data.coverage(d, w)),
          fRead(
            'Quote',
            qo
              ? `Quotation #${qo.orderNo} (Orders) · ${qo.quoteStatus ?? 'draft'}${d.a.money ? ` · ${this.data.money(d, qo.total)}` : ''}`
              : '—',
          ),
          fRead(
            'Invoice',
            io
              ? `Order #${io.orderNo} (Orders)${d.a.money ? ` · ${this.data.money(d, io.total)}` : ' · total 🔒'}`
              : 'Not requested',
          ),
          fRead(
            'Payment',
            w.invoiceOrderId
              ? `${ps} — from Payments & Billing`
              : 'Not Required',
          ),
          fBtns('', [
            btn(
              'w:Request quote',
              'Request quote',
              'ghost',
              !d.a.workorder || !!w.quoteOrderId,
            ),
            btn(
              'w:Request invoice',
              'Request invoice',
              'ghost',
              !d.a.workorder || !!w.invoiceOrderId || !DONE.includes(w.status),
            ),
            btn(
              'w:Payment link',
              'Send payment link',
              'ghost',
              !w.invoiceOrderId || ps === 'Paid' || !d.a.workorder,
            ),
          ]),
        ],
        info: '“Paid” only appears when Payments & Billing or Orders records the payment.',
      });
    } else if (tab === 'hist')
      body = card({
        id: 'w-hist',
        table: T(
          ['Work order', 'Service', 'Date', 'Status', 'Resolution'],
          d.wos
            .filter(
              (o) =>
                ((o.assetId && o.assetId === w.assetId) ||
                  o.customerId === w.customerId) &&
                o.id !== w.id,
            )
            .map((o) =>
              row(
                o.id,
                [
                  cell({ t: o.number, fw: 700 }),
                  cell({ t: this.data.svName(d, o.serviceTypeId) }),
                  cell({ t: o.startAt ? this.data.ddate(d, o.startAt) : '—' }),
                  this.stc(o.status),
                  cell({ t: o.resolution || '—' }),
                ],
                ['Open'],
                [o.number, o.status, []],
              ),
            ),
          true,
        ),
        empty: d.wos.some(
          (o) =>
            ((o.assetId && o.assetId === w.assetId) ||
              o.customerId === w.customerId) &&
            o.id !== w.id,
        )
          ? null
          : { t: 'No other jobs for this customer or asset', d: '', acts: [] },
      });
    else
      body = card({
        id: 'w-ov',
        title: 'Overview',
        fields: [
          fRead('Issue / scope', w.scope),
          fRead(
            'Customer · site',
            `${this.data.cname(d, w.customerId)} · ${this.data.addr(d, w.siteId, w.customerId)}`,
          ),
          fRead(
            'Asset',
            x ? `${x.name} · ${x.serial || 'serial not recorded'}` : '—',
          ),
          fRead('Technician', this.data.tname(d, w.techUserId)),
          fRead('Parts readiness', this.data.ready(d, w)),
          fRead('Checklist', tp ? `${tp.name} v${tp.version}` : '—'),
          fRead('Notes', w.note || '—'),
          ...(w.approvalReason
            ? [fRead('Approval needed', w.approvalReason)]
            : []),
          fRead('Next action', nx || `None — ${w.status}`),
        ],
      });
    return [kpiRow(kp), R('minmax(0,1fr)', [head]), R('minmax(0,1fr)', [body])];
  }

  // ===== 8 Technician workspace =============================================

  techBtns(d: Data, w: W): Btn[] {
    const can =
      d.a.execute &&
      (w.techUserId === d.a.userId || d.a.dispatch || d.a.approve);
    if (!can) return [btn(`tw:open:${w.id}`, 'Open job', 'primary')];
    const B = (
      k: string,
      t: string,
      v: 'primary' | 'ghost' = 'ghost',
      dis?: boolean,
    ) => btn(`tw:${k}:${w.id}`, t, v, dis);
    const m: Record<string, Btn[]> = {
      Scheduled: [B('Accept', 'Accept job', 'primary')],
      Assigned: [B('Accept', 'Accept job', 'primary')],
      Dispatched: [
        B('Start travel', 'Start travel', 'primary'),
        B('Navigate', 'Navigate'),
        B('Call', 'Call customer', 'ghost', !d.a.pii),
      ],
      'En Route': [
        B('Arrived', 'I’ve arrived', 'primary'),
        B('Navigate', 'Navigate'),
        B('Call', 'Call customer', 'ghost', !d.a.pii),
      ],
      Arrived: [
        B('Start job', 'Start job', 'primary'),
        B('Scan', 'Scan asset'),
      ],
      'In Progress': [
        B('Complete work', 'Complete job', 'primary'),
        B('Checklist', 'Checklist'),
        B('Photo', 'Take photo'),
        B('Use part', 'Use part'),
        B('Signature', 'Capture signature', 'ghost', !!w.signedBy),
        B('Note', 'Add note'),
        B('Pause', 'Pause'),
        B('Help', 'Request help'),
      ],
      Paused: [B('Resume', 'Resume', 'primary')],
      'Awaiting Parts': [B('Resume', 'Resume', 'primary')],
    };
    return m[w.status] ?? [B('open', 'Open job', 'primary')];
  }

  vTechnician(d: Data) {
    const tid = d.a.techOnly
      ? d.a.userId
      : d.s.techView || d.techs[0]?.id || d.a.userId;
    const t = this.data.tech(d, tid);
    const mine = d.wos
      .filter(
        (w) =>
          w.techUserId === tid &&
          w.status !== 'Cancelled' &&
          (this.data.day(d, w) === 0 ||
            ['En Route', 'Arrived', 'In Progress', 'Paused'].includes(
              w.status,
            )),
      )
      .sort((a, b) => (this.data.h(d, a) ?? 0) - (this.data.h(d, b) ?? 0));
    const cur = mine.find((w) =>
      ['En Route', 'Arrived', 'In Progress', 'Paused'].includes(w.status),
    );
    const next = mine.find((w) =>
      ['Assigned', 'Dispatched', 'Scheduled'].includes(w.status),
    );
    const job = cur ?? next;
    const running = d.labor.filter(
      (l) => l.techUserId === tid && l.status === 'Running',
    );
    const out: unknown[] = [];
    if (!d.a.techOnly)
      out.push(
        R('minmax(0,1fr)', [
          card({
            id: 'tw-who',
            filters: {
              search: null,
              sels: [
                sel2(
                  'techView',
                  'Viewing as',
                  tid,
                  d.techs.map((x) => [x.id, x.name] as [string, string]),
                ),
              ],
              nOn: null,
              count:
                'Preview of a technician’s phone view — actions are recorded under your own name.',
            },
          }),
        ]),
      );
    const st = t ? this.data.techStatus(d, t) : 'Off Duty';
    out.push(
      kpiRow([
        K(
          'tw:jobs',
          'My jobs today',
          mine.length,
          `${mine.filter((w) => DONE.includes(w.status)).length} completed`,
          null,
          '#12A150',
        ),
        K(
          'tw:timer',
          'Labor timer',
          running.length ? 'Running' : 'Stopped',
          running.length
            ? `since ${d.fmt.dtm(running[0].startAt)}`
            : 'Starts with your next job',
          null,
          '#F79009',
        ),
        K(
          'tw:st',
          'My status',
          st,
          t ? this.data.shiftSource(d, t) : 'No technician profile',
          null,
          '#2E90FA',
        ),
      ]),
    );
    if (!t)
      out.push(
        R('minmax(0,1fr)', [
          card({
            empty: {
              t: 'No technician profile',
              d: 'A manager adds your skills and territories in Field Service › Settings › Technician policies.',
              acts: [],
            },
          }),
        ]),
      );
    if (job) {
      const w = job;
      const si = this.data.site(d, w.siteId);
      const x = this.assetOf(d, w.assetId);
      const miss = this.data.completionGaps(d, w);
      out.push(
        R('minmax(0,1fr)', [
          card({
            id: 'tw-job',
            title: `${cur ? 'Current job · ' : 'Next job · '}${w.number}`,
            sub: `${hh(this.data.h(d, w))} · ${this.data.svName(d, w.serviceTypeId)} · ${w.priority} · ${w.status}`,
            fields: [
              fRead(
                'Customer',
                `${this.data.cname(d, w.customerId)} · ${this.phone(d, w.customerId)}`,
              ),
              fRead(
                'Address',
                si
                  ? `${si.address}, ${si.zone}`
                  : this.data.addr(d, w.siteId, w.customerId),
              ),
              fRead('Issue', w.scope),
              fRead(
                'Asset',
                x ? `${x.name} · ${x.serial || 'serial not recorded'}` : '—',
              ),
              fRead('Access', si?.access || '—'),
              ...(si?.safety ? [fRead('Safety', `⚠ ${si.safety}`)] : []),
              fRead(
                'Parts',
                w.parts
                  .map(
                    (p) =>
                      `${this.data.partName(d, p.productId)} ×${p.required} (${this.data.partSt(d, p)})`,
                  )
                  .join(' · ') || 'None',
              ),
              ...(w.status === 'In Progress'
                ? [
                    fRead(
                      'Before you can complete',
                      miss.length
                        ? `✕ ${miss.join('\n✕ ')}`
                        : '✓ All requirements met',
                    ),
                  ]
                : []),
              fBtns('', this.techBtns(d, w)),
            ],
          }),
        ]),
      );
    } else
      out.push(
        R('minmax(0,1fr)', [
          card({
            empty: {
              t: 'No more jobs today',
              d: 'New assignments appear here when a dispatcher assigns them.',
              acts: [],
            },
          }),
        ]),
      );
    out.push(
      R('minmax(0,1fr)', [
        card({
          id: 'tw-list',
          title: 'My jobs today',
          table: mine.length
            ? {
                hasActs: true,
                cols: cols(['Time', 'Job', 'Customer', 'Status']),
                rows: mine.map((w) =>
                  row(
                    w.id,
                    [
                      cell({ t: hh(this.data.h(d, w)), fw: 800 }),
                      cell({
                        t: `${w.number} · ${this.data.svName(d, w.serviceTypeId)}`,
                      }),
                      cell({
                        t: this.data.cname(d, w.customerId),
                        s: this.data.zoneOf(d, w),
                      }),
                      this.stc(w.status),
                    ],
                    ['Open job'],
                    [
                      `${hh(this.data.h(d, w))} · ${this.data.cname(d, w.customerId)}`,
                      `${w.number} · ${this.data.svName(d, w.serviceTypeId)}`,
                      [this.chip(w.status)],
                    ],
                  ),
                ),
              }
            : null,
          empty: mine.length
            ? null
            : { t: 'No jobs assigned', d: '', acts: [] },
          acts:
            t && (tid === d.a.userId || d.a.dispatch)
              ? [
                  btn(
                    `tw-st:${t.manual === 'Break' ? '' : 'Break'}`,
                    t.manual === 'Break' ? 'End break' : 'Start break',
                  ),
                  btn(
                    `tw-st:${t.manual === 'Off Duty' ? '' : 'Off Duty'}`,
                    t.manual === 'Off Duty' ? 'Back on duty' : 'Go off duty',
                  ),
                ]
              : [],
          info: d.cfg.offline.enabled
            ? 'Offline-safe: checklist answers, notes, signature and status taps made without a connection are queued on this device with idempotency keys and sync when you reconnect. Server success shows only after sync.'
            : 'Offline mode is off in Settings › Mobile / offline — actions need a connection.',
        }),
      ]),
    );
    return out;
  }

  // ===== 9 Inspections =====================================================

  vInspections(d: Data) {
    const v = d.s.view.insView || 'ins';
    const L = d.inspections.filter(
      (i) => !d.a.techOnly || i.techUserId === d.a.userId,
    );
    const sg = seg(
      [
        ['ins', 'Inspections', L.length],
        ['tpl', 'Templates', d.templates.length],
      ],
      v,
    );
    if (v === 'tpl')
      return [
        R('minmax(0,1fr)', [
          card({
            id: 'tpl',
            seg: sg,
            acts: [btn('newtpl', 'New template', 'primary', !d.a.plan)],
            table: d.templates.length
              ? {
                  hasActs: true,
                  cols: cols([
                    'Template',
                    'Service type',
                    'Asset type',
                    'Version',
                    'Items',
                    'Required',
                    'Evidence',
                    'Status',
                  ]),
                  rows: d.templates.map((t) => {
                    const it = this.data.tplItems(t);
                    return row(
                      t.id,
                      [
                        cell({ t: t.name, fw: 800, s: t.code }),
                        cell({ t: this.data.svName(d, t.serviceTypeId) }),
                        cell({ t: t.assetType }),
                        cell({ t: `v${t.version}` }),
                        cell({ t: String(it.length) }),
                        cell({ t: String(it.filter((x) => x.req).length) }),
                        cell({
                          t:
                            [
                              ...new Set(
                                it.filter((x) => x.ev).map((x) => x.type),
                              ),
                            ].join(', ') || '—',
                        }),
                        this.stc(t.status),
                      ],
                      [
                        'Open',
                        ...(d.a.plan
                          ? [
                              'Duplicate',
                              ...(t.status === 'Draft'
                                ? ['Publish version']
                                : []),
                            ]
                          : []),
                      ],
                      [
                        `${t.name} v${t.version}`,
                        `${it.length} items`,
                        [this.chip(t.status)],
                      ],
                    );
                  }),
                }
              : null,
            empty: d.templates.length
              ? null
              : {
                  t: 'No checklist templates',
                  d: 'Create one, publish it, and new work orders for its service type use it.',
                  acts: [btn('newtpl', 'New template', 'primary', !d.a.plan)],
                },
            info: 'Published versions are immutable so every past inspection can be reproduced exactly.',
          }),
        ]),
      ];
    return [
      kpiRow([
        K('i:all', 'Inspections', L.length, '', null, '#12A150'),
        K(
          'i:fail',
          'Failed',
          L.filter((i) => i.result === 'Failed').length,
          'Need follow-up',
          null,
          '#F04438',
        ),
        K(
          'i:exc',
          'With exceptions',
          L.filter((i) => i.exceptions).length,
          '',
          null,
          '#F79009',
        ),
        K(
          'i:prog',
          'In progress',
          L.filter((i) => i.result === 'In Progress').length,
          '',
          null,
          '#2E90FA',
        ),
      ]),
      R('minmax(0,1fr)', [
        card({
          id: 'ins',
          seg: sg,
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Inspection',
                  'WO',
                  'Asset',
                  'Technician',
                  'Template',
                  'Started',
                  'Completed',
                  'Result',
                  'Exceptions',
                ]),
                rows: L.map((i) => {
                  const tp = d.templates.find((t) => t.id === i.templateId);
                  const w = d.wos.find((x) => x.id === i.woId);
                  return row(
                    i.id,
                    [
                      cell({
                        t: i.number,
                        fw: 800,
                        s: i.approvedById
                          ? `Approved by ${this.data.tname(d, i.approvedById)}`
                          : '',
                      }),
                      cell({ t: w?.number ?? '—' }),
                      cell({ t: this.assetOf(d, i.assetId)?.name ?? '—' }),
                      cell({ t: this.data.tname(d, i.techUserId) }),
                      cell({ t: tp ? `${tp.name} v${tp.version}` : '—' }),
                      cell({ t: this.data.ddate(d, i.startedAt) }),
                      cell({ t: this.data.ddate(d, i.completedAt) }),
                      this.stc(i.result),
                      cell({
                        t: String(i.exceptions),
                        fg: i.exceptions ? '#B42318' : '#344054',
                        fw: 700,
                      }),
                    ],
                    [
                      'Open',
                      ...(i.result === 'In Progress' && d.a.execute
                        ? ['Resume']
                        : []),
                      ...(i.result !== 'In Progress' &&
                      d.a.approve &&
                      !i.approvedById
                        ? ['Review', 'Approve']
                        : []),
                      ...(i.exceptions && d.a.workorder
                        ? ['Create follow-up']
                        : []),
                    ],
                    [
                      `${i.number} · ${i.result}`,
                      `${w?.number ?? ''} · ${this.data.tname(d, i.techUserId)}`,
                      [this.chip(i.result)],
                    ],
                  );
                }),
              }
            : null,
          empty: L.length
            ? null
            : {
                t: 'No inspections yet',
                d: 'An inspection starts when a technician starts a job whose service type has a published checklist.',
                acts: [],
              },
        }),
      ]),
    ];
  }

  // ===== 10 Parts ==========================================================

  vParts(d: Data) {
    const rows: { w: W; p: WPart; st: string }[] = [];
    const ws = this.data.wosV(d).filter((w) => w.status !== 'Cancelled');
    ws.forEach((w) =>
      w.parts.forEach((p) => rows.push({ w, p, st: this.data.partSt(d, p) })),
    );
    const f = d.s.f.pt ?? {};
    const L = rows.filter(
      (r) => (!f.st || r.st === f.st) && (!f.tech || r.w.techUserId === f.tech),
    );
    const money = d.a.money;
    const kpis = [
      K(
        'p:all',
        'Parts Required',
        rows.filter((r) => OPEN.includes(r.w.status)).length,
        'Lines on open jobs',
        null,
        '#2E90FA',
      ),
      K(
        'p:Reserved',
        'Reserved',
        rows.filter((r) => r.st === 'Reserved').length,
        '',
        null,
        '#6941C6',
      ),
      K(
        'p:Issued',
        'Issued / Ready',
        rows.filter((r) => r.st === 'Issued').length,
        '',
        null,
        '#12A150',
      ),
      K(
        'p:Missing',
        'Missing',
        rows.filter((r) => r.st === 'Missing').length,
        'Not enough stock (after holds)',
        '#B42318',
        '#F04438',
      ),
      K(
        'p:Used',
        'Used Today',
        rows.filter(
          (r) =>
            r.st === 'Used' &&
            r.p.moves.some((m) => this.data.ddate(d, m.createdAt) === 'Today'),
        ).length,
        '',
        null,
        '#12A150',
      ),
      K(
        'p:ret',
        'Returns Pending',
        rows.filter(
          (r) =>
            r.p.issued &&
            r.p.used + r.p.returned < r.p.issued &&
            DONE.includes(r.w.status),
        ).length,
        'Issued but not used or returned',
        null,
        '#F79009',
      ),
      K(
        'p:blk',
        'Jobs Blocked by Parts',
        ws.filter(
          (w) =>
            OPEN.includes(w.status) &&
            (w.status === 'Awaiting Parts' ||
              this.data.ready(d, w) === 'Missing'),
        ).length,
        '',
        null,
        '#F04438',
      ),
    ];
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'pt',
          filters: {
            search: null,
            sels: [
              sel2('st', 'Status', f.st, [
                ['', 'Any status'],
                'Needed',
                'Requested',
                'Reserved',
                'Issued',
                'Used',
                'Returned',
                'Missing',
                'Unavailable',
              ]),
              sel2('tech', 'Technician', f.tech, [
                ['', 'Any technician'],
                ...d.techs.map((t) => [t.id, t.name] as [string, string]),
              ]),
            ],
            nOn: nOn(f),
            count: `${L.length} part lines`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'WO',
                  'Part',
                  'SKU',
                  'Required',
                  'Reserved',
                  'Issued',
                  'Used',
                  'Returned',
                  'Stock / held',
                  'Status',
                  ['Technician', '1'],
                  ...(money ? ['Unit cost'] : []),
                ]),
                rows: L.map((r) => {
                  const pr = d.products.get(r.p.productId);
                  const held = this.data.heldElsewhere(
                    d,
                    r.p.productId,
                    r.p.id,
                  );
                  return row(
                    `${r.w.id}|${r.p.id}`,
                    [
                      this.mono(r.w.number, { fw: 700 }),
                      cell({
                        t: this.data.partName(d, r.p.productId),
                        fw: 700,
                      }),
                      cell({ t: pr?.sku ?? '—', ff: 'ui-monospace,monospace' }),
                      cell({ t: String(r.p.required) }),
                      cell({ t: String(r.p.reserved) }),
                      cell({ t: String(r.p.issued) }),
                      cell({ t: String(r.p.used) }),
                      cell({ t: String(r.p.returned) }),
                      cell({
                        t: pr ? `${pr.stock} / ${held}` : 'Unavailable',
                        fg: pr ? '#344054' : '#B54708',
                        s: pr ? 'on hand / held on other jobs' : '',
                      }),
                      this.stc(r.st),
                      cell({ t: this.data.tname(d, r.w.techUserId), opt: '1' }),
                      ...(money
                        ? [cell({ t: this.data.money(d, pr?.cost) })]
                        : []),
                    ],
                    d.a.readOnly ? [] : this.partActs(d, r.w, r.p),
                    [
                      `${this.data.partName(d, r.p.productId)} · ${r.w.number}`,
                      `${r.p.used}/${r.p.required} used`,
                      [this.chip(r.st)],
                    ],
                  );
                }),
              }
            : null,
          empty: L.length
            ? null
            : {
                t: rows.length
                  ? 'No part lines match'
                  : 'No parts on any job yet',
                d: '',
                acts: rows.length
                  ? [btn('clear:pt', 'Clear Filters', 'primary')]
                  : [],
              },
          info: 'Flow: Required → Reserve (held here) → Issue (Inventory movement) → Use / Return. Stock never moves because a part is merely listed on a job. Van stock isn’t tracked — parts come from branch inventory.',
        }),
      ]),
    ];
  }

  // ===== 11 Labor ==========================================================

  labActs(d: Data, l: { status: string; techUserId: string }) {
    const o: string[] = [];
    const own = l.techUserId === d.a.userId || d.a.dispatch || d.a.approve;
    if (d.a.execute && own) {
      if (l.status === 'Running') o.push('Stop timer');
      if (['Draft', 'Rejected'].includes(l.status)) o.push('Edit', 'Submit');
    }
    if (d.a.approve && l.status === 'Submitted') o.push('Approve', 'Reject');
    return o;
  }

  vLabor(d: Data) {
    const all = d.labor.filter(
      (l) => !d.a.techOnly || l.techUserId === d.a.userId,
    );
    const f = d.s.f.lab ?? {};
    const L = all.filter(
      (l) =>
        (!f.tech || l.techUserId === f.tech) &&
        (!f.apr || l.status === f.apr) &&
        (!f.type || l.type === f.type),
    );
    const hrs = (x: typeof all) =>
      x.reduce((s, l) => s + this.durOf(d, l).m, 0) / 60;
    const by = new Map<string, number>();
    all
      .filter((l) => l.type !== 'Travel')
      .forEach((l) =>
        by.set(l.woId, (by.get(l.woId) ?? 0) + this.durOf(d, l).m),
      );
    const vals = [...by.values()];
    const kpis = [
      K(
        'l:all',
        'Labor Hours',
        `${hrs(all).toFixed(1)} h`,
        `${all.length} entries`,
        null,
        '#12A150',
      ),
      K(
        'l:bill',
        'Billable Hours',
        `${hrs(all.filter((l) => l.billable)).toFixed(1)} h`,
        '',
        null,
        '#12A150',
      ),
      K(
        'l:trav',
        'Travel Time',
        `${hrs(all.filter((l) => l.type === 'Travel')).toFixed(1)} h`,
        '',
        null,
        '#2E90FA',
      ),
      K(
        'l:ot',
        'Overtime',
        `${hrs(all.filter((l) => l.overtime)).toFixed(1)} h`,
        'Outside shift or over the daily threshold',
        null,
        '#F79009',
      ),
      K(
        'l:Submitted',
        'Unapproved Entries',
        all.filter((l) => ['Submitted', 'Draft', 'Running'].includes(l.status))
          .length,
        '',
        null,
        '#F79009',
      ),
      K(
        'l:avg',
        'Average Job Labor',
        vals.length
          ? `${Math.round(vals.reduce((x, y) => x + y, 0) / vals.length)} min`
          : '—',
        '',
        null,
        '#98A2B3',
      ),
    ];
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'lab',
          acts: [
            btn('lab-new', 'Add manual time', 'primary', !d.a.execute),
            btn('export', 'Export', 'ghost', !d.a.export),
          ],
          filters: {
            search: null,
            sels: [
              sel2('tech', 'Technician', f.tech, [
                ['', 'Any technician'],
                ...d.techs.map((t) => [t.id, t.name] as [string, string]),
              ]),
              sel2('apr', 'Approval', f.apr, [
                ['', 'Any state'],
                'Running',
                'Draft',
                'Submitted',
                'Approved',
                'Rejected',
              ]),
              sel2('type', 'Labor type', f.type, [
                ['', 'Any type'],
                ...LABOR_TYPES,
              ]),
            ],
            nOn: nOn(f),
            count: `${L.length} entries`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Technician',
                  'WO',
                  ['Customer', '1'],
                  'Type',
                  'Date',
                  'Start',
                  'End',
                  ['Break', '1'],
                  'Duration',
                  'Billable',
                  'Approval',
                  ...(d.a.money ? ['Rate ref'] : []),
                ]),
                rows: L.map((l) => {
                  const w = d.wos.find((x) => x.id === l.woId);
                  const c = this.chip(l.status);
                  return row(
                    l.id,
                    [
                      cell({
                        t: this.data.tname(d, l.techUserId),
                        fw: 700,
                        s: l.number,
                      }),
                      cell({
                        t: w?.number ?? '—',
                        ff: 'ui-monospace,monospace',
                      }),
                      cell({
                        t: w ? this.data.cname(d, w.customerId) : '—',
                        opt: '1',
                      }),
                      cell({ t: l.type, s: l.overtime ? 'Overtime' : '' }),
                      cell({ t: this.data.ddate(d, l.startAt) }),
                      cell({ t: hh(this.hOf(d, l.startAt)) }),
                      cell({
                        t: l.endAt ? hh(this.hOf(d, l.endAt)) : '▶ running',
                      }),
                      cell({ t: `${l.breakMin} min`, opt: '1' }),
                      cell({ t: this.durOf(d, l).t, fw: 700 }),
                      cell({ t: l.billable ? 'Yes' : 'No' }),
                      cell({
                        bt: c.t,
                        bfg: c.fg,
                        bbg: c.bg,
                        s: l.reason ?? '',
                      }),
                      ...(d.a.money
                        ? [
                            cell({
                              t:
                                l.rate != null
                                  ? `${this.data.money(d, num(l.rate))}/h`
                                  : 'No rate on Staff record',
                            }),
                          ]
                        : []),
                    ],
                    this.labActs(d, l),
                    [
                      `${this.data.tname(d, l.techUserId)} · ${l.type}`,
                      `${this.durOf(d, l).t} · ${w?.number ?? ''}`,
                      [this.chip(l.status)],
                    ],
                  );
                }),
              }
            : null,
          empty: L.length
            ? null
            : {
                t: all.length ? 'No entries match' : 'No labor captured yet',
                d: all.length
                  ? ''
                  : 'Timers start when a technician starts a job.',
                acts: all.length
                  ? [btn('clear:lab', 'Clear Filters', 'primary')]
                  : [],
              },
          info: 'Overlapping timers are blocked. Manual edits need a reason. Approved entries are read-only job costing — payroll pays from Staff timesheets, so field labor is never paid twice.',
        }),
      ]),
    ];
  }
  hOf(d: Data, x: Date) {
    const w = wall(x, d.tz);
    return w.h + w.mi / 60;
  }

  // ===== 12 Equipment =======================================================

  vEquipment(d: Data) {
    const all = d.equipment;
    const f = d.s.f.eq ?? {};
    const q = (f.q ?? '').toLowerCase();
    const openBy = (id: string) =>
      d.wos.filter((w) => w.assetId === id && OPEN.includes(w.status));
    const pm = (id: string) =>
      d.plans.find((p) => p.assetId === id && p.status === 'Active');
    const fails = (id: string) =>
      d.wos.filter(
        (w) => w.assetId === id && !w.planId && w.status !== 'Cancelled',
      ).length;
    const today = d.now;
    const inW = (x: { warrantyEnd: Date | null }) =>
      !!x.warrantyEnd &&
      x.warrantyEnd >= new Date(today.toISOString().slice(0, 10));
    const L = all.filter(
      (x) =>
        (!q ||
          [
            x.name,
            x.serial ?? '',
            x.model ?? '',
            this.data.cname(d, x.customerId),
          ]
            .join(' ')
            .toLowerCase()
            .includes(q)) &&
        (!f.cat || x.categoryId === f.cat) &&
        (!f.w || (f.w === 'in' ? inW(x) : !inW(x))),
    );
    const kpis = [
      K(
        'e:all',
        'Customer Assets',
        all.length,
        'From Assets & Maintenance',
        null,
        '#12A150',
      ),
      K('e:w', 'Under Warranty', all.filter(inW).length, '', null, '#2E90FA'),
      K(
        'e:due',
        'Due Service',
        all.filter((x) => {
          const p = pm(x.id);
          const n = p ? this.data.planNext(d, p) : null;
          return n != null && n <= 7;
        }).length,
        'Within 7 days',
        null,
        '#F79009',
      ),
      K(
        'e:open',
        'Open Repairs',
        all.filter((x) => openBy(x.id).length).length,
        '',
        null,
        '#F79009',
      ),
      K(
        'e:fail',
        'High Failure Rate',
        all.filter((x) => fails(x.id) >= 3).length,
        '3+ repairs on record',
        null,
        '#F04438',
      ),
      K(
        'e:unv',
        'Unverified Assets',
        all.filter((x) => !x.serial).length,
        'Serial not recorded',
        null,
        '#98A2B3',
      ),
    ];
    const catOpts = [
      ...new Set(all.map((x) => x.categoryId).filter(Boolean) as string[]),
    ].map((c) => [c, d.catNames.get(c) ?? '—'] as [string, string]);
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'eq',
          filters: {
            search: 'Search asset, serial, model or customer',
            q: f.q ?? '',
            sels: [
              sel2('cat', 'Category', f.cat, [
                ['', 'Any category'],
                ...catOpts,
              ]),
              sel2('w', 'Warranty', f.w, [
                ['', 'Any warranty'],
                ['in', 'Under warranty'],
                ['out', 'Out of warranty'],
              ]),
            ],
            nOn: nOn(f, ['q']),
            count: `${L.length} assets`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Asset',
                  'Customer',
                  ['Site', '1'],
                  'Category',
                  ['Make / model', '1'],
                  'Serial',
                  'Warranty',
                  'Last service',
                  'Next service',
                  'Open WO',
                ]),
                rows: L.map((x) => {
                  const si = this.data.site(d, d.eqSite.get(x.id));
                  const p = pm(x.id);
                  const n = p ? this.data.planNext(d, p) : null;
                  const o = openBy(x.id);
                  const last = d.wos
                    .filter((w) => w.assetId === x.id && w.completedAt)
                    .sort(
                      (a, b) =>
                        b.completedAt!.getTime() - a.completedAt!.getTime(),
                    )[0];
                  return row(
                    x.id,
                    [
                      cell({ t: x.name, fw: 800, fg: '#101828', s: x.number }),
                      cell({ t: this.data.cname(d, x.customerId) }),
                      cell({
                        t: si ? si.zone : 'Site not set',
                        opt: '1',
                        fg: si ? '#344054' : '#B54708',
                      }),
                      cell({ t: d.catNames.get(x.categoryId ?? '') ?? '—' }),
                      cell({
                        t:
                          [x.manufacturer, x.model].filter(Boolean).join(' ') ||
                          '—',
                        opt: '1',
                      }),
                      cell({
                        t: x.serial || '—',
                        ff: 'ui-monospace,monospace',
                        s: x.serial ? '' : 'Unverified',
                      }),
                      cell({
                        t: !x.warrantyEnd
                          ? 'None'
                          : inW(x)
                            ? `Until ${x.warrantyEnd.toISOString().slice(0, 10)}`
                            : 'Expired',
                        fg: inW(x) ? '#0E8442' : '#667085',
                      }),
                      cell({
                        t: last ? this.data.ddate(d, last.completedAt) : '—',
                      }),
                      cell({
                        t:
                          n != null
                            ? this.data.dday(d, n)
                            : p?.trigger === 'Usage hours'
                              ? `At ${num(p.nextDueMeter)} ${x.meterUnit ?? ''}`.trim()
                              : '—',
                        fg: n != null && n < 0 ? '#B42318' : '#344054',
                      }),
                      cell({ t: o.map((w) => w.number).join(', ') || '—' }),
                    ],
                    [
                      'Open',
                      ...(d.a.request ? ['Create service request'] : []),
                      ...(d.a.workorder ? ['Create work order'] : []),
                      ...(d.a.plan ? ['Schedule maintenance'] : []),
                      ...(d.a.request || d.a.workorder ? ['Set site'] : []),
                      'Open in Assets',
                    ],
                    [
                      x.name,
                      `${this.data.cname(d, x.customerId)} · ${x.serial || 'no serial'}`,
                      [],
                    ],
                  );
                }),
              }
            : null,
          empty: L.length
            ? null
            : {
                t: all.length ? 'No assets match' : 'No customer equipment yet',
                d: all.length
                  ? ''
                  : 'Register customer-owned assets in Assets & Maintenance (owner type “Customer-owned”) — they appear here.',
                acts: all.length
                  ? [btn('clear:eq', 'Clear Filters', 'primary')]
                  : [btn('ext:assets', 'Open Assets & Maintenance', 'primary')],
              },
          info: 'Assets & Maintenance owns the register — this view never creates a parallel asset master.',
        }),
      ]),
    ];
  }

  // ===== 13 PM =============================================================

  vPM(d: Data) {
    const all = d.plans;
    const act = all.filter((p) => p.status === 'Active');
    const nx = (p: (typeof all)[number]) => this.data.planNext(d, p);
    const kpis = [
      K('m:act', 'Active Plans', act.length, '', null, '#12A150'),
      K(
        'm:wk',
        'Due This Week',
        act.filter((p) => {
          const n = nx(p);
          return n != null && n >= 0 && n <= 7;
        }).length,
        '',
        null,
        '#F79009',
      ),
      K(
        'm:over',
        'Overdue',
        act.filter((p) => (nx(p) ?? 0) < 0).length,
        '',
        '#B42318',
        '#F04438',
      ),
      K(
        'm:up',
        'Upcoming',
        act.filter((p) => (nx(p) ?? -1) > 7).length,
        'Beyond 7 days',
        null,
        '#2E90FA',
      ),
      K(
        'm:gen',
        'Generated WOs',
        all.reduce((x, p) => x + p.instances.filter((i) => i.woId).length, 0),
        '',
        null,
        '#6941C6',
      ),
      K(
        'm:comp',
        'Compliance Rate',
        act.length
          ? `${Math.round((act.filter((p) => (nx(p) ?? 0) >= 0).length / act.length) * 100)}%`
          : '—',
        'Plans not overdue',
        null,
        '#12A150',
      ),
    ];
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'pm',
          acts: [btn('pm-new', 'New plan', 'primary', !d.a.plan)],
          table: all.length
            ? {
                hasActs: true,
                cols: cols([
                  'Plan',
                  'Customer',
                  'Asset',
                  'Service',
                  'Trigger',
                  'Next due',
                  'Window',
                  'Auto-create',
                  'Approval',
                  'Status',
                  'Last WO',
                ]),
                rows: all.map((p) => {
                  const n = nx(p);
                  const meter = p.assetId ? d.meters.get(p.assetId) : undefined;
                  return row(
                    p.id,
                    [
                      cell({ t: p.name, fw: 800, s: p.number }),
                      cell({ t: this.data.cname(d, p.customerId) }),
                      cell({
                        t: this.assetOf(d, p.assetId)?.name ?? 'Site-wide',
                      }),
                      cell({ t: this.data.svName(d, p.serviceTypeId) }),
                      cell({
                        t:
                          p.trigger === 'Usage hours'
                            ? `Every ${p.freq} run-hours`
                            : p.trigger === 'Every X days'
                              ? `Every ${p.freq} days`
                              : p.trigger,
                        s:
                          p.trigger === 'Usage hours'
                            ? `Meter ${meter ?? 'no reading'} / due at ${num(p.nextDueMeter)}`
                            : '',
                      }),
                      p.trigger === 'Usage hours'
                        ? cell({
                            t: n === 0 ? 'Due now' : 'By meter',
                            fg: n === 0 ? '#B42318' : '#344054',
                            fw: 700,
                          })
                        : cell({
                            t: this.data.dday(d, n),
                            s:
                              n == null
                                ? ''
                                : n < 0
                                  ? `${Math.abs(n)}d overdue`
                                  : `in ${n}d`,
                            fg: (n ?? 0) < 0 ? '#B42318' : '#344054',
                            fw: 700,
                          }),
                      cell({ t: p.window }),
                      cell({ t: p.autoCreate ? 'Yes' : 'No' }),
                      cell({ t: p.approval ? 'Required' : '—' }),
                      this.stc(p.status),
                      cell({
                        t:
                          d.wos.find((w) => w.id === p.lastWoId)?.number ?? '—',
                      }),
                    ],
                    d.a.plan
                      ? [
                          'Open',
                          'Generate WO',
                          p.status === 'Active' ? 'Pause' : 'Resume',
                          'Edit',
                          'View history',
                        ]
                      : ['Open', 'View history'],
                    [
                      p.name,
                      `Next ${this.data.dday(d, n)}`,
                      [this.chip(p.status)],
                    ],
                  );
                }),
              }
            : null,
          empty: all.length
            ? null
            : {
                t: 'No preventive plans',
                d: '',
                acts: [btn('pm-new', 'New plan', 'primary', !d.a.plan)],
              },
          info: `Rule → due check → work order (approval if required) → schedule → complete → next due. The hourly engine generates due plans ${d.cfg.pm.leadDays} days ahead${d.cfg.pm.autoCreate ? '' : ' (auto-create is off in Settings)'}; plan + period keys make a retry never create a second work order. Usage plans read meter readings from Assets & Maintenance.`,
        }),
      ]),
    ];
  }

  // ===== 14 Agreements ======================================================

  vAgreements(d: Data) {
    const all = d.agreements;
    const st = (g: (typeof all)[number]) => this.data.agrStatus(d, g);
    const active = all.filter((g) =>
      ['Active', 'Renewing Soon'].includes(st(g)),
    );
    const kpis = [
      K('g:act', 'Active Agreements', active.length, '', null, '#12A150'),
      K(
        'g:ren',
        'Renewing Soon',
        all.filter((g) => st(g) === 'Renewing Soon').length,
        'Within 30 days',
        null,
        '#F79009',
      ),
      K(
        'g:exp',
        'Expired',
        all.filter((g) => st(g) === 'Expired').length,
        '',
        null,
        '#F04438',
      ),
      K(
        'g:vis',
        'Visits Due',
        d.plans.filter(
          (p) =>
            p.status === 'Active' &&
            (this.data.planNext(d, p) ?? 99) <= 7 &&
            active.some((g) => g.customerId === p.customerId),
        ).length,
        'Next 7 days',
        null,
        '#2E90FA',
      ),
      K(
        'g:sla',
        'SLA Obligations',
        this.data
          .wosV(d)
          .filter((w) => w.agreementId && OPEN.includes(w.status)).length,
        'Open jobs under agreement SLA',
        null,
        '#6941C6',
      ),
      K(
        'g:use',
        'Usage Remaining',
        `${active.reduce((s, g) => s + Math.max(0, g.visits - this.data.agrUsed(d, g)), 0)} visits`,
        `${active.filter((g) => this.data.agrUsed(d, g) >= g.visits).length} fully used`,
        null,
        '#98A2B3',
      ),
    ];
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'agr',
          acts: [btn('agr-new', 'New agreement', 'primary', !d.a.agreement)],
          table: all.length
            ? {
                hasActs: true,
                cols: cols([
                  'Agreement',
                  'Customer',
                  'Covered assets',
                  'Services',
                  'Start',
                  'End',
                  'Visits',
                  'SLA (resp / resolve)',
                  ['Labor', '1'],
                  ['Parts', '1'],
                  'Renewal',
                  'Status',
                ]),
                rows: all.map((g) => {
                  const used = this.data.agrUsed(d, g);
                  const end = this.data.agrEnd(d, g);
                  return row(
                    g.id,
                    [
                      cell({
                        t: g.number,
                        fw: 800,
                        s: g.contractId
                          ? `Contract ${d.contracts.get(g.contractId)?.number ?? '(removed)'} · ${d.contracts.get(g.contractId)?.status ?? '—'}`
                          : 'No signed contract linked',
                      }),
                      cell({ t: this.data.cname(d, g.customerId) }),
                      cell({
                        t:
                          ((g.assetIds as string[]) ?? [])
                            .map((x) => this.assetOf(d, x)?.name ?? '—')
                            .join(', ') || 'Site-wide',
                      }),
                      cell({
                        t: ((g.serviceTypeIds as string[]) ?? [])
                          .map((s) => this.data.svName(d, s))
                          .join(', '),
                        mw: '180px',
                      }),
                      cell({ t: g.startOn.toISOString().slice(0, 10) }),
                      cell({
                        t: g.endOn.toISOString().slice(0, 10),
                        fg: end <= 30 ? '#B54708' : '#344054',
                      }),
                      cell({
                        t: `${used} / ${g.visits}`,
                        fg: used >= g.visits ? '#B42318' : '#344054',
                        fw: 700,
                        s: g.freq,
                      }),
                      cell({ t: `${g.respH} h / ${g.resH} h` }),
                      cell({ t: g.labor, opt: '1' }),
                      cell({ t: g.parts, opt: '1' }),
                      cell({ t: g.renewal }),
                      this.stc(st(g)),
                    ],
                    d.a.agreement
                      ? [
                          'View entitlement',
                          'Schedule visits',
                          g.status === 'Suspended' ? 'Resume' : 'Suspend',
                          'Edit',
                          ...(g.contractId ? ['Open contract'] : []),
                        ]
                      : [
                          'View entitlement',
                          ...(g.contractId ? ['Open contract'] : []),
                        ],
                    [
                      `${g.number} · ${this.data.cname(d, g.customerId)}`,
                      `${used}/${g.visits} visits`,
                      [this.chip(st(g))],
                    ],
                  );
                }),
              }
            : null,
          empty: all.length
            ? null
            : {
                t: 'No service agreements',
                d: 'Record a customer’s included visits, SLA and coverage here; legal text and signatures live in Contracts.',
                acts: [
                  btn('agr-new', 'New agreement', 'primary', !d.a.agreement),
                ],
              },
          info: 'Legal text and signatures stay in Contracts; billing stays in Orders / Payments. This layer holds entitlements, SLA and visit counts only — used visits are counted from real work orders under the agreement.',
        }),
      ]),
    ];
  }

  // ===== 15 Warranty =======================================================

  wrnStatus(d: Data, x: { status: string; woId: string | null }) {
    const w = x.woId ? d.wos.find((o) => o.id === x.woId) : undefined;
    if (
      x.status === 'WO Created' &&
      w &&
      ['Arrived', 'In Progress', 'Paused', 'Awaiting Parts'].includes(w.status)
    )
      return 'Repairing';
    return x.status;
  }
  wrnActs(
    d: Data,
    x: { status: string; eligibility: string; woId: string | null },
  ) {
    const o = ['Open', 'View asset'];
    const st = this.wrnStatus(d, x);
    if (d.a.agreement && ['Validating'].includes(st))
      o.push('Validate', 'Request evidence', 'Attach evidence');
    if (d.a.approve && st === 'Approval Required') o.push('Approve', 'Reject');
    if (d.a.agreement && st === 'Validating') o.push('Reject');
    if (d.a.agreement && x.eligibility === 'Eligible' && !x.woId)
      o.push('Create work order');
    if (d.a.agreement && ['Completed', 'Rejected'].includes(st))
      o.push('Close case');
    return [...new Set(o)];
  }

  vWarranty(d: Data) {
    const all = d.warranty;
    const S = (x: (typeof all)[number]) => this.wrnStatus(d, x);
    const c = (st: string) => all.filter((x) => S(x) === st).length;
    const kpis = [
      K(
        'y:open',
        'Open Warranty Cases',
        all.filter((x) => !['Closed', 'Rejected', 'Completed'].includes(S(x)))
          .length,
        '',
        null,
        '#2E90FA',
      ),
      K(
        'y:el',
        'Eligible',
        all.filter((x) => x.eligibility === 'Eligible').length,
        '',
        null,
        '#12A150',
      ),
      K(
        'y:pv',
        'Pending Validation',
        c('Validating') + c('Approval Required'),
        '',
        null,
        '#F79009',
      ),
      K('y:rej', 'Rejected', c('Rejected'), '', null, '#98A2B3'),
      K('y:rep', 'Repairs In Progress', c('Repairing'), '', null, '#F79009'),
      K(
        'y:ap',
        'Awaiting Parts',
        all.filter(
          (x) =>
            x.woId &&
            d.wos.find((w) => w.id === x.woId)?.status === 'Awaiting Parts',
        ).length,
        '',
        null,
        '#F04438',
      ),
      K('y:done', 'Completed', c('Completed'), '', null, '#12A150'),
    ];
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'wrn',
          acts: [
            btn(
              'wrn-new',
              'Open warranty case',
              'primary',
              !d.a.agreement && !d.a.request,
            ),
          ],
          table: all.length
            ? {
                hasActs: true,
                cols: cols([
                  'Case',
                  'Customer',
                  'Asset',
                  'Issue',
                  'Warranty source',
                  'Eligibility',
                  'WO',
                  'Status',
                  'Opened',
                ]),
                rows: all.map((x) => {
                  const as = this.assetOf(d, x.assetId);
                  return row(
                    x.id,
                    [
                      cell({ t: x.number, fw: 800 }),
                      cell({ t: this.data.cname(d, x.customerId) }),
                      cell({ t: as?.name ?? '—', s: as?.serial ?? '' }),
                      cell({ t: x.issue, mw: '200px' }),
                      cell({ t: x.source }),
                      this.stc(x.eligibility),
                      cell({
                        t: d.wos.find((w) => w.id === x.woId)?.number ?? '—',
                      }),
                      this.stc(S(x)),
                      cell({ t: this.data.ddate(d, x.createdAt) }),
                    ],
                    this.wrnActs(d, x),
                    [
                      `${x.number} · ${this.data.cname(d, x.customerId)}`,
                      x.issue,
                      [this.chip(S(x))],
                    ],
                  );
                }),
              }
            : null,
          empty: all.length
            ? null
            : {
                t: 'No warranty cases',
                d: 'Cases open when a request is triaged as “Covered by Warranty”, or open one here.',
                acts: [],
              },
          info: 'Eligibility is checked against the asset record (serial, install date, warranty end, prior repairs) plus attached evidence. A person makes every decision.',
        }),
      ]),
    ];
  }

  // ===== 16 Settings =======================================================

  async vSettings(d: Data) {
    const s = await this.ctx.ensure(d.a.rootId);
    const sec = FS_SECS.find((x) => x[0] === d.s.sec) ?? FS_SECS[0];
    const dis = !d.a.settings;
    const cfg = d.cfg;
    const T = (l: string, k: string, o: Record<string, unknown> = {}) =>
      fTog(l, `config.${k}`, false, { dis, ...o });
    const N = (l: string, k: string, o: Record<string, unknown> = {}) =>
      fTxt(l, `config.${k}`, '', { type: 'number', dis, ...o });
    const X = (l: string, k: string, o: Record<string, unknown> = {}) =>
      fTxt(l, `config.${k}`, '', { dis, ...o });
    const members = d.people;
    const F: Record<string, unknown[]> = {
      services: [
        ...d.svcList.map((x) =>
          fTog(
            `${x.name} (${x.code}) · ${x.skill}${x.cert ? ` + ${x.cert}` : ''}`,
            `svc:${x.id}`,
            x.active,
            {
              dis,
              h: `${x.durMin} min default · ${x.priority} · proof: ${x.proof} · checklist: ${d.templates.find((t) => t.id === x.templateId) ? `${d.templates.find((t) => t.id === x.templateId)!.name} v${d.templates.find((t) => t.id === x.templateId)!.version}` : 'none published'} · labor: ${x.laborProductId ? 'billed from a service product' : 'not billed'}`,
              btns: [btn(`svc-edit:${x.id}`, 'Edit', 'ghost', dis)],
            },
          ),
        ),
        fBtns(d.svcList.length ? '' : 'No service types yet', [
          btn('svc-new', 'Add service type', 'primary', dis),
        ]),
      ],
      priorities: [
        fChips(
          'Priorities (order = urgency)',
          'config.priorities',
          PRIORITIES,
          cfg.priorities,
          { dis },
        ),
      ],
      status: [
        T('Reopening a closed WO needs approval', 'status.reopenApproval'),
        T('Cancellation needs a reason', 'status.cancelReason'),
        fRead(
          'Transitions',
          'Validated server-side — e.g. Assigned → Dispatched → En Route → Arrived → In Progress. No skipping.',
        ),
      ],
      dispatch: [
        T('Show assignment suggestions', 'dispatch.autoSuggest'),
        fSel(
          'Lock assignments after',
          'config.dispatch.lockAfter',
          '',
          ['Assigned', 'Dispatched', 'Never'],
          { dis },
        ),
        T('Notify technician on assignment', 'dispatch.notifyTech'),
        N('Max jobs per technician per day', 'dispatch.maxJobsPerDay'),
      ],
      territories: [
        fChips(
          'Territories',
          'config.territories',
          [...new Set([...cfg.territories])],
          cfg.territories,
          {
            dis,
            h: 'Remove a territory only after reassigning technicians and sites.',
          },
        ),
        fBtns('', [btn('opt-add:territories', 'Add territory', 'ghost', dis)]),
        ...cfg.territories.map((z) =>
          fChips(
            `Neighbours of ${z}`,
            `config.adj.${z}`,
            cfg.territories.filter((x) => x !== z),
            cfg.adj[z] ?? [],
            { dis, h: 'Drives the zone travel estimate' },
          ),
        ),
        N('Travel estimate — same territory (min)', 'travel.same'),
        N('Travel estimate — neighbouring territory (min)', 'travel.adj'),
        N('Travel estimate — anywhere else (min)', 'travel.other'),
        fRead(
          'Routing',
          'No routing provider is connected — travel times are these zone estimates, never live traffic.',
        ),
      ],
      skills: [
        fChips(
          'Skills',
          'config.skills',
          [...new Set([...cfg.skills])],
          cfg.skills,
          { dis },
        ),
        fBtns('', [btn('opt-add:skills', 'Add skill', 'ghost', dis)]),
        fChips(
          'Certifications',
          'config.certs',
          [...new Set([...cfg.certs])],
          cfg.certs,
          {
            dis,
            h: 'Certifications are recorded on technician profiles below — Staff has no certification records.',
          },
        ),
        fBtns('', [btn('opt-add:certs', 'Add certification', 'ghost', dis)]),
      ],
      sla: [
        ...PRIORITIES.map((p) =>
          X(`${p} — response / arrival / resolution (h)`, `sla.${p}`, {
            h: 'Comma separated hours; the work order SLA clock uses the response time',
          }),
        ),
        fRead(
          'Business hours',
          'SLA clocks run continuously — a business-hours calendar isn’t applied.',
        ),
        fRead(
          'Pause conditions',
          'Awaiting Customer (the clock resumes where it stopped)',
        ),
      ],
      tech: [
        T(
          'Share technicians’ last check-in territory with dispatchers (during shift)',
          'tech.tracking',
        ),
        N('Clear check-in location after (days)', 'tech.retentionDays'),
        N('Mark location stale after (min)', 'tech.staleMin'),
        N('Break length (min)', 'tech.breakMin'),
        ...d.techs.map((t) =>
          fRead(
            `${t.name}`,
            `${t.skills.join(', ') || 'No skills'} · ${t.certs.join(', ') || 'no certifications'} · ${t.zones.join(', ') || 'no territories'} · default shift ${hh(t.defShift[0])}–${hh(t.defShift[1])} · location ${t.track ? 'shared' : 'off'}`,
            { btns: [btn(`tech-edit:${t.id}`, 'Edit', 'ghost', dis)] },
          ),
        ),
        fBtns(d.techs.length ? '' : 'No technician profiles yet', [
          btn(
            'tech-new',
            'Add technician profile',
            'primary',
            dis || members.length === d.techs.length,
          ),
        ]),
      ],
      numbering: [
        X('Work order pattern', 'numbering.wo'),
        X('Request pattern', 'numbering.sr'),
        fRead(
          'Next work order',
          `${patternNumber(cfg.numbering.wo, s.nextWo)} (assigned server-side)`,
        ),
      ],
      checklist: [
        T('All required items before completion', 'checklist.requireAll'),
        T('Photo evidence where the template asks', 'checklist.evidencePhoto'),
      ],
      parts: [
        T('Reserve parts when a job is assigned', 'parts.reserveOnSchedule'),
        N('High-value part threshold', 'parts.highValue', {
          h: 'Above this needs approval',
        }),
        fRead(
          'Van stock',
          'Not tracked — Inventory has no van locations; parts are issued from branch stock.',
        ),
      ],
      labor: [
        T('Allow overlapping timers', 'labor.overlap'),
        T('Manual edits need a reason', 'labor.manualReason'),
        N('Round to (min)', 'labor.roundMin'),
        N('Overtime after (h/day)', 'labor.overtimeAfter'),
      ],
      proof: [
        T('Customer signature required', 'proof.signature'),
        T('After photo required', 'proof.afterPhoto'),
        T('Resolution notes required', 'proof.resolution'),
      ],
      pm: [
        N('Create WO this many days before due', 'pm.leadDays'),
        T('Auto-create WOs (hourly)', 'pm.autoCreate'),
      ],
      warranty: [
        N('Repeat-visit window (days)', 'warranty.repeatWindowDays', {
          h: 'Also used by the first-time-fix definition',
        }),
        X('Required evidence', 'warranty.evidence'),
      ],
      notify: [
        T('Appointment confirmation', 'notify.confirm'),
        T('Technician dispatched', 'notify.dispatched'),
        T('Technician arriving', 'notify.arriving'),
        T('Delay notice', 'notify.delay'),
        T('Job completed', 'notify.completed'),
        X('Quiet hours', 'notify.quiet', {
          h: 'Messages go through Unified Inbox (consent and opt-out apply) and aren’t sent inside quiet hours',
        }),
      ],
      offline: [
        T('Offline mode for technicians', 'offline.enabled'),
        N(
          'Max offline hours before queued actions need review',
          'offline.maxHours',
        ),
        fRead(
          'Photos offline',
          'Not queued — photos upload when the device is connected.',
        ),
      ],
      approvals: [
        T('High-value parts', 'approvals.highValueParts'),
        T('Overtime', 'approvals.overtime'),
        T('Emergency dispatch', 'approvals.emergency'),
        T('Warranty exception', 'approvals.warrantyException'),
        T('Agreement override', 'approvals.agreementOverride', {
          h: 'When included visits run out, jobs become chargeable unless a manager attaches them',
        }),
        T('Work-order cancellation', 'approvals.cancellation'),
        T('Reopening closed WO', 'approvals.reopen'),
      ],
    };
    return {
      nav: FS_SECS.map(([k, t]) => ({ k, t })),
      sec: {
        k: sec[0],
        t: sec[1],
        d: 'Field Service only — global branding, roles and security stay in Noxtill Settings.',
      },
      v: s.version,
      readOnly: dis,
      roText: `Read-only for ${d.a.roleLabel}. People with “field.settings” change these settings.`,
      fields: [
        ...(F[sec[0]] ?? []),
        ...(LIVE_SECS.includes(sec[0])
          ? []
          : [fBtns('', [btn('set-reset', 'Reset section', 'ghost', dis)])]),
      ],
      saved: { config: cfg as unknown as Record<string, unknown> },
      liveSecs: LIVE_SECS,
    };
  }
}
