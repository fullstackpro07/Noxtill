import { Injectable } from '@nestjs/common';
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
  sel2,
} from '../payments/pay-vm';
import { AmActor, AmContextService, num } from './am-context.service';
import {
  AAsset,
  APlan,
  AReq,
  AWo,
  AmDataService,
  AmScope,
  Data,
} from './am-data.service';
import { AmSettingsService } from './am-settings.service';
import { FinanceAssetsService } from '../finance/finance-assets.service';
import {
  AM_CONDC,
  AM_CRITC,
  AM_CST,
  AM_SECS,
  AM_TABS,
  ASSET_T,
  DONE_WO,
  FINAL_ASSET,
  LEVELS,
  OPEN_REQ,
  OWNER_TYPES,
  PERM_ROWS,
  WO_T,
} from './am.constants';

const LOCK = '🔒 Restricted';
type Ins = {
  id: string;
  asset: AAsset;
  t: string;
  ev: string;
  conf: string;
  as: string;
  act: string;
};

/** Server-built view-models for the 10 Assets & Maintenance screens (assets-core.js v*). */
@Injectable()
export class AmViewsService {
  constructor(
    private readonly ctx: AmContextService,
    private readonly data: AmDataService,
    private readonly settings: AmSettingsService,
    private readonly finAssets: FinanceAssetsService,
  ) {}

  // ── badges ──────────────────────────────────────────────────────────────
  chip(st: string) {
    const C = AM_CST[st] ?? ['#344054', '#F2F4F7', ''];
    return { t: (C[2] ? `${C[2]} ` : '') + st, fg: C[0], bg: C[1] };
  }
  stc(st: string) {
    const c = this.chip(st);
    return cell({ bt: c.t, bfg: c.fg, bbg: c.bg });
  }
  condc(c: string) {
    const C = AM_CONDC[c] ?? AM_CONDC.Unknown;
    return cell({ bt: `${C[2]} ${c}`, bfg: C[0], bbg: C[1] });
  }
  critc(c: string) {
    const C = AM_CRITC[c] ?? AM_CRITC.Medium;
    return cell({ bt: `${C[2]} ${c}`, bfg: C[0], bbg: C[1] });
  }
  money(d: Data, n: number | null) {
    return n == null ? '—' : d.fmt.money(n);
  }
  costOrLock(d: Data, n: number | null) {
    return d.a.cost ? this.money(d, n) : LOCK;
  }
  private dayOf(d: Data, x: Date | null | undefined) {
    return x ? d.fmt.day(x) : '—';
  }
  private relN(n: number | null) {
    if (n == null) return '—';
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    return n > 0 ? `in ${n}d` : `${Math.abs(n)}d ago`;
  }

  // ── header ──────────────────────────────────────────────────────────────

  header(d: Data) {
    const T = AM_TABS.find((t) => t[0] === d.s.tab) ?? AM_TABS[0];
    const cur = d.s.tab === 'detail' ? this.data.A(d, d.s.cur) : undefined;
    const a = d.a;
    const triage = d.requests.filter(
      (r) => r.status === 'Awaiting Triage' && d.ids.has(r.assetId),
    ).length;
    const odWo = d.wos.filter(
      (w) => d.ids.has(w.assetId) && this.data.woOverdue(d, w),
    ).length;
    const H: Record<string, ReturnType<typeof btn>[]> = {
      overview: [btn('add', 'Add Asset', 'primary', !a.create)],
      register: [
        btn('scan', 'Scan QR / Barcode'),
        btn('import', 'Import', 'ghost', !a.create),
        btn('add', 'Add Asset', 'primary', !a.create),
      ],
      detail: [],
      taxonomy: [],
      requests: [btn('newreq', '+ New Request', 'primary', !a.request)],
      workorders: [btn('newwo', '+ New Work Order', 'primary', !a.approve)],
      pm: [btn('newpm', '+ Create PM Plan', 'primary', !a.pm)],
      history: [btn('inspect', 'Record Inspection', 'primary', !a.complete)],
      analytics: [btn('export', 'Export', 'ghost', !a.export)],
      settings: [btn('audit', 'View audit')],
    };
    const branchOpts = d.group.filter(
      (g) => !a.branches || a.branches.includes(g.id),
    );
    return {
      title: cur ? cur.name : T[3],
      sub: cur
        ? `${cur.number} · ${this.data.catName(d, cur.categoryId)} · ${this.data.locShort(d, cur)}`
        : T[4],
      icon: T[5],
      roleLabel: `${a.roleLabel} · ${a.name}`,
      tabs: AM_TABS.map((t) => ({
        k: t[0],
        label: t[0] === 'detail' && cur ? cur.number : t[1],
        path: t[2],
        badge:
          t[0] === 'requests' && triage
            ? `${triage} triage`
            : t[0] === 'workorders' && odWo
              ? `${odWo} overdue`
              : null,
      })),
      hdrActs: H[d.s.tab] ?? [],
      sels: [
        {
          k: 'branch',
          l: 'Branch scope',
          v: d.s.branch,
          opts: [
            ...(a.branches ? [] : [{ v: '', t: 'All branches' }]),
            ...branchOpts.map((g) => ({ v: g.id, t: g.name })),
          ],
        },
        ...(['overview', 'analytics'].includes(d.s.tab)
          ? [
              {
                k: 'period',
                l: 'Date period',
                v: String(d.s.period),
                opts: [
                  { v: '30', t: 'Last 30 days' },
                  { v: '90', t: 'Last 90 days' },
                  { v: '365', t: 'Last 12 months' },
                ],
              },
            ]
          : []),
      ],
      more: [
        ...(a.export ? [{ v: 'export', t: 'Export' }] : []),
        ...(d.s.tab === 'register' ? [{ v: 'saveview', t: 'Save view' }] : []),
        { v: 'audit', t: 'Audit' },
        { v: 'fresh', t: 'Data freshness' },
        { v: 'scan', t: 'Scan QR / barcode' },
      ],
      loadedAt: d.now.toISOString(),
    };
  }

  async screen(a: AmActor, s: AmScope) {
    const d = await this.data.load(a, s);
    const head = this.header(d);
    if (s.tab === 'settings')
      return { head, settings: await this.vSettings(d) };
    const fn: Record<string, (d: Data) => unknown[] | Promise<unknown[]>> = {
      overview: (x) => this.vOverview(x),
      register: (x) => this.vRegister(x),
      detail: (x) => this.vDetail(x),
      taxonomy: (x) => this.vTaxonomy(x),
      requests: (x) => this.vRequests(x),
      workorders: (x) => this.vWorkOrders(x),
      pm: (x) => this.vPM(x),
      history: (x) => this.vHistory(x),
      analytics: (x) => this.vAnalytics(x),
    };
    const T = AM_TABS.findIndex((t) => t[0] === s.tab);
    return {
      head,
      rows: await (fn[s.tab] ?? fn.overview)(d),
      screenLabel: `${String(T + 1).padStart(2, '0')} ${(AM_TABS[T] ?? AM_TABS[0])[3]}`,
    };
  }

  // ===== 1 Overview ========================================================

  vOverview(d: Data) {
    const a = d.a;
    const L = d.assets;
    if (!d.all.length)
      return emptyRows(
        'No assets added yet.',
        'Register equipment, machinery, devices and customer assets to start tracking condition, maintenance and downtime.',
        [
          btn('add', 'Add First Asset', 'primary', !a.create),
          btn('import', 'Import from CSV', 'ghost', !a.create),
        ],
      );
    const ids = d.ids;
    const act = L.filter((x) => this.data.live(x));
    const plans = d.plans.filter(
      (p) => ids.has(p.assetId) && p.status === 'Active',
    );
    const dd = (p: APlan) => this.data.dueDay(d, p);
    const due = plans.filter((p) => dd(p) != null && dd(p)! <= 30);
    const od = plans.filter((p) => dd(p) != null && dd(p)! < 0);
    const reqs = d.requests.filter(
      (r) => ids.has(r.assetId) && OPEN_REQ.includes(r.status),
    );
    const wos = d.wos.filter(
      (w) => ids.has(w.assetId) && !DONE_WO.includes(w.status),
    );
    const down = act.filter(
      (x) =>
        this.data.isDown(d, x.id) ||
        ['Out of Service', 'Under Maintenance'].includes(x.status),
    );
    const wexp = act.filter((x) => {
      const n = this.data.wtyDays(d, x);
      return n != null && n >= 0 && n <= 90;
    });
    const P0 = this.data.periodStart(d);
    const done = d.wos.filter(
      (w) =>
        ids.has(w.assetId) && w.completedAt && w.completedAt.getTime() > P0,
    );
    const cost = done.reduce((s, w) => s + this.data.woCost(w), 0);
    const hs = act
      .map((x) => this.data.health(d, x))
      .filter((h) => h.score != null);
    const avgH = hs.length
      ? Math.round(hs.reduce((s, h) => s + h.score!, 0) / hs.length)
      : null;
    const numOf = (id: string) => this.data.A(d, id)?.number ?? '—';
    const kpis = [
      K(
        'k-active',
        'Total Active Assets',
        act.filter((x) => x.status !== 'In Storage').length,
        `${act.length} tracked · ${act.filter((x) => x.ownerType === 'Customer-owned').length} customer-owned`,
        null,
        '#12A150',
      ),
      K(
        'k-crit',
        'Critical Assets',
        act.filter((x) => x.criticality === 'Critical').length,
        `${act.filter((x) => x.criticality === 'Critical' && this.data.health(d, x).band !== 'Healthy').length} need attention`,
        '#B42318',
        '#F04438',
      ),
      K(
        'k-due',
        'Maintenance Due',
        due.length,
        `${od.length} overdue · next 30 days`,
        null,
        '#2E90FA',
      ),
      K(
        'k-od',
        'Overdue Maintenance',
        od.length,
        od.map((p) => numOf(p.assetId)).join(', ') || 'None',
        od.length ? '#B42318' : '#0E8442',
        '#F04438',
      ),
      K(
        'k-req',
        'Open Requests',
        reqs.length,
        `${reqs.filter((r) => r.status === 'Awaiting Triage').length} awaiting triage`,
        null,
        '#F79009',
      ),
      K(
        'k-wo',
        'Open Work Orders',
        wos.length,
        `${wos.filter((w) => this.data.woOverdue(d, w)).length} overdue`,
        null,
        '#6941C6',
      ),
      K(
        'k-down',
        'Assets Currently Down',
        down.length,
        down.map((x) => x.number).join(', ') || 'All operating',
        down.length ? '#B42318' : '#0E8442',
        '#F04438',
      ),
      K(
        'k-wty',
        'Warranty Expiring',
        wexp.length,
        'Next 90 days',
        wexp.length ? '#B54708' : null,
        '#F79009',
      ),
      K(
        'k-cost',
        'Maintenance Cost',
        a.cost ? this.money(d, cost) : '🔒',
        a.cost
          ? `Completed work orders · last ${d.s.period} days`
          : 'Needs View Cost permission',
        null,
        '#0A1B2A',
      ),
      K(
        'k-health',
        'Average Asset Health',
        avgH == null ? '—' : `${avgH} / 100`,
        `${hs.length} scored · ${act.length - hs.length} unknown condition`,
        null,
        '#12A150',
      ),
    ];
    const bandC: Record<string, string> = {
      Healthy: '#12A150',
      'Attention Needed': '#F79009',
      Critical: '#F04438',
      Unknown: '#98A2B3',
    };
    const bands: [string, number, string][] = [
      'Healthy',
      'Attention Needed',
      'Critical',
      'Unknown',
    ].map((b) => [
      b,
      act.filter((x) => this.data.health(d, x).band === b).length,
      bandC[b],
    ]);
    const bucket = (p: APlan) =>
      dd(p)! < 0
        ? 'Overdue'
        : dd(p) === 0
          ? 'Today'
          : dd(p)! <= 7
            ? 'Next 7 days'
            : 'Next 30 days';
    const tl = d.s.seg.ovDue || 'all';
    const dueL = due
      .filter((p) => tl === 'all' || bucket(p) === tl)
      .sort((x, y) => dd(x)! - dd(y)!);
    const dueT = {
      hasActs: true,
      cols: cols([
        'Asset',
        'Plan',
        'Due',
        ['Trigger', '1'],
        ['Responsible', '1'],
        'Priority',
      ]),
      rows: dueL.map((p) => {
        const x = this.data.A(d, p.assetId)!;
        const m = this.data.meterNow(d, x.id);
        const n = dd(p)!;
        return row(
          `${p.id}|${p.assetId}`,
          [
            cell({ t: x.number, s: x.name, fw: 800, fg: '#101828' }),
            cell({ t: p.name }),
            cell({
              bt: `${n < 0 ? '⚠ ' : ''}${this.relN(n)}`,
              bfg: n < 0 ? '#B42318' : n <= 7 ? '#B54708' : '#344054',
              bbg: n < 0 ? '#FEF3F2' : n <= 7 ? '#FEF6E7' : '#F2F4F7',
              s: p.nextDueOn ? this.dayOf(d, p.nextDueOn) : 'Due by meter',
            }),
            cell({
              t: this.trigText(d, p, x, m ? num(m.value) : null),
              opt: '1',
            }),
            cell({ t: this.data.assignee(d, p), opt: '1' }),
            this.critc(x.criticality),
          ],
          [...(a.pm ? ['Generate work order'] : []), 'Open asset', 'Open plan'],
          [
            `${x.number} · ${p.name}`,
            `${this.relN(n)} · ${this.data.assignee(d, p)}`,
            [],
          ],
        );
      }),
    };
    const risk = act
      .filter(
        (x) =>
          ['Critical', 'High'].includes(x.criticality) &&
          (this.data.health(d, x).band !== 'Healthy' ||
            this.data.isDown(d, x.id)),
      )
      .sort(
        (x, y) =>
          (this.data.health(d, x).score ?? 50) -
          (this.data.health(d, y).score ?? 50),
      );
    const riskT = {
      hasActs: true,
      cols: cols([
        'Asset',
        'Criticality',
        'Condition',
        'Open issue',
        ['Downtime (period)', '1'],
        ['Next maintenance', '1'],
        'Risk reason',
      ]),
      rows: risk.map((x) => {
        const h = this.data.health(d, x);
        const m = this.data.metrics(d, x.id);
        const n = this.data.nextDue(d, x.id);
        const rq = this.data.openReqs(d, x.id)[0];
        const wo = this.data.openWOs(d, x.id)[0];
        const iss = rq
          ? `${rq.number} · ${rq.title}`
          : wo
            ? `${wo.number} · ${wo.scope}`
            : '—';
        return row(
          x.id,
          [
            cell({ t: x.number, s: x.name, fw: 800, fg: '#101828' }),
            this.critc(x.criticality),
            this.condc(x.condition),
            cell({ t: iss.slice(0, 48), mw: '220px' }),
            cell({ t: this.data.fmtH(m.uh + m.ph), opt: '1' }),
            cell({ t: n ? this.relN(this.data.dueDay(d, n)) : '—', opt: '1' }),
            cell({
              t:
                h.factors
                  .filter((f) => f[1] < 0)
                  .map((f) => f[0])
                  .join(' · ') || `Condition ${x.condition}`,
              mw: '260px',
              fg: '#B42318',
            }),
          ],
          [
            'Open asset',
            ...(a.pm ? ['Schedule maintenance'] : []),
            'Why at risk?',
          ],
          [`${x.number} · ${x.name}`, `${h.band} · ${h.score ?? '—'}`, []],
        );
      }),
    };
    const dIn = d.down.filter(
      (x) => ids.has(x.assetId) && this.data.inPeriod(d, x),
    );
    const uh = dIn
      .filter((x) => x.kind === 'Unplanned')
      .reduce((s, x) => s + this.data.dHours(d, x, P0), 0);
    const tot = dIn.reduce((s, x) => s + this.data.dHours(d, x, P0), 0);
    const critH = dIn
      .filter((x) => this.data.A(d, x.assetId)?.criticality === 'Critical')
      .reduce((s, x) => s + this.data.dHours(d, x, P0), 0);
    const byA: Record<string, number> = {};
    dIn.forEach(
      (x) =>
        (byA[x.assetId] = (byA[x.assetId] ?? 0) + this.data.dHours(d, x, P0)),
    );
    const topA = Object.entries(byA).sort((x, y) => y[1] - x[1])[0];
    const wSel = d.s.seg.ovW || '90';
    const wL = act
      .filter((x) => {
        const n = this.data.wtyDays(d, x);
        return n != null && n >= 0 && n <= Number(wSel);
      })
      .sort((x, y) => this.data.wtyDays(d, x)! - this.data.wtyDays(d, y)!);
    const wCnt = (n: number) =>
      act.filter((x) => {
        const w = this.data.wtyDays(d, x);
        return w != null && w >= 0 && w <= n;
      }).length;
    const rec = d.wos
      .filter(
        (w) => ids.has(w.assetId) && ['Closed', 'Completed'].includes(w.status),
      )
      .sort(
        (x, y) =>
          (y.completedAt?.getTime() ?? 0) - (x.completedAt?.getTime() ?? 0),
      )
      .slice(0, 6);
    const kv = (k: string, v: string, i: number) =>
      row(
        `d${i}`,
        [cell({ t: k, fw: 700, fg: '#101828' }), cell({ t: v })],
        [],
        [k, v, []],
      );
    return [
      kpiRow(kpis),
      R('minmax(0,1fr) minmax(0,1.6fr)', [
        card({
          id: 'ov-health',
          title: 'Asset health',
          sub: 'Transparent score: condition, open issues, overdue PM, failures, downtime and inspections. Click a band to filter the register.',
          bars: mkBars(bands, null, (v) => `${v} assets`),
          acts: bands.map((b) => btn(`band:${b[0]}`, `${b[0]} (${b[1]})`)),
        }),
        card({
          id: 'ov-due',
          title: 'Maintenance due',
          sub: `${dueL.length} plan(s)`,
          seg: seg(
            [
              ['all', 'All', due.length],
              [
                'Overdue',
                'Overdue',
                due.filter((p) => bucket(p) === 'Overdue').length,
              ],
              [
                'Today',
                'Today',
                due.filter((p) => bucket(p) === 'Today').length,
              ],
              [
                'Next 7 days',
                'Next 7 days',
                due.filter((p) => bucket(p) === 'Next 7 days').length,
              ],
              [
                'Next 30 days',
                'Next 30 days',
                due.filter((p) => bucket(p) === 'Next 30 days').length,
              ],
            ],
            tl,
          ),
          table: dueL.length ? dueT : null,
          empty: dueL.length
            ? null
            : {
                t: plans.length
                  ? 'Nothing due in this window.'
                  : 'No preventive plans yet.',
                d: '',
                acts: plans.length
                  ? []
                  : [btn('newpm', 'Create PM Plan', 'primary', !a.pm)],
              },
        }),
      ]),
      R('minmax(0,1fr)', [
        card({
          id: 'ov-risk',
          title: 'Critical asset risk',
          sub: 'High and critical assets that are unhealthy or down',
          table: risk.length ? riskT : null,
          empty: risk.length
            ? null
            : { t: 'No critical assets at risk.', d: '', acts: [] },
        }),
      ]),
      R('minmax(0,1fr) minmax(0,1fr)', [
        card({
          id: 'ov-down',
          title: `Downtime snapshot · last ${d.s.period} days`,
          table: {
            hasActs: false,
            cols: cols(['Measure', 'Value']),
            rows: [
              kv(
                'Assets currently down',
                `${down.length}${down.length ? ` — ${down.map((x) => x.number).join(', ')}` : ''}`,
                0,
              ),
              kv(
                'Downtime hours',
                `${this.data.fmtH(tot)} (${this.data.fmtH(uh)} unplanned)`,
                1,
              ),
              kv('Critical-asset downtime', this.data.fmtH(critH), 2),
              kv(
                'Top downtime asset',
                topA
                  ? `${numOf(topA[0])} · ${this.data.A(d, topA[0])?.name ?? ''} · ${this.data.fmtH(topA[1])}`
                  : '—',
                3,
              ),
            ],
          },
          acts: [btn('to-analytics', 'Open downtime analytics')],
        }),
        card({
          id: 'ov-wty',
          title: 'Warranty expiring',
          seg: seg(
            [
              ['30', '30 days', wCnt(30)],
              ['60', '60 days', wCnt(60)],
              ['90', '90 days', wCnt(90)],
            ],
            wSel,
          ),
          table: wL.length
            ? {
                hasActs: true,
                cols: cols(['Asset', 'Provider', 'Expiry', 'Coverage']),
                rows: wL.map((x) =>
                  row(
                    x.id,
                    [
                      cell({ t: x.number, s: x.name, fw: 800, fg: '#101828' }),
                      cell({ t: x.warrantyProvider ?? '—' }),
                      cell({
                        t: this.dayOf(d, x.warrantyEnd),
                        s: this.relN(this.data.wtyDays(d, x)),
                        fg: this.data.wty(d, x)[1],
                        fw: 700,
                      }),
                      cell({ t: x.warrantyType ?? '—' }),
                    ],
                    [
                      'Open asset',
                      ...(d.docs.some(
                        (z) => z.assetId === x.id && z.type === 'Warranty',
                      )
                        ? ['Open warranty document']
                        : []),
                    ],
                    [
                      x.number,
                      `${x.warrantyProvider ?? '—'} · ${this.dayOf(d, x.warrantyEnd)}`,
                      [],
                    ],
                  ),
                ),
              }
            : null,
          empty: wL.length
            ? null
            : { t: 'No warranties expire in this window.', d: '', acts: [] },
          info: 'Warranty documents are stored on each asset (Documents tab); dates are the asset’s warranty record.',
        }),
      ]),
      R('minmax(0,1fr)', [
        card({
          id: 'ov-rec',
          title: 'Recent maintenance',
          table: rec.length
            ? {
                hasActs: true,
                cols: cols([
                  'Date',
                  'Asset',
                  'Type',
                  'Result',
                  ['Team / vendor', '1'],
                  'Downtime',
                  ['Cost', '1'],
                  'Status',
                ]),
                rows: rec.map((w) => {
                  const x = this.data.A(d, w.assetId)!;
                  const dts = d.down.filter((z) => z.woId === w.id);
                  return row(
                    `${w.id}|${w.assetId}`,
                    [
                      cell({ t: this.dayOf(d, w.completedAt) }),
                      cell({ t: x.number, s: x.name, fw: 700, fg: '#101828' }),
                      cell({ t: w.type }),
                      cell({
                        t: w.outcome ?? '—',
                        fg: w.outcome === 'Resolved' ? '#0E8442' : '#B54708',
                        fw: 700,
                      }),
                      cell({ t: this.data.assignee(d, w), opt: '1' }),
                      cell({
                        t: dts.length
                          ? this.data.fmtH(
                              dts.reduce(
                                (s, z) => s + this.data.dHours(d, z),
                                0,
                              ),
                            )
                          : '—',
                      }),
                      cell({
                        t: this.costOrLock(d, this.data.woCost(w)),
                        opt: '1',
                      }),
                      this.stc(w.status),
                    ],
                    ['Open work order', 'Open asset'],
                    [
                      `${w.number} · ${x.name}`,
                      `${this.dayOf(d, w.completedAt)} · ${w.outcome ?? ''}`,
                      [],
                    ],
                  );
                }),
              }
            : null,
          empty: rec.length
            ? null
            : { t: 'No completed maintenance yet.', d: '', acts: [] },
        }),
      ]),
      R(
        'minmax(0,1fr)',
        [
          card({
            id: 'ov-quick',
            title: 'Quick actions',
            acts: (
              [
                ['add', 'Add Asset', a.create],
                ['newreq', 'Create Maintenance Request', a.request],
                ['newwo', 'Create Work Order', a.approve],
                ['newpm', 'Create PM Plan', a.pm],
                ['inspect', 'Record Inspection', a.complete],
                ['reading', 'Record Meter Reading', a.reading],
              ] as [string, string, boolean][]
            )
              .filter((x) => x[2])
              .map(([k, t]) => btn(k, t)),
            info: 'Only actions your role can perform are shown.',
          }),
        ],
        false,
      ),
    ];
  }

  trigText(d: Data, p: APlan, x: AAsset, meter: number | null) {
    if (p.trigger === 'Time') return `Every ${p.interval} ${p.unit}`;
    const due =
      p.nextDueMeter != null
        ? `${num(p.nextDueMeter).toLocaleString()} ${x.meterUnit ?? ''}`
        : '';
    return `${p.trigger} · ${due}${meter != null ? ` (now ${meter.toLocaleString()})` : ''}`;
  }

  // ===== 2 Register ========================================================

  regFiltered(d: Data) {
    const f = d.s.f.reg ?? {};
    const q = (f.q ?? '').trim().toLowerCase();
    const catKids = (id: string) =>
      d.cats.filter((c) => c.parentId === id).map((c) => c.id);
    const inLoc = (x: AAsset, lid: string) => {
      if (lid.startsWith('b:')) return x.branchId === lid.slice(2);
      let l = this.data.loc(d, x.locationId);
      let g = 0;
      while (l && g++ < 20) {
        if (l.id === lid) return true;
        l = this.data.loc(d, l.parentId);
      }
      return false;
    };
    const L = d.assets.filter((x) => {
      if (!d.s.arch && x.status === 'Archived' && f.st !== 'Archived')
        return false;
      if (q) {
        const hay = [
          x.number,
          x.name,
          x.serial,
          x.tag,
          x.barcode,
          `asset/${x.id}`,
          x.manufacturer,
          x.model,
          x.customerId ? d.customers.get(x.customerId) : '',
          this.data.locPath(d, x.locationId, x.branchId),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (f.st && x.status !== f.st) return false;
      if (f.cond && x.condition !== f.cond) return false;
      if (f.crit && x.criticality !== f.crit) return false;
      if (f.owner && x.ownerType !== f.owner) return false;
      if (
        f.cat &&
        x.categoryId !== f.cat &&
        !catKids(f.cat).includes(x.categoryId ?? '')
      )
        return false;
      if (f.loc && !inLoc(x, f.loc)) return false;
      if (f.health && this.data.health(d, x).band !== f.health) return false;
      if (f.wty) {
        const n = this.data.wtyDays(d, x);
        if (f.wty === 'Expiring 90d' && !(n != null && n >= 0 && n <= 90))
          return false;
        if (f.wty === 'Expired' && !(n != null && n < 0)) return false;
        if (f.wty === 'None' && n != null) return false;
      }
      if (f.due) {
        const ps = this.data
          .plansOf(d, x.id)
          .filter((p) => p.status === 'Active');
        const ok =
          f.due === 'Overdue'
            ? ps.some((p) => this.data.isOverdue(d, p))
            : ps.some((p) => (this.data.dueDay(d, p) ?? 999) <= 30);
        if (!ok) return false;
      }
      if (f.team && x.teamId !== f.team) return false;
      if (f.noloc === '1' && (x.locationId || x.branchId)) return false;
      return true;
    });
    const k = d.s.sort;
    const ord = ['Critical', 'High', 'Medium', 'Low'];
    return L.sort((x, y) => {
      if (k === 'name') return x.name.localeCompare(y.name);
      if (k === 'crit')
        return ord.indexOf(x.criticality) - ord.indexOf(y.criticality);
      if (k === 'due') {
        const nx = this.data.nextDue(d, x.id);
        const ny = this.data.nextDue(d, y.id);
        return (
          (nx ? this.data.dueDay(d, nx)! : 999) -
          (ny ? this.data.dueDay(d, ny)! : 999)
        );
      }
      if (k === 'health')
        return (
          (this.data.health(d, x).score ?? 101) -
          (this.data.health(d, y).score ?? 101)
        );
      return x.number.localeCompare(y.number, undefined, { numeric: true });
    });
  }

  async vRegister(d: Data) {
    const a = d.a;
    const all = d.assets;
    if (!d.all.length)
      return emptyRows(
        'Track equipment, machinery, devices and customer assets here.',
        'Each physical item gets its own record — two identical laptops are two assets.',
        [
          btn('add', 'Add Asset', 'primary', !a.create),
          btn('import', 'Import', 'ghost', !a.create),
        ],
      );
    const f = d.s.f.reg ?? {};
    const L = this.regFiltered(d);
    const per = 10;
    const pages = Math.max(1, Math.ceil(L.length / per));
    const pg = Math.min(d.s.page.reg ?? 0, pages - 1);
    const P = L.slice(pg * per, pg * per + per);
    const live = all.filter((x) => x.status !== 'Archived');
    const cnt = (fn: (x: AAsset) => boolean) => live.filter(fn).length;
    const kpis = [
      K(
        'r-all',
        'Total Assets',
        live.length,
        'Excluding archived',
        null,
        '#12A150',
      ),
      K(
        'r-Active',
        'Active',
        cnt((x) => x.status === 'Active'),
        '',
        null,
        '#12A150',
      ),
      K(
        'r-Under Maintenance',
        'Under Maintenance',
        cnt((x) => x.status === 'Under Maintenance'),
        '',
        null,
        '#2E90FA',
      ),
      K(
        'r-Out of Service',
        'Out of Service',
        cnt((x) => x.status === 'Out of Service'),
        '',
        cnt((x) => x.status === 'Out of Service') ? '#B42318' : null,
        '#F04438',
      ),
      K(
        'r-crit',
        'Critical',
        cnt((x) => x.criticality === 'Critical'),
        'Criticality level',
        null,
        '#F04438',
      ),
      K(
        'r-cust',
        'Customer-Owned',
        cnt((x) => x.ownerType === 'Customer-owned'),
        'Customer identity from CRM',
        null,
        '#6941C6',
      ),
      K(
        'r-wty',
        'Warranty Expiring',
        cnt((x) => {
          const n = this.data.wtyDays(d, x);
          return n != null && n >= 0 && n <= 90;
        }),
        'Next 90 days',
        null,
        '#F79009',
      ),
      K(
        'r-noloc',
        'Unassigned Location',
        cnt((x) => !x.locationId),
        'Assets without a location',
        null,
        '#98A2B3',
      ),
    ];
    const cs = d.s.seg.reg || 'def';
    const extra: Record<string, string[]> = {
      id: ['Serial number', 'Manufacturer', 'Model', 'Barcode'],
      dates: [
        'Purchase date',
        'Install date',
        'Warranty expiry',
        'Last service',
      ],
      ops: ['Meter reading', 'Assigned team', 'Branch', 'Lifecycle cost'],
    };
    const base: (string | [string, string])[] = [
      'Asset #',
      'Asset name',
      ['Category', '1'],
      ['Owner', '1'],
      'Location',
      'Condition',
      'Criticality',
      'Status',
      'Next maintenance',
    ];
    const colList = [
      ...base,
      ...(extra[cs] ?? []).map((x): [string, string] => [x, '1']),
    ];
    const rows = P.map((x) => {
      const n = this.data.nextDue(d, x.id);
      const nd = n ? this.data.dueDay(d, n) : null;
      const m = this.data.meterNow(d, x.id);
      const ls = this.data.lastService(d, x.id);
      const life =
        d.wos
          .filter((w) => w.assetId === x.id)
          .reduce((s, w) => s + this.data.woCost(w), 0) + num(x.cost);
      const ex: Record<string, ReturnType<typeof cell>> = {
        'Serial number': cell({
          t: x.serial ?? '—',
          ff: 'ui-monospace,monospace',
          opt: '1',
        }),
        Manufacturer: cell({ t: x.manufacturer ?? '—', opt: '1' }),
        Model: cell({ t: x.model ?? '—', opt: '1' }),
        Barcode: cell({
          t: x.barcode ?? '—',
          ff: 'ui-monospace,monospace',
          opt: '1',
        }),
        'Purchase date': cell({ t: this.dayOf(d, x.purchasedOn), opt: '1' }),
        'Install date': cell({ t: this.dayOf(d, x.installedOn), opt: '1' }),
        'Warranty expiry': cell({
          t: this.data.wty(d, x)[0],
          fg: this.data.wty(d, x)[1],
          opt: '1',
        }),
        'Last service': cell({
          t: ls ? this.dayOf(d, ls.occurredAt) : '—',
          opt: '1',
        }),
        'Meter reading': cell({
          t: m ? `${num(m.value).toLocaleString()} ${x.meterUnit ?? ''}` : '—',
          opt: '1',
        }),
        'Assigned team': cell({ t: this.data.person(d, x.teamId), opt: '1' }),
        Branch: cell({ t: this.data.branchName(d, x.branchId), opt: '1' }),
        'Lifecycle cost': cell({ t: this.costOrLock(d, life), opt: '1' }),
      };
      return row(
        x.id,
        [
          cell({
            t: x.number,
            fw: 800,
            fg: '#101828',
            ff: 'ui-monospace,monospace',
            s: x.tag ?? '',
          }),
          cell({ t: x.name, fw: 700, fg: '#101828', mw: '220px' }),
          cell({ t: this.data.catName(d, x.categoryId), opt: '1' }),
          cell({ t: this.data.ownerLabel(d, x), opt: '1' }),
          cell({ t: this.data.locShort(d, x), mw: '180px' }),
          this.condc(x.condition),
          this.critc(x.criticality),
          this.stc(x.status),
          n
            ? cell({
                t: this.relN(nd),
                fg: (nd ?? 0) < 0 ? '#B42318' : '#344054',
                fw: (nd ?? 0) < 0 ? 800 : 500,
                s: n.name,
              })
            : cell({ t: '—' }),
          ...(extra[cs] ?? []).map((k) => ex[k]),
        ],
        this.rowActs(d, x),
        [
          `${x.number} · ${x.name}`,
          `${this.data.locShort(d, x)} · next ${n ? this.relN(nd) : '—'}`,
          [
            this.chip(x.status),
            {
              t: x.condition,
              fg: AM_CONDC[x.condition]?.[0] ?? '#475467',
              bg: AM_CONDC[x.condition]?.[1] ?? '#F2F4F7',
            },
            {
              t: x.criticality,
              fg: AM_CRITC[x.criticality]?.[0] ?? '#475467',
              bg: AM_CRITC[x.criticality]?.[1] ?? '#F2F4F7',
            },
          ],
        ],
      );
    });
    const views = await this.ctx.db.amSavedView.findMany({
      where: { businessId: a.rootId, userId: a.userId },
      orderBy: { name: 'asc' },
    });
    const locOpts: [string, string][] = [
      ...d.group
        .filter((g) => !a.branches || a.branches.includes(g.id))
        .map((g): [string, string] => [`b:${g.id}`, g.name]),
      ...d.locs
        .filter(
          (l) => l.status === 'Active' && ['Site', 'Building'].includes(l.type),
        )
        .map((l): [string, string] => [l.id, `— ${l.name}`]),
    ];
    const fv = (k: string) => f[k] ?? '';
    const sels = [
      sel2('view', 'Saved view', f.view ?? '', [
        ['', 'Saved view: All assets'],
        ...views.map((v): [string, string] => [v.id, `View: ${v.name}`]),
      ]),
      sel2('st', 'Status', fv('st'), [
        ['', 'Any status'],
        ...d.cfg.statuses.allowed.map((x): [string, string] => [x, x]),
      ]),
      sel2('cond', 'Condition', fv('cond'), [
        ['', 'Any condition'],
        ...['Excellent', 'Good', 'Fair', 'Poor', 'Critical', 'Unknown'].map(
          (x): [string, string] => [x, x],
        ),
      ]),
      sel2('crit', 'Criticality', fv('crit'), [
        ['', 'Any criticality'],
        ...LEVELS.map((x): [string, string] => [x, x]),
      ]),
      sel2('owner', 'Owner type', fv('owner'), [
        ['', 'Any owner'],
        ...OWNER_TYPES.map((x): [string, string] => [x, x]),
      ]),
      sel2('cat', 'Category', fv('cat'), [
        ['', 'Any category'],
        ...d.cats.map((c): [string, string] => [
          c.id,
          (c.parentId ? '— ' : '') + c.name,
        ]),
      ]),
      sel2('loc', 'Location', fv('loc'), [['', 'Any location'], ...locOpts]),
      sel2('health', 'Health', fv('health'), [
        ['', 'Any health'],
        ...['Healthy', 'Attention Needed', 'Critical', 'Unknown'].map(
          (x): [string, string] => [x, x],
        ),
      ]),
      sel2('wty', 'Warranty', fv('wty'), [
        ['', 'Any warranty'],
        ['Expiring 90d', 'Expiring in 90 days'],
        ['Expired', 'Expired'],
        ['None', 'No warranty'],
      ]),
      sel2('due', 'Maintenance due', fv('due'), [
        ['', 'Any due state'],
        ['Overdue', 'Overdue'],
        ['30d', 'Due in 30 days'],
      ]),
      sel2('team', 'Assigned team', fv('team'), [
        ['', 'Any team'],
        ...d.teams.map((t): [string, string] => [t.id, t.name]),
      ]),
      sel2('__sort', 'Sort', d.s.sort, [
        ['num', 'Sort: Asset #'],
        ['name', 'Sort: Name'],
        ['crit', 'Sort: Criticality'],
        ['due', 'Sort: Next due'],
        ['health', 'Sort: Health (worst first)'],
      ]),
    ];
    const nOn = [
      'q',
      'st',
      'cond',
      'crit',
      'owner',
      'cat',
      'loc',
      'health',
      'wty',
      'due',
      'team',
    ].filter((k) => f[k]).length;
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'reg',
          seg: seg(
            [
              ['def', 'Default columns'],
              ['id', '+ Identification'],
              ['dates', '+ Dates'],
              ['ops', '+ Operations & cost'],
            ],
            cs,
          ),
          filters: {
            search:
              'Search asset #, name, serial, tag, barcode, QR, customer, location, manufacturer, model',
            q: f.q ?? '',
            sels,
            nOn: nOn || null,
            count: `${L.length} of ${all.length} assets`,
          },
          acts: [
            btn('saveview', 'Save view'),
            btn('toggleArch', d.s.arch ? 'Hide archived' : 'Show archived'),
            btn('export', 'Export', 'ghost', !a.export),
          ],
          bulk:
            a.edit || a.pm
              ? {
                  acts: (
                    [
                      ['bk-loc', 'Assign location'],
                      ['bk-cat', 'Assign category'],
                      ['bk-crit', 'Change criticality'],
                      ['bk-team', 'Assign team'],
                      ['bk-pm', 'Apply PM template'],
                      ['bk-arch', 'Archive'],
                    ] as [string, string][]
                  ).map(([k, t]) =>
                    btn(
                      k,
                      t,
                      k === 'bk-arch' ? 'danger' : 'ghost',
                      !(k === 'bk-pm' ? a.pm : a.edit),
                    ),
                  ),
                }
              : null,
          table: L.length
            ? { sel: a.edit || a.pm, hasActs: true, cols: cols(colList), rows }
            : null,
          empty: L.length
            ? null
            : {
                t: 'No assets match these filters.',
                d: '',
                acts: [btn('rclear', 'Clear filters', 'primary')],
              },
          pager:
            L.length > per
              ? {
                  t: `Showing ${pg * per + 1}–${Math.min(L.length, pg * per + per)} of ${L.length}`,
                  noPrev: pg === 0,
                  noNext: pg >= pages - 1,
                }
              : null,
        }),
      ]),
    ];
  }

  rowActs(d: Data, x: AAsset) {
    const a = d.a;
    const fin = FINAL_ASSET.includes(x.status);
    return [
      'Open',
      ...(fin
        ? []
        : [
            ...(a.request ? ['Create request'] : []),
            ...(a.reading && x.meterType ? ['Record reading'] : []),
            ...(a.pm ? ['Schedule maintenance'] : []),
            ...(a.edit ? ['Edit'] : []),
            ...(a.transfer ? ['Transfer'] : []),
            ...(a.retire ? ['Retire / dispose'] : []),
          ]),
      'Print QR',
      ...(a.edit && (ASSET_T[x.status] ?? []).includes('Archived')
        ? ['Archive']
        : []),
    ];
  }

  // ===== 3 Asset Detail ====================================================

  async vDetail(d: Data) {
    const a = d.a;
    const x = this.data.A(d, d.s.cur);
    if (!x || !d.ids.has(x.id))
      return emptyRows(
        'Pick an asset to see its full record.',
        'Open any asset from the register, or scan its QR code.',
        [
          btn('toreg', 'Open Asset Register', 'primary'),
          btn('scan', 'Scan QR / barcode'),
        ],
      );
    const fin = FINAL_ASSET.includes(x.status);
    const h = this.data.health(d, x);
    const n = this.data.nextDue(d, x.id);
    const ls = this.data.lastService(d, x.id);
    const m = this.data.meterNow(d, x.id);
    const yStart = Date.UTC(d.now.getUTCFullYear(), 0, 1);
    const yDown = d.down
      .filter((z) => z.assetId === x.id && this.data.dEnd(d, z) > yStart)
      .reduce((s, z) => s + this.data.dHours(d, z, yStart), 0);
    const yCost = d.wos
      .filter(
        (w) =>
          w.assetId === x.id &&
          w.completedAt &&
          w.completedAt.getTime() >= yStart,
      )
      .reduce((s, w) => s + this.data.woCost(w), 0);
    const w = this.data.wty(d, x);
    const openN =
      this.data.openWOs(d, x.id).length + this.data.openReqs(d, x.id).length;
    const primary = fin
      ? null
      : openN
        ? btn('d-openwo', `Open active work (${openN})`, 'primary')
        : btn('d-req', 'Create Maintenance Request', 'primary', !a.request);
    const prod = x.productId ? d.products.get(x.productId) : null;
    const more = [
      { v: '', t: 'More…' },
      ...(fin
        ? []
        : [
            ...(a.transfer ? [{ v: 'Transfer', t: 'Transfer' }] : []),
            ...(a.retire
              ? [{ v: 'Retire / dispose', t: 'Retire / dispose' }]
              : []),
            ...(a.edit ? [{ v: 'Change status', t: 'Change status' }] : []),
          ]),
      ...(a.edit && (ASSET_T[x.status] ?? []).includes('Archived')
        ? [{ v: 'Archive', t: 'Archive' }]
        : []),
      { v: 'Print QR', t: 'Print QR' },
      { v: 'History', t: 'History' },
      { v: 'Audit', t: 'Audit' },
    ];
    const head = card({
      id: 'd-head',
      title: `${x.name} · ${x.number}`,
      sub: [
        x.status,
        `Condition ${x.condition}`,
        `Criticality ${x.criticality}`,
        this.data.locPath(d, x.locationId, x.branchId),
        this.data.ownerLabel(d, x),
        `Tag ${x.tag ?? '—'} · Serial ${x.serial ?? '—'}`,
      ].join('  ·  '),
      acts: [
        ...(primary ? [primary] : []),
        ...(fin
          ? []
          : [
              btn('d-edit', 'Edit', 'ghost', !a.edit),
              ...(x.meterType
                ? [btn('d-read', 'Record Reading', 'ghost', !a.reading)]
                : []),
              btn('d-sched', 'Schedule Maintenance', 'ghost', !a.pm),
            ]),
      ],
      info:
        [
          fin
            ? `This asset is ${x.status.toLowerCase()}. History, costs, inspections, documents and audit are preserved; future PM plans are closed.`
            : '',
          prod
            ? `Catalog product: ${prod.name} (Products & Services) — this record is one physical instance of it.`
            : '',
        ]
          .filter(Boolean)
          .join(' ') || null,
      filters: {
        search: null,
        q: '',
        sels: [
          sel2(
            '__more',
            'More actions',
            '',
            more.map((o): [string, string] => [o.v, o.t]),
          ),
        ],
        nOn: null,
        count: '',
      },
    });
    const CC = AM_CONDC[x.condition] ?? AM_CONDC.Unknown;
    const SC = AM_CST[x.status] ?? ['#344054', '#F2F4F7', ''];
    const kpis = [
      K(
        'dk-cond',
        'Current Condition',
        x.condition,
        `Health ${h.score ?? '—'} · ${h.band}`,
        CC[0],
        CC[0],
      ),
      K(
        'dk-st',
        'Current Status',
        x.status,
        this.data.isDown(d, x.id)
          ? 'Downtime open'
          : 'Separate from work-order status',
        SC[0],
        SC[0],
      ),
      K(
        'dk-next',
        'Next Maintenance',
        n ? this.relN(this.data.dueDay(d, n)) : '—',
        n ? n.name : 'No active plan',
        n && (this.data.dueDay(d, n) ?? 0) < 0 ? '#B42318' : null,
        '#2E90FA',
      ),
      K(
        'dk-last',
        'Last Service',
        ls ? this.dayOf(d, ls.occurredAt) : '—',
        ls ? ls.summary.slice(0, 42) : 'None recorded',
        null,
        '#12A150',
      ),
      K(
        'dk-meter',
        'Current Meter',
        m ? `${num(m.value).toLocaleString()} ${x.meterUnit ?? ''}` : '—',
        m
          ? `${d.fmt.rel(m.takenAt)} · ${m.source}`
          : x.meterType
            ? 'No readings yet'
            : 'No meter',
        null,
        '#6941C6',
      ),
      K(
        'dk-down',
        'Downtime YTD',
        this.data.fmtH(yDown),
        `${d.down.filter((z) => z.assetId === x.id).length} event(s)`,
        yDown ? '#B42318' : null,
        '#F04438',
      ),
      K(
        'dk-cost',
        'Maintenance Cost YTD',
        this.costOrLock(d, yCost),
        'Operational cost refs · Finance is the ledger',
        null,
        '#0A1B2A',
      ),
      K(
        'dk-wty',
        'Warranty',
        w[0],
        x.warrantyProvider
          ? `${x.warrantyProvider} · ${x.warrantyType ?? '—'}`
          : '—',
        w[1],
        w[1],
      ),
    ];
    const tab = d.s.seg.d || 'overview';
    const block = await this.detailTab(d, x, tab);
    return [
      R('minmax(0,1fr)', [head], false),
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: `d-${tab}`,
          seg: seg(
            [
              ['overview', 'Overview'],
              ['maint', 'Maintenance'],
              ['insp', 'Inspections'],
              ['meter', 'Meter Readings'],
              ['down', 'Downtime'],
              ['costs', 'Costs'],
              ['docs', 'Documents'],
              ['rel', 'Relationships'],
              ['tl', 'Timeline'],
              ['audit', 'Audit'],
            ],
            tab,
          ),
          ...block,
        }),
      ]),
    ];
  }

  kvT(pairs: [string, string | null | undefined][]) {
    return {
      hasActs: false,
      cols: cols(['Field', 'Value']),
      rows: pairs.map(([k, v], i) =>
        row(
          `kv${i}`,
          [
            cell({ t: k, fw: 700, fg: '#101828' }),
            cell({ t: v == null || v === '' ? '—' : String(v), mw: '420px' }),
          ],
          [],
          [k, String(v ?? '—'), []],
        ),
      ),
    };
  }

  async detailTab(
    d: Data,
    x: AAsset,
    tab: string,
  ): Promise<Record<string, unknown>> {
    const a = d.a;
    const fin = FINAL_ASSET.includes(x.status);
    const db = this.ctx.db;
    if (tab === 'overview') {
      const h = this.data.health(d, x);
      const par = this.data.A(d, x.parentId);
      const fa = x.finAssetId ? d.finAssets.get(x.finAssetId) : null;
      let finTxt = 'Not capitalised — no Finance fixed asset linked';
      if (fa) {
        if (!a.cost) finTxt = `${fa.number} · 🔒`;
        else {
          const acc =
            (await this.finAssets.accumulated(a.rootId)).get(fa.id) ?? 0;
          finTxt = `${fa.number} · ${fa.status} · cost ${this.money(d, fa.cost)}· depreciation posted ${this.money(d, acc)} · book value ${this.money(d, fa.cost - acc)} (Finance & Accounting)`;
        }
      }
      const custom = (x.custom ?? {}) as Record<string, unknown>;
      return {
        table: this.kvT([
          ['Asset number', x.number],
          [
            'Tag · barcode · QR',
            `${x.tag ?? '—'} · ${x.barcode ?? '—'} · asset/${x.id}`,
          ],
          ['Serial', x.serial],
          [
            'Manufacturer / model',
            `${x.manufacturer ?? '—'} · ${x.model ?? '—'}`,
          ],
          ['Category', this.data.catName(d, x.categoryId)],
          [
            'Ownership',
            `${x.ownerType}${x.customerId ? ` — ${d.customers.get(x.customerId) ?? '—'} (CRM)` : ''}`,
          ],
          ['Location', this.data.locPath(d, x.locationId, x.branchId)],
          ['Responsible team', this.data.person(d, x.teamId)],
          [
            'Purchase / install',
            `${this.dayOf(d, x.purchasedOn)} / ${this.dayOf(d, x.installedOn)}`,
          ],
          [
            'Purchase cost',
            x.cost == null ? '—' : this.costOrLock(d, num(x.cost)),
          ],
          ['Finance asset ref', finTxt],
          [
            'Warranty',
            x.warrantyProvider
              ? `${x.warrantyProvider} · ${x.warrantyType ?? '—'} · ${this.dayOf(d, x.warrantyStart)} → ${this.dayOf(d, x.warrantyEnd)}`
              : 'None',
          ],
          ['Criticality', x.criticality],
          [
            'Health score',
            h.score == null
              ? 'Unknown'
              : `${h.score} / 100 — ${h.factors.map((f) => `${f[0]} (${f[1]})`).join(' · ')}`,
          ],
          ['Parent asset', par ? `${par.number} · ${par.name}` : '—'],
          ...d.cfields
            .filter((cf) => custom[cf.id] != null && custom[cf.id] !== '')
            .map((cf): [string, string] => [
              cf.name,
              String(
                cf.type === 'Staff reference'
                  ? this.data.person(d, String(custom[cf.id]))
                  : custom[cf.id],
              ),
            ]),
          ['Record version', `v${x.version}`],
        ]),
      };
    }
    if (tab === 'maint') {
      const reqs = d.requests.filter((r) => r.assetId === x.id);
      const wos = d.wos.filter((w) => w.assetId === x.id);
      const pl = this.data.plansOf(d, x.id);
      const rows = [
        ...reqs.map((r) =>
          row(
            `rq:${r.id}`,
            [
              cell({ t: r.number, fw: 800, fg: '#101828' }),
              cell({ t: `Request · ${r.issueType}` }),
              cell({ t: r.title, mw: '280px' }),
              this.stc(r.status),
              cell({ t: this.dayOf(d, r.createdAt) }),
            ],
            ['Open'],
            [r.number, r.title, []],
          ),
        ),
        ...wos.map((w) =>
          row(
            `wo:${w.id}`,
            [
              cell({ t: w.number, fw: 800, fg: '#101828' }),
              cell({ t: `Work order · ${w.type}` }),
              cell({ t: w.scope, mw: '280px' }),
              this.stc(w.status),
              cell({
                t: w.completedAt
                  ? `Done ${this.dayOf(d, w.completedAt)}`
                  : `Due ${this.dayOf(d, w.dueAt)}`,
                fg: this.data.woOverdue(d, w) ? '#B42318' : '#344054',
              }),
            ],
            ['Open'],
            [w.number, w.scope, []],
          ),
        ),
        ...pl.map((p) =>
          row(
            `pm:${p.id}`,
            [
              cell({ t: p.number, fw: 800, fg: '#101828' }),
              cell({ t: `PM plan · ${p.trigger}` }),
              cell({ t: p.name }),
              this.stc(p.status),
              cell({
                t: p.nextDueOn
                  ? `Next ${this.dayOf(d, p.nextDueOn)}`
                  : `Next at ${num(p.nextDueMeter).toLocaleString()} ${x.meterUnit ?? ''}`,
              }),
            ],
            ['Open'],
            [p.name, p.status, []],
          ),
        ),
      ];
      return {
        table: rows.length
          ? {
              hasActs: true,
              cols: cols(['Record', 'Type', 'Summary', 'Status', 'Due / date']),
              rows,
            }
          : null,
        empty: rows.length
          ? null
          : { t: 'No maintenance records yet.', d: '', acts: [] },
        acts: fin
          ? []
          : [
              btn('d-req', 'New request', 'ghost', !a.request),
              btn('d-wo', 'New work order', 'ghost', !a.approve),
              btn('d-sched', 'New PM plan', 'ghost', !a.pm),
            ],
      };
    }
    if (tab === 'insp') {
      const L = d.events.filter(
        (e) => e.assetId === x.id && e.type === 'Inspection',
      );
      return {
        table: L.length
          ? {
              hasActs: true,
              cols: cols([
                'Date',
                'Checklist',
                'Condition',
                'Findings',
                'Result',
                ['Source', '1'],
                'Inspector',
              ]),
              rows: L.map((e) =>
                row(
                  e.id,
                  [
                    cell({ t: this.dayOf(d, e.occurredAt) }),
                    cell({ t: e.checklistRef ?? '—' }),
                    cell({
                      t: `${e.condBefore ?? '?'} → ${e.condAfter ?? '?'}`,
                    }),
                    cell({ t: e.findings ?? e.summary, mw: '260px' }),
                    cell({
                      bt: e.result === 'Pass' ? '✓ Pass' : '✕ Fail',
                      bfg: e.result === 'Pass' ? '#0E8442' : '#B42318',
                      bbg: e.result === 'Pass' ? '#ECFDF3' : '#FEF3F2',
                      s: e.score != null ? `Score ${e.score}` : '',
                    }),
                    cell({ t: 'Assets & Maintenance', opt: '1' }),
                    cell({ t: this.data.person(d, e.byUserId) }),
                  ],
                  [
                    'View',
                    ...(a.request && !fin ? ['Create follow-up request'] : []),
                  ],
                  [
                    `${this.dayOf(d, e.occurredAt)} · ${e.result ?? ''}`,
                    e.findings ?? '',
                    [],
                  ],
                ),
              ),
            }
          : null,
        empty: L.length
          ? null
          : { t: 'No inspections recorded.', d: '', acts: [] },
        acts: fin
          ? []
          : [btn('inspect', 'Record inspection', 'ghost', !a.complete)],
      };
    }
    if (tab === 'meter') {
      const rs = this.data.readingsOf(d, x.id).slice().reverse();
      const corrected = new Set(
        rs.filter((r) => r.correctionOfId).map((r) => r.correctionOfId),
      );
      return {
        table: rs.length
          ? {
              hasActs: true,
              cols: cols([
                'Reading',
                'Unit',
                'Date',
                'Source',
                'Recorded by',
                'Correction',
              ]),
              rows: rs.map((r) => {
                const sup = corrected.has(r.id);
                return row(
                  r.id,
                  [
                    cell({
                      t: num(r.value).toLocaleString(),
                      fw: 800,
                      fg: sup ? '#98A2B3' : '#101828',
                      s: sup ? 'Superseded (kept for audit)' : '',
                    }),
                    cell({ t: x.meterUnit ?? '—' }),
                    cell({ t: d.fmt.dtm(r.takenAt) }),
                    cell({ t: r.source }),
                    cell({ t: this.data.person(d, r.byUserId) }),
                    r.correctionOfId
                      ? cell({
                          bt: '↺ Correction',
                          bfg: '#6941C6',
                          bbg: '#F4F3FF',
                          s: r.reason ?? '',
                        })
                      : cell({ t: sup ? 'Corrected' : '—' }),
                  ],
                  sup || r.correctionOfId || !a.edit ? [] : ['Correct reading'],
                  [
                    `${num(r.value).toLocaleString()} ${x.meterUnit ?? ''}`,
                    `${d.fmt.dtm(r.takenAt)} · ${r.source}`,
                    [],
                  ],
                );
              }),
            }
          : null,
        empty: rs.length
          ? null
          : {
              t: x.meterType ? 'No readings yet.' : 'This asset has no meter.',
              d: '',
              acts: [],
            },
        info: 'Append-only. A correction adds a new record that references the original — the original value, reason, actor and time are all kept. Readings are entered by hand — typed in, read from a photo of the meter, or recorded when a work order is completed.',
        acts:
          x.meterType && !fin
            ? [btn('d-read', 'Record reading', 'ghost', !a.reading)]
            : [],
      };
    }
    if (tab === 'down') {
      const L = d.down.filter((z) => z.assetId === x.id);
      return {
        table: L.length
          ? {
              hasActs: true,
              cols: cols([
                'Start',
                'End',
                'Duration',
                'Type',
                'Reason / cause',
                'Work order',
                'Impact',
              ]),
              rows: L.map((z) =>
                row(
                  `${z.id}|${z.woId ?? ''}`,
                  [
                    cell({ t: d.fmt.dtm(z.startAt) }),
                    z.endAt
                      ? cell({ t: d.fmt.dtm(z.endAt) })
                      : cell({
                          bt: '● Ongoing',
                          bfg: '#B42318',
                          bbg: '#FEF3F2',
                        }),
                    cell({
                      t: this.data.fmtH(this.data.dHours(d, z)),
                      fw: 800,
                    }),
                    cell({ t: z.kind }),
                    cell({ t: `${z.reason} · ${z.cause}`, mw: '220px' }),
                    cell({
                      t: d.wos.find((w) => w.id === z.woId)?.number ?? '—',
                    }),
                    cell({ t: z.impact ?? '—', mw: '260px' }),
                  ],
                  [
                    ...(z.woId ? ['Open work order'] : []),
                    ...(!z.endAt && a.complete ? ['End downtime'] : []),
                  ],
                  [
                    `${this.data.fmtH(this.data.dHours(d, z))} · ${z.kind}`,
                    z.cause,
                    [],
                  ],
                ),
              ),
            }
          : null,
        empty: L.length
          ? null
          : { t: 'No downtime recorded.', d: '', acts: [] },
        acts: fin ? [] : [btn('d-down', 'Log downtime', 'ghost', !a.complete)],
      };
    }
    if (tab === 'costs') {
      if (!a.cost)
        return {
          empty: {
            t: 'Cost details are restricted.',
            d: 'Your role doesn’t include View Cost. Costs are hidden server-side, not just in the UI.',
            acts: [],
          },
        };
      const L = d.wos
        .filter((w) => w.assetId === x.id)
        .flatMap((w) => w.costs.map((c) => ({ c, w })));
      const by = (t: string) =>
        L.filter((z) => z.c.type === t).reduce(
          (s, z) => s + num(z.c.amount),
          0,
        );
      const bills = await this.billsFor(
        d,
        L.map((z) => z.c.finBillId),
      );
      return {
        bars: mkBars(
          (['Labor', 'Parts', 'Vendor', 'Other'] as const).map(
            (t): [string, number] => [t, by(t)],
          ),
          '#0A1B2A',
          (v) => this.money(d, v),
        ),
        table: L.length
          ? {
              hasActs: true,
              cols: cols(['Work order', 'Type', 'Amount', 'Finance', 'Source']),
              rows: L.map(({ c, w }) =>
                row(
                  `${w.id}:${c.id}`,
                  [
                    cell({ t: w.number, fw: 700 }),
                    cell({ t: c.type }),
                    cell({
                      t: this.money(d, num(c.amount)),
                      fw: 800,
                      fg: '#101828',
                    }),
                    cell({ t: this.finText(c, bills) }),
                    cell({
                      t:
                        c.note ??
                        (c.type === 'Labor'
                          ? 'Logged hours'
                          : c.type === 'Parts'
                            ? 'Inventory issue'
                            : 'Entered on completion'),
                    }),
                  ],
                  ['Open work order'],
                  [`${w.number} · ${c.type}`, this.money(d, num(c.amount)), []],
                ),
              ),
            }
          : null,
        empty: L.length
          ? null
          : { t: 'No cost references yet.', d: '', acts: [] },
        info: 'Operational maintenance cost. Parts post to Finance (Repairs & Maintenance) through the Inventory movement; vendor costs link to a Finance bill; labor is paid through payroll and isn’t posted again. Depreciation and capitalisation stay in Finance & Accounting.',
      };
    }
    if (tab === 'docs') {
      const L = d.docs.filter((z) => z.assetId === x.id);
      return {
        table: L.length
          ? {
              hasActs: true,
              cols: cols(['Document', 'Type', 'Size', 'Added']),
              rows: L.map((z) =>
                row(
                  z.id,
                  [
                    cell({ t: z.name, fw: 700, fg: '#101828' }),
                    cell({ t: z.type }),
                    cell({ t: `${Math.max(1, Math.round(z.size / 1024))} KB` }),
                    cell({
                      t: `${this.dayOf(d, z.createdAt)} · ${this.data.person(d, z.byUserId)}`,
                    }),
                  ],
                  ['Download', ...(a.edit ? ['Remove'] : [])],
                  [z.name, z.type, []],
                ),
              ),
            }
          : null,
        empty: L.length
          ? null
          : {
              t: 'No documents yet.',
              d: 'Upload manuals, warranties, certificates and photos — they are stored with this asset.',
              acts: [],
            },
        acts: [btn('d-doc', 'Upload document', 'ghost', !a.edit)],
      };
    }
    if (tab === 'rel') {
      const [fsJobs, fsAgr, ctDocs, ctAll] = await Promise.all([
        this.ctx.db.fsWorkOrder.findMany({
          where: { businessId: d.a.rootId, assetId: x.id },
          select: { number: true, status: true },
          orderBy: { createdAt: 'desc' },
          take: 6,
        }),
        this.ctx.db.fsAgreement.findMany({
          where: { businessId: d.a.rootId, status: 'Active' },
          select: {
            number: true,
            assetIds: true,
            endOn: true,
            contractId: true,
          },
        }),
        this.ctx.db.ctDocument.findMany({
          where: {
            businessId: d.a.rootId,
            linkModule: 'Assets & Maintenance',
            linkId: x.id,
          },
          select: { id: true },
        }),
        this.ctx.db.ctContract.findMany({
          where: {
            businessId: d.a.rootId,
            status: { notIn: ['Archived'] },
          },
          select: {
            id: true,
            number: true,
            status: true,
            endOn: true,
            docId: true,
            related: true,
          },
        }),
      ]);
      const docIds = new Set(ctDocs.map((z) => z.id));
      const agr = fsAgr.filter(
        (g) =>
          Array.isArray(g.assetIds) && (g.assetIds as string[]).includes(x.id),
      );
      const agrCt = new Set(agr.map((g) => g.contractId).filter(Boolean));
      const contracts = ctAll.filter(
        (c) =>
          agrCt.has(c.id) ||
          (c.docId && docIds.has(c.docId)) ||
          (Array.isArray(c.related) &&
            (c.related as { module?: string; id?: string }[]).some(
              (r) => r.module === 'Assets & Maintenance' && r.id === x.id,
            )),
      );
      const ctLabel = (id: string | null) =>
        id ? (ctAll.find((c) => c.id === id)?.number ?? null) : null;
      const par = this.data.A(d, x.parentId);
      const kids = d.all.filter((z) => z.parentId === x.id);
      const prod = x.productId ? d.products.get(x.productId) : null;
      return {
        table: this.kvT([
          ['Parent asset', par ? `${par.number} · ${par.name}` : '—'],
          [
            'Child assets / components',
            kids.map((k) => `${k.number} · ${k.name}`).join(', ') || '—',
          ],
          [
            'Related assets (same model)',
            x.model
              ? d.all
                  .filter(
                    (z) =>
                      z.id !== x.id &&
                      z.model === x.model &&
                      z.manufacturer === x.manufacturer,
                  )
                  .map((z) => z.number)
                  .join(', ') || '—'
              : '—',
          ],
          ['Site', this.data.locPath(d, x.locationId, x.branchId)],
          [
            'Customer (CRM)',
            x.customerId ? (d.customers.get(x.customerId) ?? '—') : '—',
          ],
          [
            'Service agreement',
            agr.length
              ? agr
                  .map(
                    (g) =>
                      `${g.number} (Field Service, until ${g.endOn.toISOString().slice(0, 10)}${ctLabel(g.contractId) ? ` · signed contract ${ctLabel(g.contractId)}` : ' · no signed contract linked'})`,
                  )
                  .join(' · ')
              : x.warrantyType === 'Service'
                ? `${x.warrantyProvider ?? '—'} service agreement (warranty record only — no Field Service agreement covers this asset)`
                : '—',
          ],
          [
            'Contracts',
            contracts.length
              ? contracts
                  .map(
                    (c) =>
                      `${c.number} ${c.status}${c.endOn ? ` · ends ${c.endOn.toISOString().slice(0, 10)}` : ''}`,
                  )
                  .join(' · ')
              : 'None — link this asset from a contract’s references or a document in Contracts',
          ],
          [
            'Field Service history',
            fsJobs.length
              ? fsJobs.map((j) => `${j.number} ${j.status}`).join(' · ')
              : x.customerId
                ? 'No field jobs yet'
                : 'Internal asset — field jobs are for customer-owned equipment',
          ],
          [
            'Catalog product',
            prod ? `${prod.name} (Products & Services)` : '—',
          ],
          [
            'Finance fixed asset',
            x.finAssetId ? (d.finAssets.get(x.finAssetId)?.number ?? '—') : '—',
          ],
        ]),
      };
    }
    if (tab === 'tl') {
      type It = [Date, string, string, string | null];
      const items: It[] = [
        ...d.events
          .filter((e) => e.assetId === x.id)
          .map((e): It => [
            e.occurredAt,
            e.type,
            e.summary,
            e.byUserId ?? e.bySupplierId ?? e.byTeamId,
          ]),
        ...this.data
          .readingsOf(d, x.id)
          .map((r): It => [
            r.takenAt,
            r.correctionOfId ? 'Meter correction' : 'Meter Reading',
            `${num(r.value).toLocaleString()} ${x.meterUnit ?? ''}${r.reason ? ` — ${r.reason}` : ''}`,
            r.byUserId,
          ]),
        ...d.requests
          .filter((r) => r.assetId === x.id)
          .map((r): It => [
            r.createdAt,
            'Maintenance Request',
            `${r.number} · ${r.title} (${r.status})`,
            r.reporterId,
          ]),
        ...d.wos
          .filter((w) => w.assetId === x.id)
          .map((w): It => [
            w.completedAt ?? w.startedAt ?? w.createdAt,
            'Work Order',
            `${w.number} · ${w.type} · ${w.status}`,
            w.assigneeUserId ?? w.supplierId ?? w.teamId,
          ]),
        ...d.down
          .filter((z) => z.assetId === x.id)
          .map((z): It => [
            z.startAt,
            'Downtime',
            `${z.kind} · ${z.cause} · ${this.data.fmtH(this.data.dHours(d, z))}`,
            z.byUserId,
          ]),
        ...(x.warrantyEnd && x.warrantyEnd < d.now
          ? [
              [
                x.warrantyEnd,
                'Warranty Event',
                `Warranty expired (${x.warrantyProvider ?? '—'})`,
                'System',
              ] as It,
            ]
          : []),
      ].sort((p, q) => q[0].getTime() - p[0].getTime());
      return {
        table: {
          hasActs: false,
          cols: cols(['Date', 'Event', 'Detail', 'By']),
          rows: items.map((it, i) =>
            row(
              `t${i}`,
              [
                cell({ t: this.dayOf(d, it[0]), s: d.fmt.rel(it[0]) }),
                cell({ t: it[1], fw: 700, fg: '#101828' }),
                cell({ t: it[2], mw: '380px' }),
                cell({ t: this.data.person(d, it[3]) }),
              ],
              [],
              [it[1], `${this.dayOf(d, it[0])} · ${it[2]}`, []],
            ),
          ),
        },
      };
    }
    if (tab === 'audit') {
      const L = await db.amAudit.findMany({
        where: { businessId: a.rootId, entityId: x.id },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return {
        table: L.length
          ? {
              hasActs: false,
              cols: cols([
                'When',
                'Actor',
                'Action',
                'Detail',
                ['Correlation', '1'],
              ]),
              rows: L.map((z) =>
                row(
                  z.id,
                  [
                    cell({ t: d.fmt.dtm(z.createdAt) }),
                    cell({ t: z.actorName }),
                    cell({ t: z.action, fw: 700, fg: '#101828' }),
                    cell({ t: z.detail, mw: '320px' }),
                    cell({
                      t: z.correlation,
                      ff: 'ui-monospace,monospace',
                      opt: '1',
                    }),
                  ],
                  [],
                  [z.action, d.fmt.dtm(z.createdAt), []],
                ),
              ),
            }
          : null,
        empty: L.length
          ? null
          : { t: 'No audit records yet.', d: '', acts: [] },
        info: 'Append-only audit. Before/after values and reasons are recorded for every material change.',
      };
    }
    return {};
  }

  async billsFor(d: Data, ids: (string | null)[]) {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length)
      return new Map<string, { number: string; status: string }>();
    const rows = await this.ctx.db.finBill.findMany({
      where: { id: { in: uniq }, businessId: d.a.rootId },
      select: { id: true, number: true, status: true },
    });
    return new Map(
      rows.map((r) => [r.id, { number: r.number, status: r.status }]),
    );
  }

  finText(
    c: { type: string; finBillId: string | null },
    bills: Map<string, { number: string; status: string }>,
  ) {
    if (c.type === 'Parts') return 'Posted via Inventory movement';
    if (c.type === 'Labor') return 'Paid through payroll — not posted';
    if (c.finBillId) {
      const b = bills.get(c.finBillId);
      return b ? `Bill ${b.number} · ${b.status}` : 'Linked bill not found';
    }
    return 'Not billed yet — not posted';
  }

  // ===== 4 Categories & Locations ==========================================

  vTaxonomy(d: Data) {
    const a = d.a;
    const tab = d.s.seg.tx || 'cat';
    const ed = a.edit;
    const segT = seg(
      [
        ['cat', 'Asset Categories'],
        ['loc', 'Asset Locations'],
        ['tpl', 'Hierarchy Templates'],
        ['cf', 'Custom Asset Fields'],
      ],
      tab,
    );
    if (tab === 'loc') {
      type Node = {
        kind: 'b' | 'l';
        id: string;
        name: string;
        code: string;
        type: string;
        parent: string;
        branch: string;
        status: string;
      };
      const tree: [Node, number][] = [];
      const walk = (branch: string, parentId: string | null, depth: number) =>
        d.locs
          .filter((l) => l.branchId === branch && l.parentId === parentId)
          .forEach((l) => {
            tree.push([
              {
                kind: 'l',
                id: l.id,
                name: l.name,
                code: l.code,
                type: l.type,
                parent: parentId
                  ? (this.data.loc(d, parentId)?.name ?? '—')
                  : this.data.branchName(d, branch),
                branch,
                status: l.status,
              },
              depth,
            ]);
            walk(branch, l.id, depth + 1);
          });
      d.group
        .filter((g) => !a.branches || a.branches.includes(g.id))
        .forEach((g) => {
          tree.push([
            {
              kind: 'b',
              id: g.id,
              name: g.name,
              code: '—',
              type: 'Branch',
              parent: '—',
              branch: g.id,
              status: 'Active',
            },
            0,
          ]);
          walk(g.id, null, 1);
        });
      const under = (n: Node) => {
        if (n.kind === 'b') return d.all.filter((x) => x.branchId === n.id);
        return d.all.filter((x) => {
          let l = this.data.loc(d, x.locationId);
          let g = 0;
          while (l && g++ < 20) {
            if (l.id === n.id) return true;
            l = this.data.loc(d, l.parentId);
          }
          return false;
        });
      };
      return [
        R('minmax(0,1fr)', [
          card({
            id: 'tx-loc',
            seg: segT,
            table: {
              hasActs: true,
              cols: cols([
                'Location',
                'Code',
                'Type',
                ['Parent', '1'],
                'Branch',
                'Assets',
                'Critical',
                'Open maint.',
                'Status',
              ]),
              rows: tree.map(([n, dep]) => {
                const as = under(n);
                const ids = new Set(as.map((x) => x.id));
                return row(
                  `${n.kind}:${n.id}`,
                  [
                    cell({
                      t: `${'  '.repeat(dep * 2)}${dep ? '↳ ' : ''}${n.name}`,
                      fw: dep ? 600 : 800,
                      fg: '#101828',
                    }),
                    cell({ t: n.code, ff: 'ui-monospace,monospace' }),
                    cell({ t: n.type }),
                    cell({ t: n.parent, opt: '1' }),
                    cell({
                      t: `${this.data.branchName(d, n.branch)}${n.kind === 'b' ? ' (Branches)' : ''}`,
                    }),
                    cell({ t: String(as.length) }),
                    cell({
                      t: String(
                        as.filter((x) => x.criticality === 'Critical').length,
                      ),
                    }),
                    cell({
                      t: String(
                        d.wos.filter(
                          (w) =>
                            !['Closed', 'Cancelled'].includes(w.status) &&
                            ids.has(w.assetId),
                        ).length,
                      ),
                    }),
                    this.stc(n.status),
                  ],
                  ed
                    ? [
                        ...(n.kind === 'l'
                          ? [
                              'Edit',
                              'Move',
                              n.status === 'Active' ? 'Deactivate' : 'Activate',
                              'Merge into…',
                            ]
                          : ['Open in Branches']),
                        'Add child location',
                        'View assets',
                      ]
                    : ['View assets'],
                  [n.name, `${n.type} · ${as.length} assets`, []],
                );
              }),
            },
            acts: [btn('loc-new', '+ Add Location', 'ghost', !ed)],
            info: 'Branch rows are the business’s real Branches and can’t be edited here. Locations with active assets can’t be deactivated — move or merge them first.',
          }),
        ]),
      ];
    }
    if (tab === 'tpl') {
      const paths = new Map<string, Set<string>>();
      const pathOf = (lid: string) => {
        const out: string[] = [];
        let l = this.data.loc(d, lid);
        let g = 0;
        while (l && g++ < 20) {
          out.unshift(l.type);
          l = this.data.loc(d, l.parentId);
        }
        return ['Branch', ...out].join(' → ');
      };
      const leaves = d.locs.filter(
        (l) => !d.locs.some((c) => c.parentId === l.id),
      );
      leaves.forEach((l) => {
        const p = pathOf(l.id);
        if (!paths.has(p)) paths.set(p, new Set());
        paths.get(p)!.add(this.data.branchName(d, l.branchId));
      });
      const chains: string[] = [];
      d.all
        .filter((x) => !x.parentId && d.all.some((c) => c.parentId === x.id))
        .forEach((x) => {
          const kids = d.all.filter((c) => c.parentId === x.id);
          chains.push(`${x.number} → ${kids.map((k) => k.number).join(', ')}`);
        });
      const rows = [
        ...[...paths.entries()].map(([p, used], i) =>
          row(
            `tp${i}`,
            [
              cell({ t: 'Location hierarchy', fw: 800, fg: '#101828' }),
              cell({ t: p }),
              cell({ t: [...used].join(', ') }),
            ],
            [],
            [p, [...used].join(', '), []],
          ),
        ),
        ...(chains.length
          ? [
              row(
                'tpa',
                [
                  cell({ t: 'Equipment assembly', fw: 800, fg: '#101828' }),
                  cell({ t: 'Asset → Component' }),
                  cell({ t: chains.join(' · ') }),
                ],
                [],
                ['Equipment assembly', chains.join(' · '), []],
              ),
            ]
          : []),
      ];
      return [
        R('minmax(0,1fr)', [
          card({
            id: 'tx-tpl',
            seg: segT,
            table: rows.length
              ? {
                  hasActs: false,
                  cols: cols(['Template', 'Levels', 'Used by']),
                  rows,
                }
              : null,
            empty: rows.length
              ? null
              : {
                  t: 'No hierarchies yet.',
                  d: 'Hierarchies are derived from the locations and parent/child assets you create.',
                  acts: [],
                },
            info: 'Derived from the real location tree (type path per branch) and parent/child assets — not a separate setting.',
          }),
        ]),
      ];
    }
    if (tab === 'cf')
      return [
        R('minmax(0,1fr)', [
          card({
            id: 'tx-cf',
            seg: segT,
            table: d.cfields.length
              ? {
                  hasActs: true,
                  cols: cols(['Field', 'Type', 'Applies to']),
                  rows: d.cfields.map((c) => {
                    const cats = (c.categoryIds as string[]).map((id) =>
                      this.data.catName(d, id),
                    );
                    return row(
                      c.id,
                      [
                        cell({ t: c.name, fw: 800, fg: '#101828' }),
                        cell({
                          t:
                            c.type +
                            ((c.options as string[]).length
                              ? ` · ${(c.options as string[]).join(', ')}`
                              : ''),
                        }),
                        cell({ t: cats.join(', ') || 'All categories' }),
                      ],
                      a.settings ? ['Remove'] : [],
                      [c.name, c.type, []],
                    );
                  }),
                }
              : null,
            empty: d.cfields.length
              ? null
              : { t: 'No custom fields yet.', d: '', acts: [] },
            acts: [btn('cf-new', '+ Add field', 'ghost', !a.settings)],
            info: 'Managed centrally in Asset Settings › Custom Fields.',
          }),
        ]),
      ];
    const kids = (id: string) => d.cats.filter((c) => c.parentId === id);
    const tree: [(typeof d.cats)[number], number][] = [];
    d.cats
      .filter((c) => !c.parentId)
      .forEach((c) => {
        tree.push([c, 0]);
        kids(c.id).forEach((k) => tree.push([k, 1]));
      });
    return [
      R('minmax(0,1fr)', [
        card({
          id: 'tx-cat',
          seg: segT,
          table: tree.length
            ? {
                hasActs: true,
                cols: cols([
                  'Category',
                  'Code',
                  ['Parent', '1'],
                  'Assets',
                  'PM template',
                  'Default criticality',
                  ['Default warranty', '1'],
                  'Status',
                ]),
                rows: tree.map(([c, dep]) => {
                  const n = d.all.filter(
                    (x) =>
                      x.categoryId === c.id ||
                      kids(c.id).some((k) => k.id === x.categoryId),
                  ).length;
                  return row(
                    c.id,
                    [
                      cell({
                        t: `${dep ? '↳ ' : ''}${c.name}`,
                        fw: dep ? 600 : 800,
                        fg: '#101828',
                      }),
                      cell({ t: c.code, ff: 'ui-monospace,monospace' }),
                      cell({
                        t: c.parentId ? this.data.catName(d, c.parentId) : '—',
                        opt: '1',
                      }),
                      cell({ t: String(n) }),
                      cell({ t: this.data.tplName(d, c.templateId) }),
                      this.critc(c.criticality),
                      cell({ t: c.warrantyType ?? '—', opt: '1' }),
                      this.stc(c.status),
                    ],
                    ed
                      ? [
                          'Edit',
                          c.status === 'Active' ? 'Deactivate' : 'Activate',
                          'Merge into…',
                          'Delete',
                          'View assets',
                        ]
                      : ['View assets'],
                    [c.name, `${n} assets · ${c.criticality}`, []],
                  );
                }),
              }
            : null,
          empty: tree.length
            ? null
            : {
                t: 'No categories yet.',
                d: 'Categories set default criticality, PM template and warranty type for new assets.',
                acts: [btn('cat-new', '+ New Category', 'primary', !ed)],
              },
          acts: [btn('cat-new', '+ New Category', 'ghost', !ed)],
        }),
      ]),
    ];
  }

  // ===== 5 Requests ========================================================

  vRequests(d: Data) {
    const a = d.a;
    const R0 = d.requests.filter((r) => d.ids.has(r.assetId));
    const f: Record<string, string> = { st: 'open', ...(d.s.f.rq ?? {}) };
    const q = (f.q ?? '').trim().toLowerCase();
    const openSt = ['Open', 'Awaiting Triage', 'Needs Information', 'Approved'];
    const L = R0.filter((r) => {
      const x = this.data.A(d, r.assetId)!;
      return (
        (!q ||
          `${r.number}${r.title}${x.name}${x.number}`
            .toLowerCase()
            .includes(q)) &&
        (!f.st ||
          (f.st === 'open' ? openSt.includes(r.status) : r.status === f.st)) &&
        (!f.pri || r.priority === f.pri) &&
        (!f.safety || r.safety) &&
        (!f.type || r.issueType === f.type)
      );
    });
    const open = R0.filter((r) => openSt.includes(r.status));
    const triaged = R0.filter(
      (r) =>
        r.triagedAt && r.triagedAt.getTime() > d.now.getTime() - 90 * 86400000,
    );
    const tt =
      triaged.length >= 3
        ? triaged.reduce(
            (s, r) => s + (r.triagedAt!.getTime() - r.createdAt.getTime()),
            0,
          ) /
          triaged.length /
          3600000
        : null;
    const kpis = [
      K('q-open', 'Open Requests', open.length, '', null, '#2E90FA'),
      K(
        'q-crit',
        'Critical',
        open.filter((r) => r.priority === 'Critical').length,
        '',
        '#B42318',
        '#F04438',
      ),
      K(
        'q-safe',
        'Safety Related',
        open.filter((r) => r.safety).length,
        'Flagged safety concern',
        open.some((r) => r.safety) ? '#B42318' : null,
        '#F04438',
      ),
      K(
        'q-Awaiting Triage',
        'Awaiting Triage',
        R0.filter((r) => r.status === 'Awaiting Triage').length,
        '',
        null,
        '#F79009',
      ),
      K(
        'q-Needs Information',
        'Waiting Information',
        R0.filter((r) => r.status === 'Needs Information').length,
        '',
        null,
        '#F79009',
      ),
      K(
        'q-Converted',
        'Converted to Work Order',
        R0.filter((r) => r.status === 'Converted').length,
        'Source request stays linked',
        null,
        '#6941C6',
      ),
      K(
        'q-tt',
        'Average Triage Time',
        tt == null ? 'Insufficient data' : this.data.fmtH(tt),
        `Created → triaged, last 90 days · ${triaged.length} request(s)`,
        null,
        '#12A150',
      ),
    ];
    if (!R0.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No maintenance requests yet.',
          'Staff can report issues with any asset. Customer-site visits for customer-owned equipment are handled in Field Service.',
          [btn('newreq', 'Create Request', 'primary', !a.request)],
        ),
      ];
    const nOn =
      ['q', 'pri', 'safety', 'type'].filter((k) => f[k]).length +
      (f.st && f.st !== '' ? 1 : 0);
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'rq',
          filters: {
            search: 'Search request #, issue or asset',
            q: f.q ?? '',
            sels: [
              sel2('st', 'Status', f.st ?? '', [
                ['', 'Any status'],
                ['open', 'All open'],
                ...[
                  'Draft',
                  'Open',
                  'Awaiting Triage',
                  'Needs Information',
                  'Approved',
                  'Rejected',
                  'Converted',
                  'Closed',
                  'Cancelled',
                ].map((x): [string, string] => [x, x]),
              ]),
              sel2('pri', 'Priority', f.pri ?? '', [
                ['', 'Any priority'],
                ...d.cfg.priorities.map((x): [string, string] => [x, x]),
              ]),
              sel2('type', 'Issue type', f.type ?? '', [
                ['', 'Any issue type'],
                ...d.cfg.issueTypes.map((x): [string, string] => [x, x]),
              ]),
              sel2('safety', 'Safety', f.safety ?? '', [
                ['', 'Safety: any'],
                ['1', 'Safety concerns only'],
              ]),
            ],
            nOn: nOn || null,
            count: `${L.length} requests`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Request #',
                  'Asset',
                  'Issue',
                  ['Location', '1'],
                  ['Reporter', '1'],
                  'Priority',
                  'Safety',
                  'Downtime',
                  ['Triage owner', '1'],
                  'Status',
                  ['Created', '1'],
                ]),
                rows: L.map((r) => {
                  const x = this.data.A(d, r.assetId)!;
                  return row(
                    r.id,
                    [
                      cell({ t: r.number, fw: 800, fg: '#101828' }),
                      cell({ t: x.number, s: x.name }),
                      cell({ t: r.title, s: r.issueType, mw: '240px' }),
                      cell({ t: this.data.locShort(d, x), opt: '1' }),
                      cell({ t: this.data.person(d, r.reporterId), opt: '1' }),
                      this.critc(r.priority),
                      r.safety
                        ? cell({
                            bt: '⚠ Safety',
                            bfg: '#B42318',
                            bbg: '#FEF3F2',
                          })
                        : cell({ t: '—' }),
                      r.down
                        ? cell({ bt: '● Down', bfg: '#B42318', bbg: '#FEF3F2' })
                        : cell({ t: 'Operational' }),
                      cell({ t: this.data.person(d, r.triageId), opt: '1' }),
                      this.stc(r.status),
                      cell({ t: d.fmt.rel(r.createdAt), opt: '1' }),
                    ],
                    this.reqActs(d, r),
                    [
                      `${r.number} · ${r.title}`,
                      `${x.number} · ${r.priority} · ${r.status}`,
                      [
                        this.chip(r.status),
                        ...(r.safety
                          ? [{ t: '⚠ Safety', fg: '#B42318', bg: '#FEF3F2' }]
                          : []),
                      ],
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
                acts: [btn('qclear', 'Clear filters', 'primary')],
              },
        }),
      ]),
    ];
  }

  reqActs(d: Data, r: AReq) {
    const m = d.a.approve;
    const out = ['View'];
    if (
      [
        'Open',
        'Awaiting Triage',
        'Needs Information',
        'Approved',
        'Draft',
      ].includes(r.status) &&
      m
    ) {
      out.push('Assign triage', 'Change priority');
      if (r.status !== 'Needs Information')
        out.push('Request more information');
      if (r.status === 'Needs Information') out.push('Information received');
      if (r.status !== 'Approved') out.push('Approve');
      out.push('Convert to work order', 'Reject');
    }
    if (r.status === 'Draft' && d.a.request) out.push('Submit');
    if (['Approved', 'Converted', 'Rejected'].includes(r.status) && m)
      out.push('Close');
    return out;
  }

  // ===== 6 Work orders =====================================================

  techMine(d: Data, w: AWo) {
    const mine = d.teams
      .filter((t) => t.members.some((m) => m.userId === d.a.userId))
      .map((t) => t.id);
    return (
      w.assigneeUserId === d.a.userId || (!!w.teamId && mine.includes(w.teamId))
    );
  }

  vWorkOrders(d: Data) {
    const a = d.a;
    const W = d.wos.filter(
      (w) =>
        d.ids.has(w.assetId) &&
        (!a.techOnly || d.s.techAll || this.techMine(d, w)),
    );
    const f: Record<string, string> = { st: 'open', ...(d.s.f.wo ?? {}) };
    const q = (f.q ?? '').trim().toLowerCase();
    const L = W.filter((w) => {
      const x = this.data.A(d, w.assetId)!;
      return (
        (!q ||
          `${w.number}${w.scope}${x.name}${x.number}`
            .toLowerCase()
            .includes(q)) &&
        (!f.st ||
          (f.st === 'open'
            ? !DONE_WO.includes(w.status)
            : f.st === 'overdue'
              ? this.data.woOverdue(d, w)
              : w.status === f.st)) &&
        (!f.pri || w.priority === f.pri) &&
        (!f.type || w.type === f.type)
      );
    }).sort(
      (x, y) =>
        Number(['Closed', 'Cancelled'].includes(x.status)) -
          Number(['Closed', 'Cancelled'].includes(y.status)) ||
        x.dueAt.getTime() - y.dueAt.getTime(),
    );
    const c = (st: string) => W.filter((w) => w.status === st).length;
    const done = W.filter((w) => w.completedAt && w.startedAt);
    const kpis = [
      K(
        'w-open',
        'Open',
        W.filter((w) => !DONE_WO.includes(w.status)).length,
        '',
        null,
        '#2E90FA',
      ),
      K('w-Scheduled', 'Scheduled', c('Scheduled'), '', null, '#6941C6'),
      K('w-In Progress', 'In Progress', c('In Progress'), '', null, '#2E90FA'),
      K(
        'w-overdue',
        'Overdue',
        W.filter((w) => this.data.woOverdue(d, w)).length,
        'Past due, not completed',
        W.some((w) => this.data.woOverdue(d, w)) ? '#B42318' : null,
        '#F04438',
      ),
      K(
        'w-Waiting Parts',
        'Waiting Parts',
        c('Waiting Parts'),
        'Stock from Inventory',
        null,
        '#F79009',
      ),
      K(
        'w-Waiting Vendor',
        'Waiting Vendor',
        c('Waiting Vendor'),
        '',
        null,
        '#F79009',
      ),
      K(
        'w-Completed',
        'Completed',
        c('Completed') + c('Closed'),
        `${c('Completed')} awaiting close`,
        null,
        '#12A150',
      ),
      K(
        'w-avg',
        'Average Completion Time',
        done.length >= 3
          ? `${(done.reduce((s, w) => s + (w.completedAt!.getTime() - w.startedAt!.getTime()), 0) / done.length / 86400000).toFixed(1)} days`
          : 'Insufficient data',
        `Start → complete, ${done.length} orders`,
        null,
        '#12A150',
      ),
    ];
    if (!W.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          a.techOnly && !d.s.techAll
            ? 'No work orders assigned to you.'
            : 'No maintenance work orders yet.',
          'Convert a request or create one directly.',
          [
            btn('newwo', 'Create Work Order', 'primary', !a.approve),
            ...(a.techOnly
              ? [
                  btn(
                    'techAll',
                    d.s.techAll ? 'Show only mine' : 'Show all I can see',
                  ),
                ]
              : []),
          ],
        ),
      ];
    const adv = d.s.seg.wo === 'adv';
    const nOn =
      ['q', 'pri', 'type'].filter((k) => f[k]).length + (f.st ? 1 : 0);
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'wo',
          seg: seg(
            [
              ['def', 'Default columns'],
              ['adv', '+ Location, vendor, source, outcome'],
            ],
            adv ? 'adv' : 'def',
          ),
          filters: {
            search: 'Search MWO #, scope or asset',
            q: f.q ?? '',
            sels: [
              sel2('st', 'Status', f.st ?? '', [
                ['', 'Any status'],
                ['open', 'All open'],
                ['overdue', 'Overdue'],
                ...Object.keys(WO_T).map((x): [string, string] => [x, x]),
              ]),
              sel2('pri', 'Priority', f.pri ?? '', [
                ['', 'Any priority'],
                ...d.cfg.priorities.map((x): [string, string] => [x, x]),
              ]),
              sel2('type', 'Type', f.type ?? '', [
                ['', 'Any type'],
                ...d.cfg.mtypes.map((x): [string, string] => [x, x]),
              ]),
            ],
            nOn: nOn || null,
            count: `${L.length} work orders${a.techOnly && !d.s.techAll ? ' · assigned to me' : ''}`,
          },
          acts: a.techOnly
            ? [
                btn(
                  'techAll',
                  d.s.techAll ? 'Show only mine' : 'Show all I can see',
                ),
              ]
            : [],
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'MWO #',
                  'Asset',
                  'Type',
                  'Priority',
                  'Status',
                  ['Assignee', '1'],
                  'Due',
                  ['Parts', '1'],
                  'Downtime',
                  ['Cost', '1'],
                  ...(adv
                    ? (
                        ['Location', 'Vendor', 'Source', 'Outcome'] as const
                      ).map((x): [string, string] => [x, '1'])
                    : []),
                ]),
                rows: L.map((w) => {
                  const x = this.data.A(d, w.assetId)!;
                  const dts = d.down.filter((z) => z.woId === w.id);
                  const od = this.data.woOverdue(d, w);
                  const src = w.requestId
                    ? (d.requests.find((r) => r.id === w.requestId)?.number ??
                      'Request')
                    : w.pmPlanId
                      ? (d.plans.find((p) => p.id === w.pmPlanId)?.name ??
                        'PM plan')
                      : 'Direct';
                  return row(
                    w.id,
                    [
                      cell({
                        t: w.number,
                        fw: 800,
                        fg: '#101828',
                        s: w.status === 'Draft' ? 'Needs approval' : '',
                      }),
                      cell({ t: x.number, s: x.name }),
                      cell({ t: w.type }),
                      this.critc(w.priority),
                      this.stc(w.status),
                      cell({ t: this.data.assignee(d, w), opt: '1' }),
                      cell({
                        t: w.completedAt
                          ? `Done ${this.dayOf(d, w.completedAt)}`
                          : this.relN(d.fmt.daysFrom(w.dueAt)),
                        fg: od ? '#B42318' : '#344054',
                        fw: od ? 800 : 500,
                        s: od ? 'Overdue' : this.dayOf(d, w.dueAt),
                      }),
                      cell({
                        t: w.parts.length
                          ? w.parts
                              .map((p) =>
                                p.used
                                  ? `${p.used} used`
                                  : p.issued - p.returned
                                    ? `${p.issued - p.returned} issued`
                                    : `${p.planned} planned`,
                              )
                              .join(', ')
                          : '—',
                        opt: '1',
                      }),
                      cell({
                        t: dts.length
                          ? `${this.data.fmtH(dts.reduce((s, z) => s + this.data.dHours(d, z), 0))}${dts.some((z) => !z.endAt) ? ' · ongoing' : ''}`
                          : w.expectedDownH
                            ? `Exp. ${num(w.expectedDownH)} h`
                            : '—',
                      }),
                      cell({
                        t: this.costOrLock(d, this.data.woCost(w)),
                        opt: '1',
                      }),
                      ...(adv
                        ? [
                            cell({ t: this.data.locShort(d, x), opt: '1' }),
                            cell({
                              t: w.supplierId
                                ? this.data.person(d, w.supplierId)
                                : '—',
                              opt: '1',
                            }),
                            cell({ t: src, opt: '1' }),
                            cell({ t: w.outcome ?? '—', opt: '1' }),
                          ]
                        : []),
                    ],
                    this.woActs(d, w),
                    [
                      `${w.number} · ${x.name}`,
                      `${w.type} · due ${this.relN(d.fmt.daysFrom(w.dueAt))}`,
                      [
                        this.chip(w.status),
                        {
                          t: w.priority,
                          fg: AM_CRITC[w.priority]?.[0] ?? '#475467',
                          bg: AM_CRITC[w.priority]?.[1] ?? '#F2F4F7',
                        },
                      ],
                    ],
                  );
                }),
              }
            : null,
          empty: L.length
            ? null
            : {
                t: 'No work orders match these filters.',
                d: '',
                acts: [btn('wclear', 'Clear filters', 'primary')],
              },
        }),
      ]),
    ];
  }

  woActs(d: Data, w: AWo) {
    const a = d.a;
    const nx = WO_T[w.status] ?? [];
    const out = ['View'];
    const map: Record<string, [string, boolean]> = {
      Approved: ['Approve', a.approve],
      Scheduled: ['Schedule', a.approve],
      Assigned: ['Assign', a.approve],
      'In Progress': [
        w.status === 'Paused' || w.status.startsWith('Waiting')
          ? 'Resume'
          : w.status === 'Completed'
            ? 'Reopen'
            : 'Start',
        a.start,
      ],
      Paused: ['Pause', a.start],
      'Waiting Parts': ['Request Parts', a.start],
      'Waiting Vendor': ['Waiting on vendor', a.start],
      Completed: ['Complete', a.complete],
      Closed: ['Close', a.approve],
      Cancelled: ['Cancel', a.approve],
    };
    nx.forEach((s) => {
      const m = map[s];
      if (m && m[1]) out.push(m[0]);
    });
    if (!['Closed', 'Cancelled', 'Completed'].includes(w.status) && a.start) {
      out.push('Add part');
      if (w.parts.some((p) => p.issued - p.returned < p.planned))
        out.push('Issue parts (Inventory)');
      out.push('Log labor');
    }
    if (!DONE_WO.includes(w.status) && a.approve) out.push('Change priority');
    if (a.cost && a.start && w.status !== 'Cancelled')
      out.push('Add vendor cost');
    return out;
  }

  // ===== 7 PM ==============================================================

  vPM(d: Data) {
    const a = d.a;
    const P = d.plans.filter(
      (p) => d.ids.has(p.assetId) && (d.s.arch || p.status !== 'Archived'),
    );
    const act = P.filter((p) => p.status === 'Active');
    const dd = (p: APlan) => this.data.dueDay(d, p);
    const near = act.filter((p) => {
      if (p.trigger === 'Time' || p.nextDueMeter == null) return false;
      const m = this.data.meterNow(d, p.assetId);
      return (
        !!m && num(p.nextDueMeter) - num(m.value) <= num(p.meterInterval) * 0.1
      );
    });
    const gen = d.wos.filter((w) => w.pmPlanId && d.ids.has(w.assetId));
    const doneOnTime = gen.filter(
      (w) => w.completedAt && w.completedAt.getTime() <= w.dueAt.getTime(),
    ).length;
    const dueCount =
      gen.filter((w) => w.completedAt || w.dueAt < d.now).length +
      act.filter(
        (p) =>
          (dd(p) ?? 1) < 0 &&
          !gen.some((w) => w.pmPlanId === p.id && !DONE_WO.includes(w.status)),
      ).length;
    const kpis = [
      K(
        'p-active',
        'Active PM Plans',
        act.length,
        `${P.length} total`,
        null,
        '#12A150',
      ),
      K(
        'p-today',
        'Due Today',
        act.filter((p) => dd(p) === 0).length,
        '',
        null,
        '#2E90FA',
      ),
      K(
        'p-7',
        'Due 7 Days',
        act.filter((p) => dd(p) != null && dd(p)! >= 0 && dd(p)! <= 7).length,
        '',
        null,
        '#2E90FA',
      ),
      K(
        'p-od',
        'Overdue',
        act.filter((p) => (dd(p) ?? 0) < 0).length,
        act
          .filter((p) => (dd(p) ?? 0) < 0)
          .map((p) => this.data.A(d, p.assetId)?.number ?? '')
          .join(', ') || 'None',
        act.some((p) => (dd(p) ?? 0) < 0) ? '#B42318' : '#0E8442',
        '#F04438',
      ),
      K(
        'p-meter',
        'Meter Trigger Near Due',
        near.length,
        'Within 10% of interval',
        null,
        '#6941C6',
      ),
      K(
        'p-gen',
        'Auto-generated MWOs',
        gen.length,
        'Idempotent per due instance',
        null,
        '#6941C6',
      ),
      K(
        'p-paused',
        'Paused Plans',
        P.filter((p) => p.status === 'Paused').length,
        '',
        null,
        '#98A2B3',
      ),
      K(
        'p-comp',
        'Compliance %',
        dueCount >= 3
          ? `${Math.round((doneOnTime / dueCount) * 100)}%`
          : 'Insufficient data',
        'Completed on time ÷ due',
        null,
        '#12A150',
      ),
    ];
    if (!P.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No preventive maintenance plans yet.',
          'Plans create work orders automatically on a time, meter or hybrid schedule.',
          [btn('newpm', 'Create PM Plan', 'primary', !a.pm)],
        ),
      ];
    const tab = d.s.seg.pm || 'list';
    if (tab === 'cal') {
      const today = new Date(
        Date.parse(
          new Intl.DateTimeFormat('en-CA', { timeZone: d.fmt.tz }).format(
            d.now,
          ),
        ),
      );
      const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
      const start = -7 - dow;
      const days: {
        d: string;
        items: { id: string; t: string; bg: string; fg: string }[];
        bg: string;
        bd: string;
        fg: string;
        fw: number;
      }[] = [];
      for (let i = start; i < start + 35; i++) {
        const dt = new Date(today.getTime() + i * 86400000);
        const items = act
          .filter((p) => dd(p) === i)
          .map((p) => ({
            id: p.id,
            t: `${this.data.A(d, p.assetId)?.number ?? ''} · ${p.name}`,
            bg: i < 0 ? '#FEF3F2' : '#F4F3FF',
            fg: i < 0 ? '#B42318' : '#6941C6',
          }));
        days.push({
          d: dt.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            timeZone: 'UTC',
          }),
          items,
          bg: i === 0 ? '#F7FCF9' : '#fff',
          bd: i === 0 ? '#12A150' : '#EEF1F4',
          fg: i === 0 ? '#0E8442' : '#475467',
          fw: i === 0 ? 800 : 600,
        });
      }
      const odOld = act.filter((p) => (dd(p) ?? 0) < start);
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'pm-cal',
            seg: seg(
              [
                ['list', 'List'],
                ['cal', 'Calendar'],
              ],
              tab,
            ),
            cal: {
              aria: 'Preventive maintenance calendar',
              head: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              days,
            },
            info: `${odOld.length ? `${odOld.length} plan(s) overdue beyond this view — see List. ` : ''}Red = overdue. Meter-only plans appear once their meter is reached. Click an item to open the plan.`,
          }),
        ]),
      ];
    }
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'pm',
          seg: seg(
            [
              ['list', 'List'],
              ['cal', 'Calendar'],
            ],
            tab,
          ),
          acts: [
            btn('pm-run', 'Run due evaluation now', 'ghost', !a.pm),
            btn('toggleArch', d.s.arch ? 'Hide archived' : 'Show archived'),
          ],
          table: {
            hasActs: true,
            cols: cols([
              'Plan',
              'Asset',
              ['Template', '1'],
              'Trigger',
              'Interval',
              'Next due',
              ['Responsible', '1'],
              'Auto create',
              'Status',
            ]),
            rows: P.slice()
              .sort((x, y) => (dd(x) ?? 999) - (dd(y) ?? 999))
              .map((p) => {
                const x = this.data.A(d, p.assetId)!;
                const m = this.data.meterNow(d, x.id);
                const n = dd(p);
                return row(
                  p.id,
                  [
                    cell({
                      t: p.name,
                      fw: 800,
                      fg: '#101828',
                      s: p.instances.length
                        ? `Last instance ${p.instances[0].key}`
                        : p.number,
                    }),
                    cell({ t: x.number, s: x.name }),
                    cell({ t: this.data.tplName(d, p.templateId), opt: '1' }),
                    cell({
                      t:
                        p.trigger +
                        (p.trigger === 'Hybrid' ? ' (first of)' : ''),
                    }),
                    cell({
                      t:
                        p.trigger === 'Meter'
                          ? `Every ${p.interval.toLocaleString()} ${x.meterUnit ?? ''}`
                          : `Every ${p.interval} ${p.unit}${p.trigger === 'Hybrid' ? ` / ${num(p.meterInterval).toLocaleString()} ${x.meterUnit ?? ''}` : ''}`,
                      s: `Tolerance ${p.tolerance}`,
                    }),
                    p.status === 'Active'
                      ? cell({
                          t: `${n == null ? `at ${num(p.nextDueMeter).toLocaleString()} ${x.meterUnit ?? ''}` : this.relN(n)}${n != null && p.nextDueMeter != null ? ` · ${num(p.nextDueMeter).toLocaleString()} ${x.meterUnit ?? ''}` : ''}`,
                          s: `${p.nextDueOn ? this.dayOf(d, p.nextDueOn) : 'By meter'}${m && p.nextDueMeter != null ? ` · now ${num(m.value).toLocaleString()}` : ''}`,
                          fg: (n ?? 0) < 0 ? '#B42318' : '#344054',
                          fw: (n ?? 0) < 0 ? 800 : 500,
                        })
                      : cell({ t: '—' }),
                    cell({ t: this.data.assignee(d, p), opt: '1' }),
                    cell({
                      t: p.autoCreate ? `Yes · ${p.leadDays}d lead` : 'No',
                    }),
                    this.stc(p.status),
                  ],
                  this.pmActs(d, p),
                  [
                    `${p.name} · ${x.number}`,
                    `${p.status} · next ${this.relN(n)}`,
                    [],
                  ],
                );
              }),
          },
          info: 'The evaluator runs hourly and creates at most one work order per plan + due instance (e.g. PM-004:2026-12-01). Retries and double clicks are safe.',
        }),
      ]),
    ];
  }

  pmActs(d: Data, p: APlan) {
    if (!d.a.pm) return ['View'];
    if (p.status.startsWith('Closed') || p.status === 'Archived')
      return ['View'];
    return [
      'View',
      'Edit',
      ...(p.status === 'Active'
        ? [
            'Generate work order',
            ...(p.trigger !== 'Meter' ? ['Reschedule'] : []),
            'Pause',
          ]
        : ['Resume']),
      'Archive',
    ];
  }

  // ===== 8 History =========================================================

  histRows(d: Data) {
    type HR = {
      k: string;
      at: Date;
      asset: string;
      type: string;
      summary: string;
      cond: string;
      meter: string;
      source: string;
      by: string | null;
      wo: string | null;
      result: string;
      critical: boolean;
    };
    const ids = d.ids;
    return [
      ...d.events
        .filter((e) => ids.has(e.assetId) && e.type !== 'Created')
        .map((e): HR => ({
          k: `ev:${e.id}`,
          at: e.occurredAt,
          asset: e.assetId,
          type: e.type,
          summary: e.summary,
          cond:
            e.condBefore || e.condAfter
              ? `${e.condBefore ?? '?'} → ${e.condAfter ?? '?'}`
              : '—',
          meter: '—',
          source: 'Assets & Maintenance',
          by: e.byUserId ?? e.bySupplierId ?? e.byTeamId,
          wo: e.woId,
          result: e.result ?? '—',
          critical: e.critical,
        })),
      ...d.readings
        .filter((r) => ids.has(r.assetId))
        .map((r): HR => ({
          k: `mr:${r.id}`,
          at: r.takenAt,
          asset: r.assetId,
          type: r.correctionOfId ? 'Reading correction' : 'Reading',
          summary: `${num(r.value).toLocaleString()} ${this.data.A(d, r.assetId)?.meterUnit ?? ''}${r.reason ? ` — ${r.reason}` : ''}`,
          cond: '—',
          meter: num(r.value).toLocaleString(),
          source: r.source.startsWith('Photo') ? 'Photo of meter' : 'Manual',
          by: r.byUserId,
          wo: null,
          result: '—',
          critical: false,
        })),
      ...d.down
        .filter((z) => ids.has(z.assetId))
        .map((z): HR => ({
          k: `dt:${z.id}`,
          at: z.startAt,
          asset: z.assetId,
          type: 'Downtime',
          summary: `${z.kind} · ${z.cause} · ${this.data.fmtH(this.data.dHours(d, z))}${z.endAt ? '' : ' (ongoing)'}`,
          cond: '—',
          meter: '—',
          source: 'Assets & Maintenance',
          by: z.byUserId,
          wo: z.woId,
          result: z.endAt ? 'Ended' : 'Ongoing',
          critical: false,
        })),
    ];
  }

  vHistory(d: Data) {
    const a = d.a;
    const f = d.s.f.hist ?? {};
    const rows0 = this.histRows(d);
    const q = (f.q ?? '').trim().toLowerCase();
    const since = (n: number) => d.now.getTime() - n * 86400000;
    const L = rows0
      .filter((r) => {
        const x = this.data.A(d, r.asset)!;
        return (
          (!q ||
            `${x.number}${x.name}${r.summary}`.toLowerCase().includes(q)) &&
          (!f.type || r.type === f.type) &&
          (!f.result || r.result === f.result) &&
          (!f.src || r.source.startsWith(f.src)) &&
          (!f.cat || x.categoryId === f.cat) &&
          (!f.days || r.at.getTime() >= since(Number(f.days)))
        );
      })
      .sort((x, y) => y.at.getTime() - x.at.getTime());
    const m30 = (r: { at: Date }) => r.at.getTime() >= since(30);
    const kpis = [
      K(
        'h-insp',
        'Inspections This Month',
        rows0.filter((r) => r.type === 'Inspection' && m30(r)).length,
        'Last 30 days',
        null,
        '#12A150',
      ),
      K(
        'h-fail',
        'Failed Inspections',
        rows0.filter(
          (r) => r.type === 'Inspection' && r.result === 'Fail' && m30(r),
        ).length,
        'Last 30 days',
        '#B42318',
        '#F04438',
      ),
      K(
        'h-cond',
        'Condition Changes',
        rows0.filter((r) => r.type === 'Condition Change' && m30(r)).length,
        'Last 30 days',
        null,
        '#F79009',
      ),
      K(
        'h-svc',
        'Services Completed',
        rows0.filter(
          (r) =>
            [
              'Maintenance',
              'Repair',
              'Calibration',
              'Warranty Service',
            ].includes(r.type) && m30(r),
        ).length,
        'Last 30 days',
        null,
        '#2E90FA',
      ),
      K(
        'h-critf',
        'Critical Findings',
        rows0.filter((r) => r.critical).length,
        'Flagged by inspector',
        null,
        '#F04438',
      ),
      K(
        'h-read',
        'Meter Readings',
        rows0.filter((r) => r.type.startsWith('Reading') && m30(r)).length,
        `${d.readings.filter((r) => r.correctionOfId && d.ids.has(r.assetId)).length} correction(s) · originals kept`,
        null,
        '#6941C6',
      ),
      K(
        'h-wty',
        'Warranty Repairs',
        rows0.filter((r) => r.type === 'Warranty Service').length,
        'All time',
        null,
        '#12A150',
      ),
    ];
    if (!rows0.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No history yet.',
          'Inspections, readings and services will appear here as they’re recorded.',
          [btn('inspect', 'Record inspection', 'primary', !a.complete)],
        ),
      ];
    const types = [...new Set(rows0.map((r) => r.type))];
    const nOn = ['q', 'type', 'result', 'src', 'cat', 'days'].filter(
      (k) => f[k],
    ).length;
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'hist',
          acts: [
            btn('inspect', 'Record Inspection', 'ghost', !a.complete),
            btn('service', 'Record Service Event', 'ghost', !a.complete),
            btn('reading', 'Record Meter Reading', 'ghost', !a.reading),
          ],
          filters: {
            search: 'Search asset or summary',
            q: f.q ?? '',
            sels: [
              sel2('type', 'Event type', f.type ?? '', [
                ['', 'Any event type'],
                ...types.map((x): [string, string] => [x, x]),
              ]),
              sel2('result', 'Result', f.result ?? '', [
                ['', 'Any result'],
                ...[
                  'Pass',
                  'Fail',
                  'Resolved',
                  'Partially Resolved',
                  'Temporary Repair',
                  'Ongoing',
                  'Ended',
                ].map((x): [string, string] => [x, x]),
              ]),
              sel2('src', 'Source', f.src ?? '', [
                ['', 'Any source'],
                ['Assets', 'Assets & Maintenance'],
                ['Manual', 'Manual reading'],
                ['Photo', 'Photo of meter'],
              ]),
              sel2('cat', 'Category', f.cat ?? '', [
                ['', 'Any category'],
                ...d.cats.map((c): [string, string] => [c.id, c.name]),
              ]),
              sel2('days', 'Date', f.days ?? '', [
                ['', 'Any date'],
                ['7', 'Last 7 days'],
                ['30', 'Last 30 days'],
                ['90', 'Last 90 days'],
              ]),
            ],
            nOn: nOn || null,
            count: `${L.length} events`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Date',
                  'Asset',
                  'Event type',
                  'Summary',
                  ['Condition', '1'],
                  ['Meter', '1'],
                  ['Source', '1'],
                  'Performed by',
                  ['Work order', '1'],
                  'Result',
                ]),
                rows: L.slice(0, 300).map((r) => {
                  const x = this.data.A(d, r.asset)!;
                  const rid = r.k.slice(3);
                  const canCorrect =
                    r.k.startsWith('mr:') &&
                    a.edit &&
                    !d.readings.find((z) => z.id === rid)?.correctionOfId &&
                    !d.readings.some((z) => z.correctionOfId === rid);
                  return row(
                    `${r.k}|${r.asset}`,
                    [
                      cell({ t: this.dayOf(d, r.at), s: d.fmt.rel(r.at) }),
                      cell({ t: x.number, s: x.name }),
                      cell({ t: r.type, fw: 700, fg: '#101828' }),
                      cell({ t: r.summary, mw: '300px' }),
                      cell({ t: r.cond, opt: '1' }),
                      cell({ t: r.meter, opt: '1' }),
                      cell({ t: r.source, opt: '1' }),
                      cell({ t: this.data.person(d, r.by) }),
                      cell({
                        t: d.wos.find((w) => w.id === r.wo)?.number ?? '—',
                        opt: '1',
                      }),
                      r.result === 'Fail'
                        ? cell({ bt: '✕ Fail', bfg: '#B42318', bbg: '#FEF3F2' })
                        : r.result === 'Pass'
                          ? cell({
                              bt: '✓ Pass',
                              bfg: '#0E8442',
                              bbg: '#ECFDF3',
                            })
                          : cell({ t: r.result }),
                    ],
                    [
                      'View',
                      'Open asset',
                      ...(canCorrect ? ['Correct reading'] : []),
                    ],
                    [
                      `${r.type} · ${x.number}`,
                      `${this.dayOf(d, r.at)} · ${r.summary}`,
                      [],
                    ],
                  );
                }),
              }
            : null,
          empty: L.length
            ? null
            : {
                t: 'No events match these filters.',
                d: '',
                acts: [btn('hclear', 'Clear filters', 'primary')],
              },
          pager:
            L.length > 300
              ? {
                  t: `Showing the latest 300 of ${L.length} — narrow the filters or export`,
                  noPrev: true,
                  noNext: true,
                }
              : null,
        }),
      ]),
    ];
  }

  // ===== 9 Analytics =======================================================

  vAnalytics(d: Data) {
    const a = d.a;
    const f = d.s.f.an ?? {};
    const P = d.s.period;
    const Hh = P * 24;
    const P0 = this.data.periodStart(d);
    const pool = d.assets.filter(
      (x) =>
        x.status !== 'Archived' &&
        (!f.cat || x.categoryId === f.cat) &&
        (!f.crit || x.criticality === f.crit),
    );
    if (!d.down.length && !d.wos.length)
      return emptyRows(
        'Analytics will appear after asset service and downtime activity is recorded.',
        'We don’t show empty zero charts for new businesses.',
        [],
      );
    const pIds = new Set(pool.map((x) => x.id));
    const dts = d.down.filter(
      (z) =>
        pIds.has(z.assetId) &&
        this.data.inPeriod(d, z) &&
        (!f.pu || z.kind === f.pu),
    );
    const un = dts.filter((z) => z.kind === 'Unplanned');
    const pl = dts.filter((z) => z.kind === 'Planned');
    const uh = un.reduce((s, z) => s + this.data.dHours(d, z, P0), 0);
    const ph = pl.reduce((s, z) => s + this.data.dHours(d, z, P0), 0);
    const N = pool.length;
    const avail =
      N && N * Hh - ph > 0 ? ((N * Hh - ph - uh) / (N * Hh - ph)) * 100 : null;
    const fAssets = pool
      .map((x) => [x, this.data.metrics(d, x.id)] as const)
      .filter((z) => z[1].f > 0);
    const mtbfs = fAssets.filter((z) => z[1].mtbf != null);
    const mtbf = mtbfs.length
      ? mtbfs.reduce((s, z) => s + z[1].mtbf!, 0) / mtbfs.length
      : null;
    const mttr = un.length ? uh / un.length : null;
    const wos = d.wos.filter(
      (w) =>
        pIds.has(w.assetId) &&
        w.completedAt &&
        w.completedAt.getTime() > P0 &&
        (!f.type || w.type === f.type),
    );
    const cost = wos.reduce((s, w) => s + this.data.woCost(w), 0);
    const prev = wos.filter((w) => w.type === 'Preventive').length;
    const corr = wos.filter((w) =>
      ['Corrective', 'Repair', 'Emergency'].includes(w.type),
    ).length;
    const rep = fAssets.filter((z) => z[1].f >= 2).length;
    const pmDone = d.wos.filter(
      (w) => w.pmPlanId && w.completedAt && pIds.has(w.assetId),
    ).length;
    const pmOver = d.plans.filter(
      (p) => pIds.has(p.assetId) && this.data.isOverdue(d, p),
    ).length;
    const crit = pool.filter((x) => x.criticality === 'Critical');
    const critAvail = crit.length
      ? crit.reduce((s, x) => s + this.data.metrics(d, x.id).avail, 0) /
        crit.length
      : null;
    const kpis = [
      K(
        'a-down',
        'Total Downtime',
        this.data.fmtH(uh + ph),
        `${dts.length} events · click for records`,
        null,
        '#F04438',
      ),
      K(
        'a-un',
        'Unplanned Downtime',
        this.data.fmtH(uh),
        `${un.length} failures`,
        '#B42318',
        '#F04438',
      ),
      K(
        'a-pl',
        'Planned Downtime',
        this.data.fmtH(ph),
        `${pl.length} maintenance windows`,
        null,
        '#2E90FA',
      ),
      K(
        'a-avail',
        'Asset Availability',
        avail == null ? '—' : `${avail.toFixed(2)}%`,
        'Operating ÷ planned available time',
        null,
        '#12A150',
      ),
      K(
        'a-mtbf',
        'MTBF',
        mtbf == null ? 'Insufficient data' : this.data.fmtH(mtbf),
        `${mtbfs.length} asset(s) with ≥2 failures`,
        null,
        '#6941C6',
      ),
      K(
        'a-mttr',
        'MTTR',
        mttr == null ? 'Insufficient data' : this.data.fmtH(mttr),
        'Unplanned hours ÷ failures',
        null,
        '#6941C6',
      ),
      K(
        'a-cost',
        'Maintenance Cost',
        a.cost ? this.money(d, cost) : '🔒',
        a.cost ? `${wos.length} completed orders` : 'Needs View Cost',
        null,
        '#0A1B2A',
      ),
      K(
        'a-ratio',
        'Preventive vs Corrective',
        prev + corr ? `${prev} : ${corr}` : 'Insufficient data',
        prev + corr
          ? `${Math.round((prev / (prev + corr)) * 100)}% preventive`
          : '',
        null,
        '#12A150',
      ),
      K(
        'a-rep',
        'Repeat Failure Rate',
        fAssets.length
          ? `${Math.round((rep / fAssets.length) * 100)}%`
          : 'Insufficient data',
        `${rep} of ${fAssets.length} failed assets failed again`,
        rep ? '#B42318' : null,
        '#F79009',
      ),
      K(
        'a-pmc',
        'PM Compliance',
        pmDone + pmOver >= 3
          ? `${Math.round((pmDone / (pmDone + pmOver)) * 100)}%`
          : 'Insufficient data',
        `${pmDone} done · ${pmOver} overdue`,
        null,
        '#12A150',
      ),
      K(
        'a-crel',
        'Critical Asset Reliability',
        critAvail == null ? '—' : `${critAvail.toFixed(2)}%`,
        `${crit.length} critical assets · availability`,
        null,
        '#F04438',
      ),
    ];
    const wkN = Math.min(12, Math.ceil(P / 7));
    const wk: [string, number, number][] = [];
    for (let i = wkN - 1; i >= 0; i--) {
      const e = d.now.getTime() - i * 7 * 86400000;
      const s = e - 7 * 86400000;
      const segH = (k: string) =>
        dts
          .filter((z) => z.kind === k)
          .reduce(
            (acc, z) =>
              acc +
              Math.max(
                0,
                Math.min(this.data.dEnd(d, z), e) -
                  Math.max(z.startAt.getTime(), s),
              ) /
                3600000,
            0,
          );
      wk.push([
        d.fmt.day(new Date(s + 86400000)),
        segH('Unplanned'),
        segH('Planned'),
      ]);
    }
    const mx = Math.max(1, ...wk.map((w) => w[1] + w[2]));
    const trend = {
      legend: [
        { t: 'Unplanned', c: '#F04438' },
        { t: 'Planned', c: '#2E90FA' },
      ],
      note: `Hours per week · ${this.data.fmtH(uh + ph)} total`,
      aria: `Weekly downtime: ${wk.map((w) => `${w[0]} ${w[1].toFixed(1)}h unplanned, ${w[2].toFixed(1)}h planned`).join('; ')}`,
      cols: wk.map((w) => ({
        l: w[0],
        tip: `${w[0]}: ${w[1].toFixed(1)}h unplanned · ${w[2].toFixed(1)}h planned`,
        bars: [
          { h: `${Math.round((w[1] / mx) * 100)}%`, c: '#F04438' },
          { h: `${Math.round((w[2] / mx) * 100)}%`, c: '#2E90FA' },
        ],
      })),
    };
    const byAsset = pool
      .map(
        (x) =>
          [
            x,
            dts
              .filter((z) => z.assetId === x.id)
              .reduce((s, z) => s + this.data.dHours(d, z, P0), 0),
          ] as const,
      )
      .filter((z) => z[1] > 0)
      .sort((p, q) => q[1] - p[1])
      .slice(0, 6);
    const byCat: Record<string, number> = {};
    un.forEach((z) => {
      const c = this.data.catName(d, this.data.A(d, z.assetId)?.categoryId);
      byCat[c] = (byCat[c] ?? 0) + 1;
    });
    const ct = (t: string) =>
      wos
        .flatMap((w) => w.costs)
        .filter((c) => c.type === t)
        .reduce((s, c) => s + num(c.amount), 0);
    const tbl = pool
      .map((x) => [x, this.data.metrics(d, x.id)] as const)
      .sort((p, q) => q[1].uh + q[1].ph - (p[1].uh + p[1].ph));
    const ins = this.insights(d, pool);
    const nOn = ['cat', 'crit', 'pu', 'type'].filter((k) => f[k]).length;
    return [
      kpiRow(kpis),
      R(
        'minmax(0,1fr)',
        [
          card({
            id: 'an-f',
            title: 'Filters',
            filters: {
              search: null,
              q: '',
              sels: [
                sel2('period', 'Period', String(P), [
                  ['30', 'Last 30 days'],
                  ['90', 'Last 90 days'],
                  ['365', 'Last 12 months'],
                ]),
                sel2('cat', 'Category', f.cat ?? '', [
                  ['', 'Any category'],
                  ...d.cats.map((c): [string, string] => [c.id, c.name]),
                ]),
                sel2('crit', 'Criticality', f.crit ?? '', [
                  ['', 'Any criticality'],
                  ...LEVELS.map((x): [string, string] => [x, x]),
                ]),
                sel2('pu', 'Planned / unplanned', f.pu ?? '', [
                  ['', 'Planned & unplanned'],
                  ['Planned', 'Planned only'],
                  ['Unplanned', 'Unplanned only'],
                ]),
                sel2('type', 'Maintenance type', f.type ?? '', [
                  ['', 'Any maintenance type'],
                  ...d.cfg.mtypes.map((x): [string, string] => [x, x]),
                ]),
              ],
              nOn: nOn || null,
              count: `${N} assets in scope`,
            },
            acts: [btn('export', 'Export CSV', 'ghost', !a.export)],
          }),
        ],
        false,
      ),
      R('minmax(0,1.4fr) minmax(0,1fr)', [
        card({
          id: 'an-trend',
          title: 'Downtime trend · planned vs unplanned',
          trend,
          acts: [btn('dd:all', 'Show downtime records')],
        }),
        card({
          id: 'an-top',
          title: 'Top downtime assets',
          bars: byAsset.length
            ? mkBars(
                byAsset.map(([x, h]): [string, number, string] => [
                  `${x.number} ${x.name.split(' — ')[0]}`,
                  h,
                  x.criticality === 'Critical' ? '#F04438' : '#F79009',
                ]),
                null,
                (v) => this.data.fmtH(v),
              )
            : null,
          empty: byAsset.length
            ? null
            : { t: 'No downtime in period.', d: '', acts: [] },
          acts: byAsset
            .slice(0, 3)
            .map(([x]) => btn(`dd:${x.id}`, `${x.number} records`)),
        }),
      ]),
      R('minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', [
        card({
          id: 'an-mix',
          title: 'Preventive vs corrective',
          bars:
            prev + corr
              ? mkBars(
                  [
                    ['Preventive', prev, '#12A150'],
                    ['Corrective / repair', corr, '#F04438'],
                    ['Other', wos.length - prev - corr, '#98A2B3'],
                  ],
                  null,
                  (v) => `${v} orders`,
                )
              : null,
          empty:
            prev + corr
              ? null
              : {
                  t: 'Insufficient data',
                  d: 'No completed orders in this period.',
                  acts: [],
                },
        }),
        card({
          id: 'an-cat',
          title: 'Failures by category',
          bars: Object.keys(byCat).length
            ? mkBars(Object.entries(byCat), '#F79009', (v) => `${v} failures`)
            : null,
          empty: Object.keys(byCat).length
            ? null
            : { t: 'No failures in period.', d: '', acts: [] },
        }),
        card({
          id: 'an-cost',
          title: 'Cost breakdown',
          sub: 'Operational cost refs — not a P&L',
          bars: a.cost
            ? mkBars(
                (['Parts', 'Labor', 'Vendor', 'Other'] as const).map(
                  (t): [string, number, string] => [t, ct(t), '#0A1B2A'],
                ),
                null,
                (v) => this.money(d, v),
              )
            : null,
          empty: a.cost
            ? null
            : { t: 'Restricted', d: 'Needs View Cost permission.', acts: [] },
        }),
      ]),
      R('minmax(0,1fr)', [
        card({
          id: 'an-ai',
          title: 'Insights',
          sub: 'Pattern detection over recorded events only — every insight shows its evidence. Nothing is inferred without data.',
          table: ins.length
            ? {
                hasActs: true,
                cols: cols([
                  'Insight',
                  'Evidence',
                  'Confidence',
                  ['Assumptions', '1'],
                  'Suggested action',
                ]),
                rows: ins.map((x) =>
                  row(
                    x.id,
                    [
                      cell({
                        t: x.t,
                        fw: 800,
                        fg: '#101828',
                        s: x.asset.number,
                      }),
                      cell({ t: x.ev, mw: '300px' }),
                      cell({
                        bt: x.conf,
                        bfg: x.conf === 'High' ? '#0E8442' : '#B54708',
                        bbg: x.conf === 'High' ? '#ECFDF3' : '#FEF6E7',
                      }),
                      cell({ t: x.as, opt: '1', mw: '220px' }),
                      cell({ t: x.act, mw: '220px' }),
                    ],
                    [
                      'Open asset',
                      ...(a.request ? ['Create request from insight'] : []),
                      'Dismiss',
                    ],
                    [x.t, x.ev, []],
                  ),
                ),
              }
            : null,
          empty: ins.length
            ? null
            : { t: 'No patterns detected.', d: '', acts: [] },
        }),
      ]),
      R('minmax(0,1fr)', [
        card({
          id: 'an-tbl',
          title: 'Asset reliability',
          sub: `Period: last ${P} days. MTBF needs ≥ 2 failures; MTTR needs ≥ 1.`,
          table: tbl.length
            ? {
                hasActs: true,
                cols: cols([
                  'Asset',
                  ['Category', '1'],
                  'Availability',
                  'Downtime',
                  'Failures',
                  'MTBF',
                  'MTTR',
                  ['PM compliance', '1'],
                  ['Cost', '1'],
                  'Condition',
                  'Risk',
                ]),
                rows: tbl.map(([x, m]) => {
                  const h = this.data.health(d, x);
                  const pp = this.data
                    .plansOf(d, x.id)
                    .filter((p) => p.status === 'Active');
                  const bandFg =
                    h.band === 'Healthy'
                      ? '#0E8442'
                      : h.band === 'Critical'
                        ? '#B42318'
                        : h.band === 'Unknown'
                          ? '#475467'
                          : '#B54708';
                  const bandBg =
                    h.band === 'Healthy'
                      ? '#ECFDF3'
                      : h.band === 'Critical'
                        ? '#FEF3F2'
                        : h.band === 'Unknown'
                          ? '#F2F4F7'
                          : '#FEF6E7';
                  return row(
                    x.id,
                    [
                      cell({ t: x.number, s: x.name, fw: 800, fg: '#101828' }),
                      cell({ t: this.data.catName(d, x.categoryId), opt: '1' }),
                      cell({
                        t: `${m.avail.toFixed(2)}%`,
                        fg: m.avail < 99 ? '#B42318' : '#344054',
                        fw: 700,
                      }),
                      cell({ t: this.data.fmtH(m.uh + m.ph) }),
                      cell({ t: String(m.f) }),
                      cell({
                        t:
                          m.mtbf == null
                            ? 'Insufficient data'
                            : this.data.fmtH(m.mtbf),
                        fg: m.mtbf == null ? '#98A2B3' : '#344054',
                      }),
                      cell({
                        t:
                          m.mttr == null
                            ? 'Insufficient data'
                            : this.data.fmtH(m.mttr),
                        fg: m.mttr == null ? '#98A2B3' : '#344054',
                      }),
                      cell({
                        t: pp.length
                          ? pp.some((p) => this.data.isOverdue(d, p))
                            ? 'Overdue'
                            : 'On track'
                          : 'No plan',
                        opt: '1',
                      }),
                      cell({
                        t: this.costOrLock(
                          d,
                          d.wos
                            .filter(
                              (w) =>
                                w.assetId === x.id &&
                                w.completedAt &&
                                w.completedAt.getTime() > P0,
                            )
                            .reduce((s, w) => s + this.data.woCost(w), 0),
                        ),
                        opt: '1',
                      }),
                      this.condc(x.condition),
                      cell({ bt: h.band, bfg: bandFg, bbg: bandBg }),
                    ],
                    ['Downtime records', 'Open asset'],
                    [
                      `${x.number} · ${x.name}`,
                      `${m.avail.toFixed(2)}% · ${m.f} failures`,
                      [],
                    ],
                  );
                }),
              }
            : null,
          empty: tbl.length
            ? null
            : { t: 'No assets in scope.', d: '', acts: [] },
        }),
      ]),
    ];
  }

  /** The design's four deterministic insight rules, each with its evidence. */
  insights(d: Data, pool: AAsset[]): Ins[] {
    const out: Ins[] = [];
    const since60 = d.now.getTime() - 60 * 86400000;
    pool.forEach((x) => {
      const f = d.down.filter(
        (z) =>
          z.assetId === x.id &&
          z.kind === 'Unplanned' &&
          z.startAt.getTime() > since60,
      );
      const c = d.wos
        .filter((w) => w.assetId === x.id)
        .reduce((s, w) => s + this.data.woCost(w), 0);
      const wd = this.data.wtyDays(d, x);
      if (f.length >= 3) {
        const last = d.wos
          .filter((w) => w.assetId === x.id && w.outcome)
          .sort(
            (p, q) =>
              (q.completedAt?.getTime() ?? 0) - (p.completedAt?.getTime() ?? 0),
          )[0];
        out.push({
          id: `in_rep_${x.id}`,
          asset: x,
          t: 'Repeated failure pattern',
          ev: `${f.length} unplanned failures in 60 days (${f.map((z) => `${d.fmt.day(z.startAt)}: ${z.cause}`).join('; ')}). Last repair outcome: ${last?.outcome ?? '—'}.`,
          conf: 'High',
          as: 'Failures logged as downtime events; causes as recorded.',
          act: `Review replace-vs-repair${wd != null ? `; warranty ${wd > 0 ? `expires ${this.dayOf(d, x.warrantyEnd)} — raise a warranty claim first` : `expired ${this.dayOf(d, x.warrantyEnd)}`}` : ''}.`,
        });
      }
      const vibEv = d.events.filter(
        (e) =>
          e.assetId === x.id &&
          /vibrat/i.test(`${e.summary} ${e.findings ?? ''}`),
      );
      const vibRq = d.requests.filter(
        (r) => r.assetId === x.id && r.issueType === 'Noise/Vibration',
      );
      if (vibEv.length + vibRq.length >= 2)
        out.push({
          id: `in_vib_${x.id}`,
          asset: x,
          t: 'Recurring vibration finding',
          ev: `${vibEv.length + vibRq.length} vibration records (${[...vibEv.map((e) => `${e.type.toLowerCase()} ${d.fmt.day(e.occurredAt)}`), ...vibRq.map((r) => `request ${r.number}`)].join(', ')}).`,
          conf: 'Medium',
          as: 'Cause not confirmed — based on recorded inspection text and request types.',
          act: 'Inspect mounts and fixings within 7 days.',
        });
      if (wd != null && wd > 0 && wd <= 60 && f.length)
        out.push({
          id: `in_wty_${x.id}`,
          asset: x,
          t: 'Warranty repair opportunity',
          ev: `Warranty (${x.warrantyProvider ?? '—'}, ${x.warrantyType ?? '—'}) valid until ${this.dayOf(d, x.warrantyEnd)}; ${f.length} failure(s) recorded while covered.`,
          conf: 'High',
          as: 'Coverage terms are in the warranty document on the asset.',
          act: `Route open repair to ${x.warrantyProvider ?? 'the provider'} under warranty before ${this.dayOf(d, x.warrantyEnd)}.`,
        });
      if (d.a.cost && x.cost && num(x.cost) > 0 && c > num(x.cost) * 0.4)
        out.push({
          id: `in_cost_${x.id}`,
          asset: x,
          t: 'High cost, low reliability',
          ev: `Maintenance cost ${this.money(d, c)} = ${Math.round((c / num(x.cost)) * 100)}% of purchase cost ${this.money(d, num(x.cost))}.`,
          conf: 'Medium',
          as: 'Uses operational cost refs; Finance book value not included.',
          act: 'Consider replacement at next budget cycle.',
        });
    });
    return out.filter((x) => !d.dismissed.has(x.id));
  }

  // ===== 10 Settings =======================================================

  async vSettings(d: Data) {
    const a = d.a;
    const ro = !a.settings;
    const dis = ro;
    const sec = AM_SECS.find((x) => x[0] === d.s.sec) ?? AM_SECS[0];
    const C = d.cfg;
    const s = await this.ctx.ensure(a.rootId);
    const perms = await this.settings.perms(a);
    const list = (k: keyof typeof C, h?: string) => [
      fChips(sec[1], `config.${k}`, C[k] as string[], C[k] as string[], {
        dis,
        h:
          h ??
          'Tap to remove an option. Options in use by records can’t be removed.',
      }),
      fBtns('', [btn(`opt-add:${k}`, '+ Add option', 'ghost', dis)]),
    ];
    const F: Record<string, unknown[]> = {
      numbering: [
        fTxt('Prefix', 'config.numbering.prefix', C.numbering.prefix, { dis }),
        fTxt('Digits', 'config.numbering.pad', C.numbering.pad, {
          type: 'number',
          dis,
        }),
        fRead(
          'Next number',
          C.numbering.prefix +
            String(s.nextAsset).padStart(C.numbering.pad, '0'),
        ),
        fTog(
          'Allow manual override',
          'config.numbering.manual',
          C.numbering.manual,
          { dis },
        ),
        fChips(
          'Must be unique',
          'config.numbering.unique',
          ['Asset tag', 'Serial number', 'Barcode'],
          C.numbering.unique,
          { dis },
        ),
      ],
      statuses: [
        fChips(
          'Allowed statuses',
          'config.statuses.allowed',
          Object.keys(ASSET_T),
          C.statuses.allowed,
          {
            dis,
            h: 'Transitions are validated server-side, e.g. Archived can never return to Active.',
          },
        ),
        fRead(
          'Transitions',
          Object.entries(ASSET_T)
            .map(([k, v]) => `${k} → ${v.join(', ') || 'none'}`)
            .join('\n'),
        ),
      ],
      condition: C.condition.map((c, i) =>
        fTxt(c[0], `config.condition.${i}.1`, c[1] ?? '', {
          type: 'number',
          dis: dis || c[1] == null,
          h: c[1] == null ? 'Unknown is never scored' : 'Score 0–100',
        }),
      ),
      criticality: C.criticality.flatMap((c, i) => [
        fTxt(
          `${c.level} — escalate downtime after (hours)`,
          `config.criticality.${i}.escalateHours`,
          c.escalateHours ?? '',
          { type: 'number', dis, h: 'Blank = never escalate' },
        ),
        fSel(
          `${c.level} — escalate to`,
          `config.criticality.${i}.escalateTo`,
          c.escalateTo,
          ['Owner', 'Manager', 'Team', 'None'],
          { dis },
        ),
        fTxt(
          `${c.level} — work orders need approval above (${d.fmt.base})`,
          `config.criticality.${i}.approvalAbove`,
          c.approvalAbove,
          { type: 'number', dis, h: 'Estimated parts + entered cost' },
        ),
      ]),
      meters: list('meters'),
      mtypes: list('mtypes'),
      priorities: list('priorities'),
      dreasons: list('dreasons'),
      wtypes: list('wtypes'),
      pm: [
        fTxt('Lead time (days)', 'config.pm.lead', C.pm.lead, {
          type: 'number',
          dis,
        }),
        fTog('Auto-create work orders', 'config.pm.auto', C.pm.auto, { dis }),
        fSel(
          'Reminder',
          'config.pm.reminder',
          C.pm.reminder,
          ['1 day before due', '3 days before due', '7 days before due'],
          {
            dis,
            h: 'Owners and the responsible team get an in-app notification this far ahead.',
          },
        ),
        fTxt('Tolerance', 'config.pm.tolerance', C.pm.tolerance, { dis }),
      ],
      perms: [
        fRead('Owner', 'Always has every permission (can’t be changed).'),
        ...PERM_ROWS.map(([l, cap]) =>
          fChips(
            l,
            `perms.${cap}`,
            perms.roles.map((r) => ({ v: r.key, t: r.label })),
            perms.matrix[cap],
            { dis: dis || (cap === 'assets.settings' && !a.settings) },
          ),
        ),
        fRead(
          'Applies to',
          `${d.group.find((g) => g.id === a.businessId)?.name ?? 'This business'} — saved as real role permissions (Staff › Roles uses the same settings).`,
        ),
      ],
      custom: [
        ...d.cfields.map((c) =>
          fRead(
            c.name,
            `${c.type} · ${(c.categoryIds as string[]).map((id) => this.data.catName(d, id)).join(', ') || 'All categories'}`,
            { btns: dis ? null : [btn(`cf-del:${c.id}`, 'Remove', 'danger')] },
          ),
        ),
        fBtns('', [btn('cf-new', '+ Add field', 'ghost', dis)]),
      ],
      teams: [
        ...d.teams.map((t) =>
          fRead(
            t.name,
            t.members.map((m) => this.data.person(d, m.userId)).join(', ') ||
              'No members',
            {
              btns: dis
                ? null
                : [
                    btn(`team-edit:${t.id}`, 'Edit'),
                    btn(`team-del:${t.id}`, 'Remove', 'danger'),
                  ],
            },
          ),
        ),
        fBtns('', [btn('team-new', '+ Add team', 'ghost', dis)]),
      ],
      templates: [
        ...d.templates.map((t) =>
          fRead(t.name, (t.checklist as string[]).join(' · ') || 'No steps', {
            btns: !a.pm
              ? null
              : [
                  btn(`tpl-edit:${t.id}`, 'Edit'),
                  btn(`tpl-del:${t.id}`, 'Remove', 'danger'),
                ],
          }),
        ),
        fBtns('', [btn('tpl-new', '+ Add template', 'ghost', !a.pm)]),
      ],
    };
    return {
      nav: AM_SECS.map(([k, t]) => ({ k, t })),
      sec: { k: sec[0], t: sec[1], d: sec[2] },
      v: s.version,
      readOnly: ro,
      roText: `Read-only for ${a.roleLabel}. Changing asset settings needs “assets.settings” (Owners by default).`,
      fields: F[sec[0]] ?? [],
      saved: { config: C, perms: perms.matrix },
      liveSecs: ['custom', 'teams', 'templates'],
    };
  }
}
