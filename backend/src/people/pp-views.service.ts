import { Injectable } from '@nestjs/common';
import {
  K,
  R,
  btn,
  card,
  cell,
  cols,
  fRead,
  kpiRow,
  mkBars,
  row,
  seg,
  hoistSegActs,
} from '../payments/pay-vm';
import { dayKey, hourOf, hh } from '../field-service/fs-time';
import { PpActor, num } from './pp-context.service';
import {
  Calc,
  Data,
  Inp,
  PpDataService,
  addDays,
  diffDays,
  keyDate,
  monthBounds,
  periodLabel,
} from './pp-data.service';
import {
  APP_CLOSED,
  APP_T,
  PP_CST,
  PP_TABS,
  RUN_FINAL,
  STAGES,
  SOURCES,
} from './pp.constants';

type Btn = ReturnType<typeof btn>;
const LOCK = '🔒';

export const chipOf = (st: string) => {
  const C = PP_CST[st] ?? ['#344054', '#F2F4F7', ''];
  return { t: (C[2] ? `${C[2]} ` : '') + st, fg: C[0], bg: C[1] };
};
export const stc = (st: string) => {
  const c = chipOf(st);
  return cell({ bt: c.t, bfg: c.fg, bbg: c.bg });
};
const sel2 = (
  k: string,
  l: string,
  v: string | undefined,
  opts: (string | [string, string])[],
) => ({
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
const emptyRows = (t: string, d: string, acts: Btn[] = []) => [
  R('minmax(0,1fr)', [card({ empty: { t, d, acts } })]),
];
const uniq = <T>(x: T[]) => [...new Set(x)];
const OPEN_JOB = ['Open', 'Published'];
const RUN_NEXT: Record<string, [string, string]> = {
  Draft: ['lock', 'Lock inputs'],
  'Inputs Locked': ['calc', 'Calculate'],
  Exceptions: ['calc', 'Recalculate after fixes'],
  Calculated: ['submit', 'Submit for approval'],
  'Approval Required': ['approve', 'Approve'],
  Approved: ['finalize', 'Finalize'],
  Finalized: ['post', 'Create finance posting'],
  'Finance Posting Pending': ['postcheck', 'Refresh finance status'],
  'Finance Posted': ['payout', 'Create payout batch'],
  'Payout Submitted': ['paycheck', 'Record bank confirmation'],
  'Partially Paid': ['paycheck', 'Record bank confirmation'],
  'Payout Failed': ['paycheck', 'Record bank confirmation'],
};

/** Server-built view-models for the People & Payroll screens (pp-core.js), from real rows only. */
@Injectable()
export class PpViewsService {
  constructor(private readonly X: PpDataService) {}

  allowed(a: PpActor, k: string) {
    const org = a.scope === 'org';
    const team = a.scope !== 'self';
    switch (k) {
      case 'overview':
        return team || a.payroll;
      case 'recruitment':
      case 'jobs':
        return a.recruit || a.jobApprove || a.offerApprove || a.interview;
      case 'applicants':
      case 'interviews':
        return a.recruit || a.interview;
      case 'offers':
        return a.recruit || a.offerApprove || a.interview;
      case 'onboarding':
        return true;
      case 'leave':
        return true;
      case 'payroll':
      case 'runs':
        return a.payroll || a.payApprove || a.payout || a.salary;
      case 'payslips':
        return true;
      case 'benefits':
        return a.benefits || a.payroll || a.payApprove;
      case 'performance':
        return true;
      case 'training':
        return true;
      case 'offboarding':
        return a.offboard || a.payroll || team || org;
      default:
        return false;
    }
  }
  runCan(a: PpActor, k: string) {
    return ['approve', 'finalize', 'reject'].includes(k)
      ? a.payApprove
      : ['payout', 'paycheck', 'retry'].includes(k)
        ? a.payout
        : a.payroll;
  }

  // ── header ────────────────────────────────────────────────────────────

  async header(d: Data) {
    const a = d.a;
    const T = PP_TABS.find((t) => t[0] === d.s.tab) ?? PP_TABS[0];
    const H: Record<string, Btn[]> = {
      overview: [
        btn('newjob', 'Add Hiring Request', 'ghost', !a.recruit),
        btn('startpay', 'Start Payroll', 'primary', !a.payroll),
      ],
      recruitment: [btn('newjob', 'New Vacancy', 'primary', !a.recruit)],
      jobs: [btn('newjob', 'Create job', 'primary', !a.recruit)],
      applicants: [btn('newcand', 'Add candidate', 'primary', !a.recruit)],
      interviews: [btn('newint', 'Schedule', 'primary', !a.interview)],
      offers: [btn('newoffer', 'Create offer', 'primary', !a.recruit)],
      leave: [btn('newleave', 'Request leave', 'primary', !d.me)],
      payroll: [btn('startpay', 'Start Payroll', 'primary', !a.payroll)],
      runs: [],
      benefits: [btn('newrule', 'Create rule', 'primary', !a.benefits)],
      training: [btn('assigntr', 'Assign', 'primary', !a.training)],
      offboarding: [btn('newofb', 'Start offboarding', 'primary', !a.offboard)],
    };
    const lvN = d.leaves.filter(
      (l) =>
        l.status === 'Submitted' &&
        this.X.inScope(d, l.uid) &&
        a.leaveApprove &&
        l.uid !== a.userId,
    ).length;
    const blk =
      a.payroll || a.payApprove
        ? (await this.X.readiness(d)).filter((x) => x.st === 'Blocking').length
        : 0;
    const offN = a.offerApprove
      ? d.offers.filter((o) => o.status === 'Approval Required').length
      : 0;
    const showSels =
      ['overview', 'leave', 'performance', 'training'].includes(d.s.tab) &&
      a.scope !== 'self';
    return {
      title: T[3],
      sub: T[4],
      icon: T[5],
      roleLabel: `${a.roleLabel} · ${a.name}`,
      tabs: PP_TABS.filter((t) => this.allowed(a, t[0])).map((t) => ({
        k: t[0],
        label: t[1],
        path: t[2],
        badge:
          t[0] === 'leave' && lvN
            ? String(lvN)
            : t[0] === 'payroll' && blk
              ? `${blk} blocking`
              : t[0] === 'offers' && offN
                ? String(offN)
                : null,
      })),
      hdrActs: H[d.s.tab] ?? [],
      sels: showSels
        ? [
            {
              k: 'branch',
              l: 'Branch',
              v: d.s.branch,
              opts: [
                { v: '', t: 'All branches' },
                ...d.group.map((g) => ({ v: g.id, t: g.name })),
              ],
            },
            {
              k: 'dept',
              l: 'Department',
              v: d.s.dept,
              opts: [
                {
                  v: '',
                  t: a.scope === 'team' ? 'My team' : 'All departments',
                },
                ...this.X.depts(d).map((x) => ({ v: x, t: x })),
              ],
            },
          ]
        : [],
      more: [
        ...(a.recruit ? [{ v: 'newjob', t: 'Add hiring request' }] : []),
        ...(a.payroll ? [{ v: 'startpay', t: 'Start payroll' }] : []),
        ...(a.payroll && d.s.tab === 'runs'
          ? [{ v: 'newcorr', t: 'Create correction run' }]
          : []),
        ...(a.export ? [{ v: 'export', t: 'Export' }] : []),
        ...(a.audit ? [{ v: 'audit', t: 'Audit / history' }] : []),
        ...(d.me ? [{ v: 'myprofile', t: 'My payroll profile' }] : []),
        ...(a.settings || a.owner
          ? [
              { v: 'set:payroll', t: 'Settings · Payroll' },
              { v: 'set:tax', t: 'Settings · Tax table' },
              { v: 'set:leave', t: 'Settings · Leave types' },
              { v: 'set:recruit', t: 'Settings · Recruiting & careers' },
              { v: 'set:onb', t: 'Settings · Checklists & tasks' },
            ]
          : []),
      ],
      loadedAt: d.now.toISOString(),
      me: a.userId,
      banner:
        !a.salary &&
        ['payroll', 'runs', 'overview'].includes(d.s.tab) &&
        a.scope !== 'self'
          ? {
              t: 'Salary details are restricted for your role',
              d: 'Amounts show 🔒 — they aren’t sent to your browser.',
            }
          : null,
    };
  }

  async screen(a: PpActor, d: Data) {
    const head = await this.header(d);
    const s = d.s;
    if (!this.allowed(a, s.tab))
      return {
        head,
        gate: {
          t: `${(PP_TABS.find((t) => t[0] === s.tab) ?? PP_TABS[0])[3]} isn’t available for your role`,
          d: 'Restricted HR data is never sent to this browser.',
        },
      };
    const fn: Record<string, (x: Data) => unknown[] | Promise<unknown[]>> = {
      overview: (x) => this.vOverview(x),
      recruitment: (x) => this.vRecruitment(x),
      jobs: (x) => this.vJobs(x),
      applicants: (x) => this.vApplicants(x),
      interviews: (x) => this.vInterviews(x),
      offers: (x) => this.vOffers(x),
      onboarding: (x) => this.vOnboarding(x),
      leave: (x) => this.vLeave(x),
      payroll: (x) => this.vPayroll(x),
      runs: (x) => this.vRuns(x),
      payslips: (x) => this.vPayslips(x),
      benefits: (x) => this.vBenefits(x),
      performance: (x) => this.vPerformance(x),
      training: (x) => this.vTraining(x),
      offboarding: (x) => this.vOffboarding(x),
    };
    const i = PP_TABS.findIndex((t) => t[0] === s.tab);
    const rows = hoistSegActs(await (fn[s.tab] ?? fn.overview)(d), head);
    return {
      head,
      rows,
      screenLabel: `${String(i + 1).padStart(2, '0')} ${(PP_TABS[i] ?? PP_TABS[0])[3]}`,
    };
  }

  private paged<T>(d: Data, L: T[], n = 10) {
    const k = d.s.tab;
    const p = Math.min(
      d.s.page[k] || 0,
      Math.max(0, Math.ceil(L.length / n) - 1),
    );
    return {
      rows: L.slice(p * n, p * n + n),
      pager:
        L.length > n
          ? {
              t: `Showing ${p * n + 1}–${Math.min(L.length, p * n + n)} of ${L.length}`,
              noPrev: p === 0,
              noNext: (p + 1) * n >= L.length,
            }
          : null,
    };
  }
  private F(d: Data, k: string) {
    return d.s.f[k] ?? {};
  }
  private segOf(
    d: Data,
    k: string,
    def: string,
    items: [string, string, (number | string | null)?][],
  ) {
    return seg(items, d.s.view[k] || def);
  }
  private when(d: Data, x: Date) {
    return `${this.X.dday(d, x)} ${hh(hourOf(x, d.tz))}`;
  }
  private m(d: Data, v: number | null | undefined, lock = false) {
    return this.X.money(d, v, lock);
  }
  private short(d: Data, v: number) {
    return d.a.salary ? d.fmt.short(v) : LOCK;
  }
  private mgrOpts(d: Data) {
    return uniq(d.emps.map((e) => e.mgr).filter((x): x is string => !!x)).map(
      (id) => [id, this.X.name(d, id)] as [string, string],
    );
  }

  // ===== 1 Overview =========================================================

  async vOverview(d: Data) {
    const X = this.X;
    const a = d.a;
    const f = this.F(d, 'ov');
    const all = X.staffV(d).filter(
      (e) =>
        (!f.type || e.type === f.type) &&
        (!f.st ||
          (f.st === 'On Leave' ? !!X.onLeave(d, e.id) : e.status === f.st)) &&
        (!f.mgr || e.mgr === f.mgr),
    );
    if (!d.emps.some((e) => e.status !== 'Exited'))
      return emptyRows(
        'No employees yet',
        'Employees come from the Staff module. Add staff there, or hire through Recruitment.',
        [
          btn('ext:staff', 'Open Staff', 'primary'),
          btn(
            'go:recruitment',
            'Open Recruitment',
            'ghost',
            !this.allowed(a, 'recruitment'),
          ),
        ],
      );
    const onL = all.filter((e) => X.onLeave(d, e.id));
    const openJ = d.jobs.filter((j) => OPEN_JOB.includes(j.status));
    const inProc = d.cands.filter((c) => !APP_CLOSED.includes(c.stage));
    const showPay = a.payroll || a.payApprove || a.salary || a.owner;
    const rd = showPay ? await X.readiness(d) : [];
    const blk = rd.filter((x) => x.st === 'Blocking');
    const cur = X.curRun(d);
    const in60 = (x: Date | null) => {
      const o = X.off(d, x);
      return o != null && o >= 0 && o <= 60;
    };
    const kpis = [
      K(
        'o:head',
        'Headcount',
        all.length,
        `Staff records in scope · ${d.s.branch ? X.brName(d, d.s.branch) : 'all branches'}`,
        null,
        '#12A150',
      ),
      K(
        'o:active',
        'Active Employees',
        all.filter((e) => ['Active', 'Probation'].includes(e.status)).length,
        `${all.filter((e) => e.status === 'Probation').length} on probation`,
        null,
        '#12A150',
      ),
      K(
        'o:leave',
        'On Leave',
        onL.length,
        'Today · approved leave',
        null,
        '#6941C6',
      ),
      K(
        'o:jobs',
        'Open Vacancies',
        openJ.length,
        `${openJ.reduce((s, j) => s + j.target, 0)} hires targeted`,
        null,
        '#2E90FA',
      ),
      K('o:apps', 'Applicants in Process', inProc.length, '', null, '#2E90FA'),
      K(
        'o:due',
        'Payroll Due',
        showPay ? X.dday(d, cur?.payDate ?? X.payDate(d, d.period)) : LOCK,
        showPay
          ? `${periodLabel(d.period)} · ${cur?.status ?? 'No run started'}`
          : 'Payroll access only',
        null,
        '#F79009',
      ),
      K(
        'o:exc',
        'Payroll Exceptions',
        showPay ? blk.reduce((s, x) => s + x.n, 0) : LOCK,
        showPay
          ? blk.length
            ? blk.map((x) => x.t).join(', ')
            : 'None blocking'
          : 'Payroll access only',
        blk.length ? '#B42318' : null,
        '#F04438',
      ),
      K(
        'o:ctr',
        'Contracts Expiring',
        all.filter(
          (e) =>
            in60(e.contractEnd) ||
            (e.status === 'Probation' && in60(e.probationEnd)),
        ).length,
        'Contract / probation end ≤ 60 days',
        null,
        '#F79009',
      ),
      K(
        'o:trn',
        'Training Overdue',
        d.tas.filter(
          (t) => X.taStatus(d, t) === 'Overdue' && X.inScope(d, t.userId),
        ).length,
        '',
        null,
        '#F04438',
      ),
    ];
    const al = await X.alerts(d);
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const [y, mo] = d.period.split('-').map(Number);
      const dt = new Date(Date.UTC(y, mo - 1 - i, 1));
      months.push(dt.toISOString().slice(0, 7));
    }
    const scoped = d.emps.filter((e) => X.inScope(d, e.id));
    const hc = months.map((ym) => {
      const end = monthBounds(ym).end;
      return scoped.filter(
        (e) => e.start < end && (!e.exitedAt || e.exitedAt >= end),
      ).length;
    });
    const mx = Math.max(1, ...hc);
    const mlab = months.map((ym) =>
      keyDate(`${ym}-01`).toLocaleDateString('en-GB', {
        month: 'short',
        timeZone: 'UTC',
      }),
    );
    const jl = [
      ...scoped
        .filter((e) => (X.off(d, e.start) ?? -999) >= -130 && e.startSet)
        .map((e) => ({
          id: e.id,
          e: `Joined · ${e.title}`,
          k: dayKey(e.start, d.tz),
          st: e.status,
        })),
      ...d.ofbs
        .filter((o) => X.inScope(d, o.userId, true))
        .map((o) => ({
          id: o.userId,
          e: o.exitType,
          k: dayKey(o.lastDay, 'UTC'),
          st: o.status === 'Completed' ? 'Exited' : 'Notice',
        })),
    ].sort((x, y) => (x.k < y.k ? 1 : -1));
    const lvRows = d.leaves
      .filter(
        (l) =>
          l.eKey >= d.today &&
          l.sKey <= addDays(d.today, 14) &&
          ['Approved', 'Submitted'].includes(l.status) &&
          X.inScope(d, l.uid),
      )
      .sort((x, y) => (x.sKey < y.sKey ? -1 : 1));
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'ov-f',
          filters: {
            search: null,
            sels: [
              sel2('type', 'Employment type', f.type, [
                ['', 'Any type'],
                'Full-time',
                'Part-time',
                'Contract',
                'Internship',
              ]),
              sel2('st', 'Status', f.st, [
                ['', 'Any status'],
                'Active',
                'Probation',
                'On Leave',
                'Notice',
              ]),
              sel2('mgr', 'Manager', f.mgr, [
                ['', 'Any manager'],
                ...this.mgrOpts(d),
              ]),
            ],
            nOn: nOn(f),
            count: `${all.length} people in scope`,
          },
        }),
      ]),
      R('minmax(0,1fr)', [
        card({
          id: 'ov-al',
          title: 'People alerts',
          sub: 'What needs a decision now',
          table: al.length
            ? {
                hasActs: true,
                cols: cols(['Severity', 'Issue', 'Person', 'Next action']),
                rows: al.map((x) =>
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
                      cell({ t: x.t, fw: 700, fg: '#101828', mw: '320px' }),
                      cell({
                        t: x.who
                          ? X.name(d, x.who)
                          : x.go === 'offers'
                            ? X.candName(
                                d,
                                d.offers.find((o) => o.id === x.ref)
                                  ?.candidateId,
                              )
                            : x.go === 'interviews'
                              ? X.candName(
                                  d,
                                  d.ints.find((i) => i.id === x.ref)
                                    ?.candidateId,
                                )
                              : '—',
                      }),
                      cell({ t: x.act, fg: '#0E8442', fw: 700 }),
                    ],
                    [x.act],
                    [x.t, x.who ? X.name(d, x.who) : '', []],
                  ),
                ),
              }
            : null,
          empty: al.length
            ? null
            : { t: 'Nothing needs attention', d: '', acts: [] },
        }),
      ]),
      R('minmax(0,1fr) minmax(0,1fr)', [
        card({
          title: 'Headcount trend',
          sub: 'Month-end headcount (Staff start and exit dates)',
          trend: {
            legend: [{ t: 'Headcount', c: '#12A150' }],
            note: '',
            aria: `Headcount by month: ${mlab.map((m, i) => `${m} ${hc[i]}`).join(', ')}`,
            cols: mlab.map((m, i) => ({
              l: m,
              tip: `${m}: ${hc[i]}`,
              bars: [{ h: `${Math.round((hc[i] / mx) * 100)}%`, c: '#12A150' }],
            })),
          },
        }),
        card({
          id: 'ov-hire',
          title: 'Hiring pipeline',
          bars: mkBars(
            STAGES.map(
              (st) =>
                [st, d.cands.filter((c) => c.stage === st).length] as [
                  string,
                  number,
                ],
            ),
            '#2E90FA',
          ),
          acts: [
            btn(
              'go:recruitment',
              'Open recruitment',
              'ghost',
              !this.allowed(a, 'recruitment'),
            ),
          ],
        }),
      ]),
      R('minmax(0,1fr) minmax(0,1fr)', [
        card({
          id: 'ov-rd',
          title: `Payroll readiness · ${periodLabel(d.period)}`,
          table: showPay
            ? {
                hasActs: false,
                cols: cols(['Input', 'State', 'Affected']),
                rows: rd.map((x) =>
                  row(
                    `${x.t}|${x.who.join(',')}`,
                    [
                      cell({ t: x.t, fw: 700 }),
                      stc(x.st),
                      cell({
                        t:
                          x.who
                            .filter((w) => w !== '—')
                            .map((s) => X.name(d, s))
                            .join(', ') || (x.st === 'Ready' ? '—' : x.note),
                      }),
                    ],
                    [],
                    [x.t, x.st, [chipOf(x.st)]],
                  ),
                ),
              }
            : null,
          empty: showPay
            ? null
            : {
                t: 'Payroll access only',
                d: 'Readiness is shown to payroll roles.',
                acts: [],
              },
          acts: [
            btn(
              'go:payroll',
              'Open payroll',
              'primary',
              !this.allowed(a, 'payroll'),
            ),
          ],
        }),
        card({
          id: 'ov-jl',
          title: 'Recent joiners & leavers',
          table: jl.length
            ? {
                hasActs: true,
                cols: cols(['Person', 'Event', 'Date', 'Status']),
                rows: jl.map((x) =>
                  row(
                    `${x.id}|${x.e}`,
                    [
                      cell({ t: X.name(d, x.id), fw: 700 }),
                      cell({ t: x.e }),
                      cell({ t: X.dday(d, x.k) }),
                      stc(x.st),
                    ],
                    ['Open employee'],
                    [X.name(d, x.id), x.e, [chipOf(x.st)]],
                  ),
                ),
              }
            : null,
          empty: jl.length
            ? null
            : {
                t: 'No joiners or leavers in the last 130 days',
                d: 'Joiners need a start date on their payroll profile.',
                acts: [],
              },
        }),
      ]),
      R('minmax(0,1fr)', [
        card({
          id: 'ov-lv',
          title: 'Leave snapshot · next 14 days',
          table: lvRows.length
            ? {
                hasActs: true,
                cols: cols(['Employee', 'Type', 'From', 'To', 'Status']),
                rows: lvRows.map((l) =>
                  row(
                    l.id,
                    [
                      cell({ t: X.name(d, l.uid), fw: 700 }),
                      cell({ t: X.ltName(d, l.type) }),
                      cell({ t: X.dday(d, l.sKey) }),
                      cell({ t: X.dday(d, l.eKey) }),
                      stc(l.status),
                    ],
                    ['Open'],
                    [X.name(d, l.uid), X.ltName(d, l.type), [chipOf(l.status)]],
                  ),
                ),
              }
            : null,
          empty: lvRows.length
            ? null
            : { t: 'No leave in the next 14 days', d: '', acts: [] },
        }),
      ]),
    ];
  }

  // ===== 2 Recruitment ======================================================

  candAge(d: Data, c: Data['cands'][number]) {
    return Math.max(0, -(this.X.off(d, c.appliedAt) ?? 0));
  }
  jobAge(d: Data, j: Data['jobs'][number]) {
    return Math.max(0, -(this.X.off(d, j.openedAt ?? j.createdAt) ?? 0));
  }

  vRecruitment(d: Data) {
    const X = this.X;
    const a = d.a;
    const J = d.jobs;
    const A = d.cands;
    const since90 = new Date(d.now.getTime() - 90 * 86400000);
    const hires = A.filter(
      (c) => c.stage === 'Hired' && (c.decidedAt ?? c.updatedAt) >= since90,
    );
    const acc = d.offers.filter((o) => o.status === 'Accepted').length;
    const dec = d.offers.filter((o) => o.status === 'Declined').length;
    const tth = hires.map((h) =>
      diffDays(
        dayKey(h.decidedAt ?? h.updatedAt, d.tz),
        dayKey(h.appliedAt, d.tz),
      ),
    );
    const kpis = [
      K(
        'r:jobs',
        'Open Jobs',
        J.filter((j) => OPEN_JOB.includes(j.status)).length,
        '',
        null,
        '#2E90FA',
      ),
      K(
        'r:apps',
        'Applicants',
        A.filter((c) => !APP_CLOSED.includes(c.stage)).length,
        `${A.length} all-time`,
        null,
        '#2E90FA',
      ),
      K(
        'r:int',
        'Interviews',
        d.ints.filter((i) => i.status === 'Scheduled' && i.startsAt >= d.now)
          .length,
        'Upcoming',
        null,
        '#6941C6',
      ),
      K(
        'r:off',
        'Offers',
        d.offers.filter((o) =>
          [
            'Draft',
            'Approval Required',
            'Approved',
            'Document Generated',
            'Signature Requested',
            'Sent',
            'Viewed',
            'Revised',
          ].includes(o.status),
        ).length,
        'Open offers',
        null,
        '#F79009',
      ),
      K('r:hire', 'Hires', hires.length, 'Last 90 days', null, '#12A150'),
      K(
        'r:tth',
        'Time to Hire',
        tth.length
          ? `${Math.round(tth.reduce((s, x) => s + x, 0) / tth.length)} days`
          : '—',
        'Applied → hired',
        null,
        '#98A2B3',
      ),
      K(
        'r:acc',
        'Offer Acceptance',
        acc + dec ? `${Math.round((acc / (acc + dec)) * 100)}%` : '—',
        `${acc} accepted · ${dec} declined`,
        null,
        '#12A150',
      ),
    ];
    if (!J.length)
      return [
        kpiRow(kpis),
        ...emptyRows('No vacancies yet', 'Create a vacancy to start hiring.', [
          btn('newjob', 'New vacancy', 'primary', !a.recruit),
        ]),
      ];
    const src: Record<string, [number, number]> = {};
    A.forEach((c) => {
      src[c.source] = src[c.source] ?? [0, 0];
      src[c.source][0]++;
      if (['Offer', 'Hired'].includes(c.stage)) src[c.source][1]++;
    });
    const up = d.ints
      .filter(
        (i) =>
          i.status === 'Scheduled' &&
          i.startsAt >= new Date(d.now.getTime() - 3600000),
      )
      .sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
    return [
      kpiRow(kpis),
      R('minmax(0,1fr) minmax(0,1fr)', [
        card({
          id: 'rc-fun',
          title: 'Hiring funnel',
          bars: mkBars(
            [
              ['Applied', A.length],
              [
                'Screening+',
                A.filter(
                  (c) =>
                    !['New', 'Withdrawn'].includes(c.stage) &&
                    !(c.stage === 'Rejected' && !this.reached(c, 'Screening')),
                ).length,
              ],
              [
                'Interview+',
                A.filter(
                  (c) =>
                    ['Interview', 'Final Interview', 'Offer', 'Hired'].includes(
                      c.stage,
                    ) || this.reached(c, 'Interview'),
                ).length,
              ],
              [
                'Offer+',
                A.filter(
                  (c) =>
                    ['Offer', 'Hired'].includes(c.stage) ||
                    this.reached(c, 'Offer'),
                ).length,
              ],
              ['Hired', A.filter((c) => c.stage === 'Hired').length],
            ],
            '#12A150',
          ),
        }),
        card({
          id: 'rc-src',
          title: 'Source effectiveness',
          sub: 'Applicants → reached offer',
          bars: Object.keys(src).length
            ? mkBars(
                Object.entries(src)
                  .sort((x, y) => y[1][0] - x[1][0])
                  .map(
                    ([k, v]) =>
                      [`${k} (${v[1]} offer+)`, v[0]] as [string, number],
                  ),
                '#2E90FA',
              )
            : null,
          empty: Object.keys(src).length
            ? null
            : { t: 'No applicants yet', d: '', acts: [] },
        }),
      ]),
      R('minmax(0,1fr)', [
        card({
          id: 'rc-job',
          title: 'Vacancies',
          acts: [btn('newjob', 'New vacancy', 'primary', !a.recruit)],
          table: {
            hasActs: true,
            cols: cols([
              'Job',
              'Candidates',
              'Furthest stage',
              ['Owner', '1'],
              'Days open',
              'Target',
              'Status',
              ['Location', '1'],
            ]),
            rows: J.map((j) => {
              const c = A.filter(
                (x) =>
                  x.jobId === j.id &&
                  !['Rejected', 'Withdrawn'].includes(x.stage),
              );
              const far =
                [...STAGES]
                  .reverse()
                  .find((st) => c.some((x) => x.stage === st)) ?? '—';
              const od = this.jobAge(d, j);
              const aging =
                od > j.targetDays &&
                !['Filled', 'Closed', 'Draft', 'Cancelled'].includes(j.status);
              return row(
                j.id,
                [
                  cell({
                    t: j.title,
                    fw: 800,
                    fg: '#101828',
                    s: `${j.number} · ${j.department}`,
                  }),
                  cell({ t: String(c.length) }),
                  cell({ t: far }),
                  cell({ t: X.name(d, j.managerUserId), opt: '1' }),
                  cell({
                    t: `${od} d`,
                    fg: aging ? '#B42318' : '#344054',
                    fw: aging ? 800 : 400,
                    s: aging ? `Beyond ${j.targetDays}-day target` : '',
                  }),
                  cell({ t: String(j.target) }),
                  stc(j.status),
                  cell({ t: X.brName(d, j.branchId), opt: '1' }),
                ],
                a.recruit
                  ? [
                      'Open job',
                      'View applicants',
                      'Add candidate',
                      'Schedule interview',
                      'Create offer',
                    ]
                  : ['Open job', 'View applicants'],
                [
                  j.title,
                  `${c.length} candidates · ${od}d open`,
                  [chipOf(j.status)],
                ],
              );
            }),
          },
        }),
        card({
          id: 'rc-int',
          title: 'Upcoming interviews',
          table: up.length
            ? {
                hasActs: true,
                cols: cols([
                  'When',
                  'Candidate',
                  'Job',
                  'Round',
                  'Interviewers',
                ]),
                rows: up.map((i) =>
                  row(
                    i.id,
                    [
                      cell({
                        t: this.when(d, i.startsAt),
                        fw: 800,
                        s: i.timezone,
                      }),
                      cell({ t: X.candName(d, i.candidateId) }),
                      cell({ t: X.job(d, i.jobId)?.title ?? '—' }),
                      cell({ t: i.round }),
                      cell({
                        t: X.ivs(i)
                          .map((v) => X.name(d, v))
                          .join(', '),
                      }),
                    ],
                    ['Open'],
                    [
                      X.candName(d, i.candidateId),
                      this.when(d, i.startsAt),
                      [],
                    ],
                  ),
                ),
              }
            : null,
          empty: up.length
            ? null
            : { t: 'No interviews scheduled', d: '', acts: [] },
          info: 'Noxtill has no AI hiring assistant here — nothing summarises candidates, infers protected characteristics or makes hiring decisions.',
        }),
      ]),
    ];
  }
  private reached(c: Data['cands'][number], st: string) {
    return this.X.candHist(c).some((h) => h.t.includes(`→ ${st}`));
  }

  // ===== 3 Jobs =============================================================

  jobActs(a: PpActor, j: Data['jobs'][number]) {
    const o = ['Open job', 'View applicants'];
    if (!a.recruit)
      return j.status === 'Awaiting Approval' && a.jobApprove
        ? [...o, 'Approve']
        : o;
    if (j.status === 'Draft') o.push('Edit', 'Submit for approval');
    if (j.status === 'Awaiting Approval') {
      o.push('Edit');
      if (a.jobApprove) o.push('Approve');
    }
    if (j.status === 'Open') o.push('Edit', 'Publish');
    if (OPEN_JOB.includes(j.status)) o.push('Pause', 'Close');
    if (j.status === 'Published') o.push('Unpublish');
    if (j.status === 'On Hold') o.push('Resume', 'Close');
    if (OPEN_JOB.includes(j.status) || j.status === 'On Hold')
      o.push('Mark filled');
    o.push('Duplicate');
    return o;
  }

  vJobs(d: Data) {
    const X = this.X;
    const a = d.a;
    const f = this.F(d, 'job');
    const q = (f.q ?? '').trim().toLowerCase();
    const all = d.jobs;
    const age = (j: Data['jobs'][number]) =>
      this.jobAge(d, j) > j.targetDays &&
      !['Filled', 'Closed', 'Draft', 'Cancelled'].includes(j.status);
    const L = all.filter(
      (j) =>
        (!q ||
          `${j.title}${j.number}${j.department}`.toLowerCase().includes(q)) &&
        (!f.st || j.status === f.st) &&
        (!f.dept || j.department === f.dept) &&
        (!f.age || age(j)),
    );
    const c = (st: string) => all.filter((j) => j.status === st).length;
    const comp = a.comp || a.salary;
    const kpis = [
      K('j:Open', 'Open', c('Open') + c('Published'), '', null, '#2E90FA'),
      K(
        'j:Draft',
        'Draft',
        c('Draft') + c('Awaiting Approval'),
        `${c('Awaiting Approval')} awaiting approval`,
        null,
        '#98A2B3',
      ),
      K('j:On Hold', 'On Hold', c('On Hold'), '', null, '#98A2B3'),
      K('j:Filled', 'Filled', c('Filled'), '', null, '#12A150'),
      K(
        'j:age',
        'Aging Beyond Target',
        all.filter(age).length,
        '',
        '#B42318',
        '#F04438',
      ),
    ];
    const pg = this.paged(d, L, 12);
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'job',
          acts: [btn('newjob', 'Create job', 'primary', !a.recruit)],
          filters: {
            search: 'Search job title, ID or department',
            q: f.q ?? '',
            sels: [
              sel2('st', 'Status', f.st, [
                ['', 'Any status'],
                'Draft',
                'Awaiting Approval',
                'Open',
                'Published',
                'On Hold',
                'Filled',
                'Closed',
                'Cancelled',
              ]),
              sel2('dept', 'Department', f.dept, [
                ['', 'Any department'],
                ...X.depts(d),
              ]),
              sel2('age', 'Aging', f.age, [
                ['', 'Any age'],
                ['1', 'Beyond target'],
              ]),
            ],
            nOn: nOn(f, ['q']),
            count: `${L.length} jobs`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Job',
                  'Department',
                  ['Location', '1'],
                  'Mode / type',
                  'Target',
                  'Hiring manager',
                  ['Compensation', '1'],
                  'Opened',
                  'Status',
                ]),
                rows: pg.rows.map((j) =>
                  row(
                    j.id,
                    [
                      cell({
                        t: j.title,
                        fw: 800,
                        fg: '#101828',
                        s: `${j.number}${j.budgetRef ? ` · ${j.budgetRef}` : ' · no budget ref'}`,
                      }),
                      cell({ t: j.department }),
                      cell({ t: X.brName(d, j.branchId), opt: '1' }),
                      cell({ t: j.workMode, s: j.employmentType }),
                      cell({ t: String(j.target) }),
                      cell({ t: X.name(d, j.managerUserId) }),
                      cell({
                        t: comp
                          ? j.compMin != null || j.compMax != null
                            ? `${this.m(d, num(j.compMin))} – ${this.m(d, num(j.compMax))}`
                            : 'Not set'
                          : '🔒 Restricted',
                        opt: '1',
                      }),
                      cell({
                        t: j.openedAt ? X.dday(d, j.openedAt) : 'Not opened',
                        s: j.openedAt ? `${this.jobAge(d, j)} d` : '',
                      }),
                      stc(j.status),
                    ],
                    this.jobActs(a, j),
                    [
                      j.title,
                      `${j.department} · ${j.status}`,
                      [chipOf(j.status)],
                    ],
                  ),
                ),
              }
            : null,
          pager: pg.pager,
          empty: L.length
            ? null
            : all.length
              ? {
                  t: 'No jobs match these filters',
                  d: '',
                  acts: [btn('clear:job', 'Clear filters', 'primary')],
                }
              : {
                  t: 'No vacancies yet',
                  d: 'Create a vacancy to start hiring.',
                  acts: [btn('newjob', 'Create job', 'primary', !a.recruit)],
                },
          info: 'Public postings never include budget refs, internal notes, approval comments or the compensation range unless you mark it public.',
        }),
      ]),
    ];
  }

  // ===== 4 Applicants =======================================================

  appActs(a: PpActor, c: Data['cands'][number], hasAcceptedOffer: boolean) {
    const o = ['Open'];
    if (!a.recruit && !a.interview) return o;
    if (a.recruit)
      (APP_T[c.stage] ?? [])
        .filter((s) => !['Rejected', 'Withdrawn', 'Hired'].includes(s))
        .forEach((s) => o.push(`Move to ${s}`));
    if (a.interview && !APP_CLOSED.includes(c.stage))
      o.push('Schedule interview');
    if (a.recruit) {
      if (['Interview', 'Final Interview', 'Offer'].includes(c.stage))
        o.push('Create offer');
      if (!APP_CLOSED.includes(c.stage))
        o.push('Send message', 'Request document', 'Reject', 'Mark withdrawn');
      if (c.stage === 'Offer' && hasAcceptedOffer)
        o.push('Hire / convert to Staff');
    }
    return o;
  }

  appFiltered(d: Data) {
    const a = d.a;
    const f = this.F(d, 'app');
    const q = (f.q ?? '').trim().toLowerCase();
    return d.cands.filter(
      (c) =>
        (!q ||
          `${c.name}${c.number}${a.pii ? c.email : ''}`
            .toLowerCase()
            .includes(q)) &&
        (!f.job || c.jobId === f.job) &&
        (!f.stage || c.stage === f.stage) &&
        (!f.src || c.source === f.src) &&
        (a.recruit ||
          this.X.job(d, c.jobId)?.managerUserId === a.userId ||
          d.ints.some(
            (i) => i.candidateId === c.id && this.X.ivs(i).includes(a.userId),
          )),
    );
  }

  vApplicants(d: Data) {
    const X = this.X;
    const a = d.a;
    const L = this.appFiltered(d);
    const f = this.F(d, 'app');
    const c = (st: string) => L.filter((x) => x.stage === st).length;
    const v = d.s.view.appView || 'table';
    const kpis = [
      K('a:New', 'New', c('New'), '', null, '#2E90FA'),
      K(
        'a:Screening',
        'Screening',
        c('Screening') + c('Shortlisted'),
        '',
        null,
        '#2E90FA',
      ),
      K(
        'a:Interview',
        'Interview',
        c('Interview') + c('Final Interview'),
        '',
        null,
        '#6941C6',
      ),
      K('a:Offer', 'Offer', c('Offer'), '', null, '#F79009'),
      K('a:Hired', 'Hired', c('Hired'), '', null, '#12A150'),
      K(
        'a:Rejected',
        'Rejected',
        c('Rejected') + c('Withdrawn'),
        '',
        null,
        '#98A2B3',
      ),
    ];
    const filt = {
      search: 'Search candidate name or ID',
      q: f.q ?? '',
      sels: [
        sel2('job', 'Job', f.job, [
          ['', 'Any job'],
          ...d.jobs.map((j) => [j.id, j.title] as [string, string]),
        ]),
        sel2('stage', 'Stage', f.stage, [
          ['', 'Any stage'],
          ...STAGES,
          'Rejected',
          'Withdrawn',
        ]),
        sel2('src', 'Source', f.src, [
          ['', 'Any source'],
          ...uniq([...SOURCES, ...d.cands.map((x) => x.source)]),
        ]),
      ],
      nOn: nOn(f, ['q']),
      count: `${L.length} candidates`,
    };
    const sg = this.segOf(d, 'appView', 'table', [
      ['board', 'Board'],
      ['table', 'Table'],
    ]);
    const acts = [btn('newcand', 'Add candidate', 'primary', !a.recruit)];
    const accepted = (id: string) =>
      d.offers.some((o) => o.candidateId === id && o.status === 'Accepted');
    if (!d.cands.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No applicants yet',
          'Add a candidate or publish a vacancy.',
          acts,
        ),
      ];
    if (v === 'board')
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'app-f',
            seg: sg,
            acts,
            filters: filt,
            info: 'Moving a card checks the allowed stage transition and your permission; every move is audited.',
          }),
        ]),
        R(
          'repeat(auto-fit,minmax(230px,1fr))',
          STAGES.map((st) => {
            const col = L.filter((x) => x.stage === st);
            return card({
              id: 'app-b',
              title: `${st} · ${col.length}`,
              table: col.length
                ? {
                    hasActs: true,
                    cols: cols(['Candidate']),
                    rows: col.map((x) =>
                      row(
                        x.id,
                        [
                          cell({
                            t: x.name,
                            fw: 700,
                            s: `${X.job(d, x.jobId)?.title ?? '—'} · ${x.source}`,
                          }),
                        ],
                        this.appActs(a, x, accepted(x.id)),
                        [x.name, X.job(d, x.jobId)?.title ?? '', []],
                      ),
                    ),
                  }
                : null,
              empty: col.length ? null : { t: 'Empty', d: '', acts: [] },
            });
          }),
        ),
      ];
    const pg = this.paged(
      d,
      [...L].sort((x, y) => y.appliedAt.getTime() - x.appliedAt.getTime()),
      10,
    );
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'app',
          seg: sg,
          acts,
          filters: filt,
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Candidate',
                  'Job',
                  'Stage',
                  'Source',
                  ['Owner', '1'],
                  'Applied',
                  ['Expected comp', '1'],
                  ['Availability', '1'],
                  'Consent',
                ]),
                rows: pg.rows.map((x) =>
                  row(
                    x.id,
                    [
                      cell({
                        t: x.name,
                        fw: 800,
                        fg: '#101828',
                        s: `${x.number}${a.pii ? ` · ${x.email}` : ''}`,
                      }),
                      cell({ t: X.job(d, x.jobId)?.title ?? '—' }),
                      stc(x.stage),
                      cell({
                        t: x.source,
                        s: x.referredBy ? `Referred by ${x.referredBy}` : '',
                      }),
                      cell({ t: X.name(d, x.ownerUserId), opt: '1' }),
                      cell({ t: X.dday(d, x.appliedAt) }),
                      cell({
                        t: a.comp
                          ? x.expectedComp != null
                            ? this.m(d, num(x.expectedComp))
                            : '—'
                          : LOCK,
                        opt: '1',
                      }),
                      cell({ t: x.availability || '—', opt: '1' }),
                      cell({
                        t: x.consent,
                        fg: x.consent === 'Given' ? '#0E8442' : '#B54708',
                      }),
                    ],
                    this.appActs(a, x, accepted(x.id)),
                    [x.name, X.job(d, x.jobId)?.title ?? '', [chipOf(x.stage)]],
                  ),
                ),
              }
            : null,
          pager: pg.pager,
          empty: L.length
            ? null
            : {
                t: 'No candidates match',
                d: '',
                acts: [btn('clear:app', 'Clear filters', 'primary')],
              },
        }),
      ]),
    ];
  }

  // ===== 5 Interviews =======================================================

  intActs(a: PpActor, i: Data['ints'][number]) {
    const o = ['Open'];
    if (!a.interview && !a.recruit) return o;
    if (i.status === 'Scheduled')
      o.push(
        'Reschedule',
        'Cancel',
        'Send candidate confirmation',
        'Mark completed',
        'Mark no-show',
      );
    if (i.status === 'Completed') o.push('Open scorecard');
    if (i.status === 'No-show') o.push('Reschedule');
    return o;
  }

  vInterviews(d: Data) {
    const X = this.X;
    const a = d.a;
    const all = d.ints.filter(
      (i) =>
        a.recruit ||
        a.owner ||
        X.ivs(i).includes(a.userId) ||
        X.job(d, i.jobId)?.managerUserId === a.userId,
    );
    const f = this.F(d, 'int');
    const L = all.filter(
      (i) =>
        (!f.st ||
          i.status === f.st ||
          (f.st === 'Feedback Overdue' && X.fbOver(d, i))) &&
        (!f.job || i.jobId === f.job),
    );
    const v = d.s.view.intView || 'list';
    const today = (i: Data['ints'][number]) =>
      dayKey(i.startsAt, d.tz) === d.today;
    const kpis = [
      K(
        'i:Scheduled',
        'Upcoming',
        all.filter((i) => i.status === 'Scheduled' && i.startsAt >= d.now)
          .length,
        '',
        null,
        '#2E90FA',
      ),
      K(
        'i:today',
        'Today',
        all.filter((i) => today(i) && i.status === 'Scheduled').length,
        '',
        null,
        '#12A150',
      ),
      K(
        'i:Completed',
        'Completed',
        all.filter((i) => i.status === 'Completed').length,
        '',
        null,
        '#12A150',
      ),
      K(
        'i:Feedback Overdue',
        'Feedback Overdue',
        all.filter((i) => X.fbOver(d, i)).length,
        '',
        null,
        '#F04438',
      ),
      K(
        'i:No-show',
        'No-show / Rescheduled',
        all.filter((i) => ['No-show', 'Rescheduled'].includes(i.status)).length,
        '',
        null,
        '#F79009',
      ),
    ];
    const sg = this.segOf(d, 'intView', 'list', [
      ['list', 'Interview list'],
      ['score', 'Scorecards & feedback'],
    ]);
    const hide = d.cfg.recruiting.hideFeedbackUntilSubmitted;
    if (v === 'score') {
      const rows = all.flatMap((i) =>
        X.ivs(i).map((iv) => {
          const sc = X.sc(i)[iv];
          const mine = iv === a.userId;
          const iSubmitted = !!X.sc(i)[a.userId];
          const hidden = hide && !mine && !a.recruit && !iSubmitted;
          return row(
            `${i.id}|${iv}`,
            [
              cell({ t: `${i.number} · ${i.round}`, fw: 700 }),
              cell({ t: X.candName(d, i.candidateId) }),
              cell({ t: X.name(d, iv) }),
              cell({
                t: hidden
                  ? 'Hidden until you submit yours'
                  : sc
                    ? `${sc.rec} · ${sc.r.join('/')}`
                    : '—',
              }),
              stc(
                sc
                  ? 'Submitted'
                  : X.fbOver(d, i)
                    ? 'Feedback Overdue'
                    : 'Pending',
              ),
            ],
            i.status === 'Completed' && (mine || a.owner)
              ? [sc ? 'Amend feedback' : 'Submit feedback', 'Open scorecard']
              : ['Open scorecard'],
            [i.number, X.name(d, iv), []],
          );
        }),
      );
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'int-sc',
            seg: sg,
            table: rows.length
              ? {
                  hasActs: true,
                  cols: cols([
                    'Interview',
                    'Candidate',
                    'Interviewer',
                    'Recommendation',
                    'Status',
                  ]),
                  rows,
                }
              : null,
            empty: rows.length
              ? null
              : { t: 'No interviews yet', d: '', acts: [] },
            info: 'Scorecards use only job-related competencies. Missing scores are never inferred. Submitted feedback is locked; amendments need a reason and create a new version.',
          }),
        ]),
      ];
    }
    const sorted = [...L].sort(
      (x, y) => y.startsAt.getTime() - x.startsAt.getTime(),
    );
    const pg = this.paged(d, sorted, 12);
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'int',
          seg: sg,
          acts: [btn('newint', 'Schedule interview', 'primary', !a.interview)],
          filters: {
            search: null,
            sels: [
              sel2('st', 'Status', f.st, [
                ['', 'Any status'],
                'Scheduled',
                'Completed',
                'Feedback Overdue',
                'No-show',
                'Rescheduled',
                'Cancelled',
              ]),
              sel2('job', 'Job', f.job, [
                ['', 'Any job'],
                ...d.jobs.map((j) => [j.id, j.title] as [string, string]),
              ]),
            ],
            nOn: nOn(f),
            count: `${L.length} interviews`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'When',
                  'Candidate',
                  'Job',
                  'Round',
                  'Location',
                  'Interviewers',
                  'Feedback due',
                  'Status',
                ]),
                rows: pg.rows.map((i) =>
                  row(
                    i.id,
                    [
                      cell({
                        t: this.when(d, i.startsAt),
                        fw: 800,
                        s: `${i.timezone} · ${i.durationMin} min`,
                      }),
                      cell({ t: X.candName(d, i.candidateId) }),
                      cell({ t: X.job(d, i.jobId)?.title ?? '—' }),
                      cell({ t: i.round }),
                      cell({ t: i.location }),
                      cell({
                        t: X.ivs(i)
                          .map(
                            (v2) => X.name(d, v2) + (X.sc(i)[v2] ? ' ✓' : ''),
                          )
                          .join(', '),
                      }),
                      cell({
                        t: i.feedbackDue ? X.dday(d, i.feedbackDue) : '—',
                        fg: X.fbOver(d, i) ? '#B42318' : '#344054',
                      }),
                      stc(X.fbOver(d, i) ? 'Feedback Overdue' : i.status),
                    ],
                    this.intActs(a, i),
                    [
                      `${X.candName(d, i.candidateId)} · ${i.round}`,
                      this.when(d, i.startsAt),
                      [chipOf(i.status)],
                    ],
                  ),
                ),
              }
            : null,
          pager: pg.pager,
          empty: L.length
            ? null
            : { t: 'No interviews match', d: '', acts: [] },
        }),
      ]),
    ];
  }

  // ===== 6 Offers ===========================================================

  offActs(a: PpActor, o: Data['offers'][number]) {
    const r = ['Open'];
    if (!a.recruit)
      return o.status === 'Approval Required' && a.offerApprove
        ? [...r, 'Approve', 'Reject approval']
        : r;
    if (['Draft', 'Revised'].includes(o.status))
      r.push('Edit', 'Submit approval');
    if (o.status === 'Approval Required' && a.offerApprove)
      r.push('Approve', 'Reject approval');
    if (o.status === 'Approved') r.push('Generate document');
    if (o.status === 'Document Generated') r.push('Send for signature');
    if (['Sent', 'Viewed', 'Signature Requested'].includes(o.status))
      r.push('Refresh eSign status', 'Mark declined', 'Withdraw');
    if (
      [
        'Approved',
        'Document Generated',
        'Sent',
        'Viewed',
        'Declined',
        'Expired',
      ].includes(o.status)
    )
      r.push('Revise');
    if (o.status === 'Accepted')
      r.push('Open signed document', 'Start onboarding');
    return r;
  }

  vOffers(d: Data) {
    const X = this.X;
    const a = d.a;
    const all = d.offers.filter(
      (o) =>
        a.recruit ||
        a.offerApprove ||
        X.job(d, o.jobId)?.managerUserId === a.userId,
    );
    const f = this.F(d, 'off');
    const L = all.filter(
      (o) =>
        !f.st ||
        o.status === f.st ||
        (f.st === 'Sent' &&
          ['Sent', 'Viewed', 'Signature Requested'].includes(o.status)),
    );
    const c = (st: string) => all.filter((o) => o.status === st).length;
    const exp = (o: Data['offers'][number]) => X.off(d, o.expiresOn) ?? 99;
    const comp = a.comp || a.salary;
    const kpis = [
      K('f:Draft', 'Draft', c('Draft') + c('Revised'), '', null, '#98A2B3'),
      K(
        'f:Approval Required',
        'Awaiting Approval',
        c('Approval Required'),
        '',
        null,
        '#F79009',
      ),
      K(
        'f:Sent',
        'Sent',
        c('Sent') + c('Signature Requested') + c('Viewed'),
        '',
        null,
        '#2E90FA',
      ),
      K('f:Accepted', 'Accepted', c('Accepted'), '', null, '#12A150'),
      K('f:Declined', 'Declined', c('Declined'), '', null, '#F04438'),
      K(
        'f:exp',
        'Expiring',
        all.filter((o) => ['Sent', 'Viewed'].includes(o.status) && exp(o) <= 7)
          .length,
        'Within 7 days',
        null,
        '#F79009',
      ),
    ];
    const pg = this.paged(d, [...L].reverse(), 12);
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'off',
          acts: [btn('newoffer', 'Create offer', 'primary', !a.recruit)],
          filters: {
            search: null,
            sels: [
              sel2('st', 'Status', f.st, [
                ['', 'Any status'],
                'Draft',
                'Approval Required',
                'Approved',
                'Document Generated',
                'Sent',
                'Accepted',
                'Declined',
                'Expired',
                'Withdrawn',
                'Revised',
              ]),
            ],
            nOn: nOn(f),
            count: `${L.length} offers`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Offer',
                  'Candidate',
                  'Job',
                  'Start',
                  'Compensation',
                  'Version',
                  'Approval',
                  'eSign',
                  'Expiry',
                  'Status',
                ]),
                rows: pg.rows.map((o) =>
                  row(
                    o.id,
                    [
                      cell({ t: o.number, fw: 800 }),
                      cell({ t: X.candName(d, o.candidateId) }),
                      cell({
                        t: X.job(d, o.jobId)?.title ?? '—',
                        s: `${X.brName(d, o.branchId)} · ${o.employmentType}`,
                      }),
                      cell({ t: X.dday(d, dayKey(o.startDate, 'UTC')) }),
                      cell({
                        t: comp
                          ? `${this.m(d, num(o.comp))} / ${o.frequency === 'Hourly' ? 'hr' : 'mo'}`
                          : LOCK,
                        s:
                          o.approvedComp != null &&
                          num(o.approvedComp) !== num(o.comp)
                            ? '⚠ changed after approval'
                            : '',
                      }),
                      cell({ t: `v${o.version}` }),
                      cell({
                        t:
                          o.approvedComp != null
                            ? `Approved${comp ? ` ${this.m(d, num(o.approvedComp))}` : ''}`
                            : o.status === 'Approval Required'
                              ? `Pending (${d.cfg.recruiting.offerApproverUserId ? X.name(d, d.cfg.recruiting.offerApproverUserId) : 'Owner'})`
                              : 'Not approved',
                      }),
                      cell({
                        t: o.signRequestId
                          ? 'Noxtill eSign (Contracts)'
                          : o.docId
                            ? 'Document ready'
                            : '—',
                      }),
                      cell({
                        t: X.dday(d, dayKey(o.expiresOn, 'UTC')),
                        fg:
                          exp(o) <= 3 && ['Sent', 'Viewed'].includes(o.status)
                            ? '#B42318'
                            : '#344054',
                      }),
                      stc(o.status),
                    ],
                    this.offActs(a, o),
                    [
                      `${X.candName(d, o.candidateId)} · ${o.number}`,
                      X.job(d, o.jobId)?.title ?? '',
                      [chipOf(o.status)],
                    ],
                  ),
                ),
              }
            : null,
          pager: pg.pager,
          empty: L.length
            ? null
            : {
                t: all.length ? 'No offers match' : 'No offers yet',
                d: '',
                acts: [],
              },
          info: 'No offer is sent before approval. Changing compensation after approval resets it to Approval Required and creates a new version. Accepted ≠ onboarded.',
        }),
      ]),
    ];
  }

  // ===== 7 Onboarding =======================================================

  onbPct(o: Data['onbs'][number]) {
    const it = this.X.onbItems(o);
    return Math.round(
      (it.filter((i) => i.done).length / Math.max(1, it.length)) * 100,
    );
  }
  onbLate(d: Data, o: Data['onbs'][number]) {
    const sk = dayKey(o.startDate, 'UTC');
    return this.X.onbItems(o).filter(
      (i) => !i.done && diffDays(addDays(sk, i.off), d.today) < 0,
    );
  }
  onbWho(d: Data, o: Data['onbs'][number]) {
    return o.userId
      ? this.X.name(d, o.userId)
      : `${this.X.candName(d, o.candidateId)} (candidate)`;
  }

  vOnboarding(d: Data) {
    const a = d.a;
    const X = this.X;
    const all = d.onbs.filter(
      (o) =>
        a.onboard ||
        a.recruit ||
        (o.userId && X.inScope(d, o.userId, true)) ||
        o.managerUserId === a.userId ||
        o.buddyUserId === a.userId,
    );
    const sk = (o: Data['onbs'][number]) => X.off(d, o.startDate) ?? 0;
    const kpis = [
      K(
        'n:soon',
        'Starting Soon',
        all.filter((o) => sk(o) > 0 && sk(o) <= 30).length,
        'Next 30 days',
        null,
        '#2E90FA',
      ),
      K(
        'n:prog',
        'In Progress',
        all.filter((o) => o.status === 'In Progress').length,
        '',
        null,
        '#F79009',
      ),
      K(
        'n:late',
        'Overdue Tasks',
        all.reduce((s, o) => s + this.onbLate(d, o).length, 0),
        '',
        null,
        '#F04438',
      ),
      K(
        'n:docs',
        'Documents Pending',
        all.reduce(
          (s, o) =>
            s + X.onbItems(o).filter((i) => i.kind === 'doc' && !i.done).length,
          0,
        ),
        '',
        null,
        '#F79009',
      ),
      K(
        'n:acc',
        'Access Pending',
        all.reduce(
          (s, o) =>
            s +
            X.onbItems(o).filter((i) => i.kind === 'access' && !i.done).length,
          0,
        ),
        'Staff login active',
        null,
        '#F79009',
      ),
      K(
        'n:done',
        'Completed',
        all.filter((o) => o.status === 'Completed').length,
        '',
        null,
        '#12A150',
      ),
    ];
    if (!all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No onboarding cases',
          'Cases start when a candidate is hired from an accepted offer.',
          [],
        ),
      ];
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'onb',
          table: {
            hasActs: true,
            cols: cols([
              'Person',
              'Start',
              'Template',
              'Manager',
              'Buddy',
              'Progress',
              'Blockers',
              'Payroll ready',
              'Status',
            ]),
            rows: all.map((o) => {
              const b = this.onbLate(d, o);
              const pr = X.onbItems(o).find((i) => i.kind === 'payroll');
              return row(
                o.id,
                [
                  cell({ t: this.onbWho(d, o), fw: 800, s: o.number }),
                  cell({ t: X.dday(d, dayKey(o.startDate, 'UTC')) }),
                  cell({ t: o.template }),
                  cell({ t: X.name(d, o.managerUserId) }),
                  cell({ t: X.name(d, o.buddyUserId) }),
                  cell({ t: `${this.onbPct(o)}%`, fw: 700 }),
                  cell({
                    t: b.length ? `${b.length} overdue` : '—',
                    fg: b.length ? '#B42318' : '#344054',
                  }),
                  cell({
                    t: pr?.done ? 'Yes' : 'No',
                    fg: pr?.done ? '#0E8442' : '#B54708',
                  }),
                  stc(o.status),
                ],
                a.onboard && o.status !== 'Completed'
                  ? [
                      'Open',
                      ...(o.status === 'Not Started'
                        ? ['Start onboarding']
                        : []),
                      'Create linked tasks',
                      'Request documents',
                      'Assign training',
                    ]
                  : ['Open'],
                [
                  this.onbWho(d, o),
                  `${this.onbPct(o)}% · starts ${X.dday(d, dayKey(o.startDate, 'UTC'))}`,
                  [chipOf(o.status)],
                ],
              );
            }),
          },
          info: 'Tasks are created in Projects & Tasks and linked here; files live in Contracts; access is the hired person’s Staff login — no passwords are stored here.',
        }),
      ]),
    ];
  }

  // ===== 8 Leave ============================================================

  lvActs(a: PpActor, l: Data['leaves'][number], today: string) {
    const o: string[] = [];
    if (l.status === 'Submitted' && a.leaveApprove && l.uid !== a.userId)
      o.push('Approve', 'Reject');
    if (
      ['Submitted', 'Approved'].includes(l.status) &&
      l.sKey > today &&
      (l.uid === a.userId || a.leaveApprove)
    )
      o.push('Cancel request');
    o.push('Open schedule impact');
    return o;
  }

  async vLeave(d: Data) {
    const X = this.X;
    const a = d.a;
    const v = d.s.view.lvView || 'req';
    const f = this.F(d, 'lv');
    const all = d.leaves.filter((l) => X.inScope(d, l.uid));
    const L = all
      .filter(
        (l) => (!f.st || l.status === f.st) && (!f.type || l.type === f.type),
      )
      .sort((x, y) => (x.sKey < y.sKey ? 1 : -1));
    const types = d.cfg.leave.types;
    const balTypes = types.filter((t) => t.entitlement != null);
    const reasonOk = a.leaveReason;
    const lowT = balTypes[0];
    const kpis = [
      K(
        'l:today',
        'On Leave Today',
        all.filter(
          (l) =>
            l.status === 'Approved' && l.sKey <= d.today && l.eKey >= d.today,
        ).length,
        '',
        null,
        '#6941C6',
      ),
      K(
        'l:Submitted',
        'Pending Requests',
        all.filter((l) => l.status === 'Submitted').length,
        '',
        null,
        '#F79009',
      ),
      K(
        'l:up',
        'Upcoming Leave',
        all.filter((l) => l.status === 'Approved' && l.sKey > d.today).length,
        '',
        null,
        '#2E90FA',
      ),
      K(
        'l:low',
        'Low Balances',
        lowT
          ? X.staffV(d).filter((e) => (X.bal(d, e.id, lowT.key) ?? 99) <= 3)
              .length
          : '—',
        lowT ? `${lowT.name} ≤ 3 days` : 'No leave types configured',
        null,
        '#F79009',
      ),
      K(
        'l:unpl',
        'Unplanned Absence',
        all.filter((l) => l.emerg).length,
        'Emergency / same-day',
        null,
        '#F04438',
      ),
    ];
    const sg = this.segOf(d, 'lvView', 'req', [
      ['req', a.scope === 'self' ? 'My requests' : 'Team requests', all.length],
      ['bal', 'Balances'],
      ['cal', 'Team calendar'],
      ['types', 'Leave types'],
    ]);
    const acts = [
      btn('newleave', 'Request leave', 'primary', !d.me),
      btn('emerg', 'Record emergency absence', 'ghost', !a.leaveApprove),
    ];
    const noTypes = btn(
      'set:leave',
      'Set up leave types',
      'primary',
      !(a.settings || a.owner),
    );
    if (v === 'bal') {
      if (!balTypes.length)
        return [
          kpiRow(kpis),
          R('minmax(0,1fr)', [
            card({
              id: 'lv-b',
              seg: sg,
              acts,
              empty: {
                t: 'No leave types with an entitlement',
                d: 'Balances need leave types and yearly entitlements — configure them in People settings. Nothing is assumed.',
                acts: [noTypes],
              },
            }),
          ]),
        ];
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'lv-b',
            seg: sg,
            acts,
            table: {
              hasActs: true,
              cols: cols([
                'Employee',
                ...balTypes.map((t) => t.name),
                'Pending',
                'Department',
              ]),
              rows: X.staffV(d).map((e) => {
                const p = all
                  .filter((l) => l.uid === e.id && l.status === 'Submitted')
                  .reduce((s, l) => s + l.days, 0);
                return row(
                  e.id,
                  [
                    cell({ t: e.name, fw: 700 }),
                    ...balTypes.map((t) => {
                      const b = X.bal(d, e.id, t.key) ?? 0;
                      return cell({
                        t: `${b} d`,
                        fg: b <= 0 ? '#B42318' : b <= 3 ? '#B54708' : '#344054',
                        fw: 700,
                      });
                    }),
                    cell({ t: p ? `${p} d` : '—' }),
                    cell({ t: e.dept || '—' }),
                  ],
                  ['Open employee'],
                  [
                    e.name,
                    `${balTypes[0].name} ${X.bal(d, e.id, balTypes[0].key)} d`,
                    [],
                  ],
                );
              }),
            },
            info: `Balances = yearly entitlement − approved leave this leave year (from ${X.dday(d, X.leaveYear(d).start)}). Negative balances are blocked unless the leave type allows it.`,
          }),
        ]),
      ];
    }
    if (v === 'types')
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'lv-t',
            seg: sg,
            acts: [
              btn(
                'set:leave',
                'Edit leave types',
                'primary',
                !(a.settings || a.owner),
              ),
            ],
            table: types.length
              ? {
                  hasActs: false,
                  cols: cols([
                    'Leave type',
                    'Entitlement / year',
                    'Paid',
                    'Reason privacy',
                    'Negative balance',
                  ]),
                  rows: types.map((t) =>
                    row(
                      t.key,
                      [
                        cell({ t: t.name, fw: 700 }),
                        cell({
                          t:
                            t.entitlement != null
                              ? `${t.entitlement} days`
                              : 'No balance (unlimited)',
                        }),
                        cell({ t: t.paid ? 'Yes' : 'No — reduces payroll' }),
                        cell({
                          t: t.sensitive
                            ? 'Sensitive — HR only'
                            : 'Manager + HR',
                        }),
                        cell({ t: t.allowNegative ? 'Allowed' : 'Blocked' }),
                      ],
                      [],
                      [t.name, '', []],
                    ),
                  ),
                }
              : null,
            empty: types.length
              ? null
              : {
                  t: 'No leave types configured',
                  d: 'Leave types, entitlements and paid/unpaid rules are set by your business — nothing is built in.',
                  acts: [noTypes],
                },
          }),
        ]),
      ];
    if (v === 'cal') {
      const wd = (new Date(`${d.today}T12:00:00Z`).getUTCDay() + 6) % 7;
      const days: unknown[] = [];
      for (let i = 0; i < 21; i++) {
        const k = addDays(d.today, i - wd);
        const items = all
          .filter(
            (l) =>
              ['Approved', 'Submitted'].includes(l.status) &&
              k >= l.sKey &&
              k <= l.eKey,
          )
          .map((l) => ({
            id: l.id,
            t: `${X.name(d, l.uid).split(' ')[0]} · ${l.status === 'Submitted' ? 'pending' : X.ltName(d, l.type).split(' ')[0].toLowerCase()}`,
            bg: l.status === 'Submitted' ? '#FEF6E7' : '#F4F3FF',
            fg: l.status === 'Submitted' ? '#B54708' : '#6941C6',
          }));
        days.push({
          d: X.dday(d, k),
          bd: k === d.today ? '#12A150' : '#E6EAF0',
          bg: k < d.today ? '#FAFBFC' : '#fff',
          fw: k === d.today ? 800 : 600,
          fg: k === d.today ? '#0E8442' : '#475467',
          items,
        });
      }
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'lv-cal',
            seg: sg,
            acts,
            cal: {
              aria: 'Team leave calendar',
              head: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              days,
            },
          }),
        ]),
      ];
    }
    const pg = this.paged(d, L, 12);
    const rows: unknown[] = [];
    for (const l of pg.rows) {
      const t = X.lt(d, l.type);
      const b = X.bal(d, l.uid, l.type);
      const cov =
        ['Submitted', 'Approved'].includes(l.status) && l.eKey >= d.today
          ? await X.coverage(d, l)
          : [];
      const e = X.emp(d, l.uid);
      rows.push(
        row(
          l.id,
          [
            cell({ t: X.name(d, l.uid), fw: 700, s: l.number }),
            cell({ t: X.ltName(d, l.type), s: l.emerg ? 'Emergency' : '' }),
            cell({
              t:
                X.dday(d, l.sKey) +
                (l.eKey !== l.sKey ? ` → ${X.dday(d, l.eKey)}` : '') +
                (l.partial ? ' (½)' : ''),
            }),
            cell({ t: String(l.days) }),
            cell({
              t:
                b == null
                  ? '—'
                  : `${l.status === 'Submitted' ? b - l.days : b} d`,
              fg:
                b != null && b - l.days < 0 && l.status === 'Submitted'
                  ? '#B42318'
                  : '#344054',
            }),
            cell({
              t:
                reasonOk || l.uid === a.userId || !t?.sensitive
                  ? l.reason || '—'
                  : '🔒 Sensitive — HR only',
              mw: '180px',
            }),
            cell({
              t:
                l.eKey < d.today ||
                !['Submitted', 'Approved'].includes(l.status)
                  ? '—'
                  : cov.length
                    ? `⚠ ${cov.join('; ')}`
                    : 'OK',
              fg: cov.length ? '#B54708' : '#0E8442',
            }),
            cell({
              t: l.apr
                ? X.name(d, l.apr)
                : e?.mgr
                  ? `${X.name(d, e.mgr)} (pending)`
                  : 'Leave approver (pending)',
            }),
            stc(l.status),
          ],
          this.lvActs(a, l, d.today),
          [
            `${X.name(d, l.uid)} · ${X.ltName(d, l.type)}`,
            `${X.dday(d, l.sKey)} · ${l.days} d`,
            [chipOf(l.status)],
          ],
        ),
      );
    }
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'lv',
          seg: sg,
          acts,
          filters: {
            search: null,
            sels: [
              sel2('st', 'Status', f.st, [
                ['', 'Any status'],
                'Submitted',
                'Approved',
                'Rejected',
                'Cancelled',
              ]),
              sel2('type', 'Leave type', f.type, [
                ['', 'Any type'],
                ...types.map((t) => [t.key, t.name] as [string, string]),
              ]),
            ],
            nOn: nOn(f),
            count: `${L.length} requests`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Employee',
                  'Type',
                  'Dates',
                  'Days',
                  'Balance after',
                  'Reason',
                  'Coverage',
                  'Approver',
                  'Status',
                ]),
                rows,
              }
            : null,
          pager: pg.pager,
          empty: L.length
            ? null
            : {
                t: 'No leave requests',
                d: types.length
                  ? ''
                  : 'Set up leave types first so requests can be checked against balances.',
                acts: [
                  types.length
                    ? btn('newleave', 'Request leave', 'primary', !d.me)
                    : noTypes,
                ],
              },
          info: 'Approved leave is the same Staff time-off record Staff schedules, Field Service and Helpdesk already read.',
        }),
      ]),
    ];
  }

  // ===== 9 Payroll overview =================================================

  async vPayroll(d: Data) {
    const X = this.X;
    const a = d.a;
    const f = this.F(d, 'pr');
    const q = (f.q ?? '').trim().toLowerCase();
    const sal = a.salary;
    const inp = await X.inputs(d, d.period);
    if (
      !inp.size &&
      !d.emps.some((e) => e.status !== 'Exited' && e.role !== 'owner')
    )
      return emptyRows(
        'Payroll not configured',
        'Add staff in Staff, then give each a payroll profile (pay basis, rate, bank and tax status).',
        [btn('ext:staff', 'Open Staff', 'primary')],
      );
    const rd = await X.readiness(d);
    const table = X.taxTable(d);
    const calcs = [...inp.entries()].map(([uid, i]) => ({
      uid,
      i,
      c: X.calc(d, i, table),
    }));
    const tot = (k: keyof Calc) =>
      calcs.reduce((s, x) => s + (Number(x.c[k]) || 0), 0);
    const blk = rd.filter((x) => x.st === 'Blocking');
    const cur = X.curRun(d);
    const kpis = [
      K(
        'p:emp',
        'Employees in Payroll',
        inp.size,
        `${d.cfg.payroll.payGroup} · monthly`,
        null,
        '#12A150',
      ),
      K(
        'p:gross',
        'Gross Estimate',
        this.short(d, tot('gross')),
        'Preview — not a run',
        null,
        '#12A150',
      ),
      K(
        'p:comm',
        'Commission Input',
        this.short(d, tot('comm')),
        'From Staff',
        null,
        '#2E90FA',
      ),
      K(
        'p:adv',
        'Advances Input',
        this.short(d, tot('adv')),
        'Recovery from Staff advances',
        null,
        '#F79009',
      ),
      K(
        'p:ded',
        'Deductions',
        this.short(d, tot('pre') + tot('post')),
        'Benefit rules + Staff deductions',
        null,
        '#98A2B3',
      ),
      K(
        'p:er',
        'Employer Cost Estimate',
        this.short(d, tot('cost')),
        'Gross + employer contributions',
        null,
        '#6941C6',
      ),
      K(
        'p:exc',
        'Exceptions',
        rd
          .filter((x) => ['Blocking', 'Warning'].includes(x.st))
          .reduce((s, x) => s + x.n, 0),
        `${blk.length} blocking`,
        blk.length ? '#B42318' : null,
        '#F04438',
      ),
      K(
        'p:next',
        'Next Pay Date',
        X.dday(d, X.payDate(d, d.period)),
        `${periodLabel(d.period)} · ${cur ? `run ${cur.status}` : 'no run yet'}`,
        null,
        '#F79009',
      ),
    ];
    const exc = (uid: string) =>
      rd.filter((x) => x.who.includes(uid) && x.st !== 'Ready').map((x) => x.t);
    const rows = calcs
      .filter((x) => !q || X.name(d, x.uid).toLowerCase().includes(q))
      .filter((x) => !f.exc || exc(x.uid).length);
    const pg = this.paged(d, rows, 15);
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'pr-rd',
          title: 'Readiness checklist',
          sub: 'Inputs are snapshotted when the run locks. Corrections before approval allow a controlled recalculation.',
          acts: [
            btn(
              'startpay',
              cur
                ? `Open ${periodLabel(d.period)} run`
                : `Start ${periodLabel(d.period)} run`,
              'primary',
              !a.payroll && !cur,
            ),
            btn('export:readiness', 'Export readiness', 'ghost', !a.export),
          ],
          table: {
            hasActs: true,
            cols: cols(['Input', 'State', 'Count', 'Affected', 'Source']),
            rows: rd.map((x) =>
              row(
                `${x.t}|${x.who.join(',')}`,
                [
                  cell({ t: x.t, fw: 700 }),
                  stc(x.st),
                  cell({ t: String(x.n) }),
                  cell({
                    t:
                      x.who.map((s) => X.name(d, s)).join(', ') ||
                      (x.st === 'Ready' ? '—' : x.note) ||
                      '—',
                    s: x.who.length ? x.note : '',
                  }),
                  cell({ t: x.src }),
                ],
                ['Blocking', 'Warning'].includes(x.st) && a.payroll
                  ? ['Resolve input']
                  : [],
                [x.t, x.st, [chipOf(x.st)]],
              ),
            ),
          },
        }),
      ]),
      R('minmax(0,1fr)', [
        card({
          id: 'pr-emp',
          title: 'Employee readiness',
          filters: {
            search: 'Search employee',
            q: f.q ?? '',
            sels: [
              sel2('exc', 'Exceptions', f.exc, [
                ['', 'All employees'],
                ['1', 'Only with exceptions'],
              ]),
            ],
            nOn: nOn(f, ['q']),
            count: `${rows.length} employees`,
          },
          table: rows.length
            ? {
                hasActs: true,
                cols: cols([
                  'Employee',
                  'Pay basis',
                  'Pay rate',
                  'Hours / OT',
                  'Commission',
                  'Tips',
                  'Advances',
                  'Leave impact',
                  'Tax profile',
                  'Bank / payout',
                  'Exceptions',
                ]),
                rows: pg.rows.map(({ uid, i, c }) => {
                  const x = exc(uid);
                  const e = X.emp(d, uid);
                  return row(
                    uid,
                    [
                      cell({ t: X.name(d, uid), fw: 700, s: e?.dept || '' }),
                      cell({
                        t: i.basis ?? '✕ Not set',
                        fg: i.basis ? '#344054' : '#B42318',
                      }),
                      cell({
                        t:
                          i.basis === 'Commission only'
                            ? '—'
                            : sal
                              ? i.rate
                                ? `${this.m(d, i.rate)}${i.basis === 'Hourly' ? '/h' : ''}`
                                : '✕ Missing'
                              : LOCK,
                        fg:
                          !i.rate && i.basis !== 'Commission only'
                            ? '#B42318'
                            : '#344054',
                      }),
                      cell({
                        t: `${i.basis === 'Hourly' ? `${i.hours} h` : i.hours ? `${i.hours} h` : '—'} / ${i.ot} h`,
                        s:
                          i.tsNeeded && !i.tsOk ? 'Timesheet not approved' : '',
                      }),
                      cell({
                        t: sal ? this.m(d, i.comm) : LOCK,
                        s: i.commPaidOutside ? 'Paid in Staff' : '',
                      }),
                      cell({ t: 'Not tracked', fg: '#98A2B3' }),
                      cell({
                        t: sal ? this.m(d, c.adv) : LOCK,
                        s: i.advances.length
                          ? `${i.advances.length} outstanding`
                          : '',
                      }),
                      cell({ t: i.unpaid ? `${i.unpaid} unpaid d` : '—' }),
                      cell({
                        t:
                          a.salary || a.payroll
                            ? (i.taxp ?? '✕ Missing')
                            : LOCK,
                        fg: i.taxp ? '#344054' : '#B42318',
                      }),
                      cell({
                        t: a.payroll ? (i.bank ?? '✕ Missing') : LOCK,
                        fg: i.bank ? '#344054' : '#B42318',
                      }),
                      cell({
                        t: x.join(', ') || '—',
                        fg: x.length ? '#B42318' : '#0E8442',
                        fw: 700,
                      }),
                    ],
                    a.payroll
                      ? [
                          'Open calculation preview',
                          'Edit payroll profile',
                          'Open Staff timesheet',
                          'Open Staff commission',
                          'Open Staff advance',
                          ...(x.length ? ['Resolve input'] : []),
                        ]
                      : ['Open calculation preview'],
                    [X.name(d, uid), x.join(', ') || 'Ready', []],
                  );
                }),
              }
            : null,
          pager: pg.pager,
          empty: rows.length
            ? null
            : {
                t: inp.size ? 'No employees match' : 'Nobody is in payroll yet',
                d: inp.size
                  ? ''
                  : 'Give staff a payroll profile with “In payroll” on.',
                acts: [],
              },
          info: 'Every figure is calculated from Staff timesheets, commissions, advances, approved leave and your configured rules and tax table. Nothing is estimated or filled in.',
        }),
      ]),
    ];
  }

  // ===== 10 Payroll runs ====================================================

  runRow(d: Data, r: Data['runs'][number]) {
    return r;
  }

  vRuns(d: Data) {
    const X = this.X;
    const a = d.a;
    const all = d.runs;
    const sal = a.salary;
    const r =
      all.find((x) => x.number === d.s.run || x.id === d.s.run) ??
      X.curRun(d) ??
      all[all.length - 1];
    const kpis = [
      K(
        'u:Draft',
        'Draft Runs',
        all.filter((x) =>
          ['Draft', 'Inputs Locked', 'Calculated', 'Exceptions'].includes(
            x.status,
          ),
        ).length,
        '',
        null,
        '#98A2B3',
      ),
      K(
        'u:Approval Required',
        'Awaiting Approval',
        all.filter((x) => x.status === 'Approval Required').length,
        '',
        null,
        '#F79009',
      ),
      K(
        'u:Finalized',
        'Finalized',
        all.filter((x) =>
          [
            'Finalized',
            'Finance Posting Pending',
            'Finance Posted',
            'Payout Submitted',
          ].includes(x.status),
        ).length,
        'Not yet paid',
        null,
        '#6941C6',
      ),
      K(
        'u:Paid',
        'Paid',
        all.filter((x) => x.status === 'Paid').length,
        'Bank-confirmed',
        null,
        '#12A150',
      ),
      K(
        'u:exc',
        'Exceptions',
        all.reduce((s, x) => s + X.runExc(x).filter((e) => !e.ok).length, 0),
        '',
        null,
        '#F04438',
      ),
    ];
    if (!all.length || !r)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No payroll runs yet',
          'Start a run once readiness is green.',
          [btn('newrun', 'Start payroll', 'primary', !a.payroll)],
        ),
      ];
    const list = card({
      id: 'runs',

      table: {
        hasActs: true,
        cols: cols([
          'Run',
          'Period',
          'Pay date',
          'Employees',
          'Gross',
          'Taxes',
          'Net',
          'Employer cost',
          'Status',
          'Finance posting',
          'Payout',
        ]),
        rows: [...all].reverse().map((x) => {
          const t = X.runTot(x.lines);
          const ps = X.payoutSt(x);
          return row(
            x.id,
            [
              cell({
                t: x.number,
                fw: 800,
                fg: x.id === r.id ? '#0E8442' : '#101828',
                s: x.correctionOf
                  ? `Correction of ${all.find((y) => y.id === x.correctionOf)?.number ?? '—'}`
                  : `${d.cfg.payroll.payGroup} · ${d.biz.name}`,
              }),
              cell({ t: periodLabel(x.period) }),
              cell({ t: X.dday(d, dayKey(x.payDate, 'UTC')) }),
              cell({ t: String(t.n || '—') }),
              cell({ t: t.n ? this.m(d, t.gross, !sal) : '—' }),
              cell({ t: t.n ? this.m(d, t.tax, !sal) : '—' }),
              cell({ t: t.n ? this.m(d, t.net, !sal) : '—', fw: 700 }),
              cell({ t: t.n ? this.m(d, t.cost, !sal) : '—' }),
              stc(x.status),
              cell({
                t:
                  x.journalRef ??
                  (x.status === 'Finance Posting Pending' ? 'Pending' : '—'),
              }),
              stc(ps === '—' ? 'Pending' : ps),
            ],
            ['Open run'],
            [
              `${x.number} · ${periodLabel(x.period)}`,
              x.status,
              [chipOf(x.status)],
            ],
          );
        }),
      },
    });
    const tab = d.s.view.runTab || 'sum';
    const t = X.runTot(r.lines);
    const next = RUN_NEXT[r.status];
    const exc = X.runExc(r);
    const head = card({
      id: 'run-h',
      title: `${r.number} · ${periodLabel(r.period)}`,
      sub: `${r.status} · pay date ${X.dday(d, dayKey(r.payDate, 'UTC'))}${next ? ` · Next: ${next[1]}` : ''}`,
      acts: [
        ...(next && this.runCan(a, next[0])
          ? [btn(`run:${next[0]}:${r.id}`, next[1], 'primary')]
          : next
            ? [
                btn(
                  `run:${next[0]}:${r.id}`,
                  next[1],
                  'primary',
                  true,
                  'Another role does this step (separation of duties)',
                ),
              ]
            : []),
        ...([
          'Calculated',
          'Exceptions',
          'Approval Required',
          'Approved',
        ].includes(r.status) && a.payroll
          ? [btn(`run:recalc:${r.id}`, 'Recalculate')]
          : []),
        ...(['Draft', 'Inputs Locked', 'Calculated', 'Exceptions'].includes(
          r.status,
        ) && a.payroll
          ? [btn(`run:rollback:${r.id}`, 'Rollback draft')]
          : []),
        ...(r.status === 'Draft' && a.payroll
          ? [btn(`run:cancel:${r.id}`, 'Cancel run', 'danger')]
          : []),
        ...(r.status === 'Approval Required' && a.payApprove
          ? [btn(`run:reject:${r.id}`, 'Reject', 'danger')]
          : []),
        ...(['Partially Paid', 'Payout Failed'].includes(r.status) && a.payout
          ? [btn(`run:retry:${r.id}`, 'Retry failed payouts', 'primary')]
          : []),
        ...(r.batchRef && a.payout
          ? [btn(`run:file:${r.id}`, 'Download bank file')]
          : []),
        btn('export:run', 'Export', 'ghost', !a.export),
      ],
      seg: this.segOf(d, 'runTab', 'sum', [
        ['sum', 'Summary'],
        ['emp', 'Employee calculations', r.lines.length],
        ['exc', 'Exceptions', exc.filter((e) => !e.ok).length],
        ['apr', 'Approval'],
        ['fin', 'Finance posting'],
        ['pay', 'Payout'],
        ['audit', 'Audit'],
      ]),
    });
    let body;
    const snap = r.snapshot as unknown as {
      hash: string;
      at: string;
      engine: string;
      tax: string;
    } | null;
    if (tab === 'emp')
      body = card({
        id: 'run-e',
        table: r.lines.length
          ? {
              hasActs: true,
              cols: cols([
                'Employee',
                'Regular',
                'Overtime',
                'Commission',
                'Tips',
                'Leave impact',
                'Pre-tax',
                'Tax',
                'Post-tax',
                'Advances',
                'Employer',
                'Gross',
                'Net',
                'Version',
              ]),
              rows: r.lines.map((l) => {
                const c = l.calc as unknown as Calc;
                const mm = (v: number | null) => this.m(d, v, !sal);
                return row(
                  `${r.id}|${l.userId}`,
                  [
                    cell({
                      t: X.name(d, l.userId),
                      fw: 700,
                      s: c.warn.join(' · '),
                    }),
                    cell({ t: mm(c.regular) }),
                    cell({ t: mm(c.ot) }),
                    cell({ t: mm(c.comm) }),
                    cell({ t: 'Not tracked', fg: '#98A2B3' }),
                    cell({ t: c.leaveImp ? mm(c.leaveImp) : '—' }),
                    cell({ t: mm(c.pre) }),
                    cell({
                      t: c.tax == null ? '✕ Missing' : mm(c.tax),
                      fg: c.tax == null ? '#B42318' : '#344054',
                    }),
                    cell({ t: mm(c.post) }),
                    cell({ t: mm(c.adv) }),
                    cell({ t: mm(c.er) }),
                    cell({ t: mm(c.gross), fw: 700 }),
                    cell({ t: c.net == null ? '—' : mm(c.net), fw: 800 }),
                    cell({ t: c.ver.split(' ')[1] ?? c.ver, s: c.taxVer }),
                  ],
                  ['Open calculation'],
                  [
                    X.name(d, l.userId),
                    `Net ${c.net == null ? '—' : mm(c.net)}`,
                    [],
                  ],
                );
              }),
            }
          : null,
        empty: r.lines.length
          ? null
          : {
              t: 'Not calculated yet',
              d: 'Lock inputs and calculate to see each employee.',
              acts: [],
            },
      });
    else if (tab === 'exc')
      body = card({
        id: 'run-x',
        table: exc.length
          ? {
              hasActs: true,
              cols: cols(['Employee', 'Exception', 'Severity', 'State']),
              rows: exc.map((x, i) =>
                row(
                  `${r.id}|${i}`,
                  [
                    cell({ t: X.name(d, x.uid), fw: 700 }),
                    cell({ t: x.msg }),
                    stc(x.sev),
                    stc(x.ok ? 'Ready' : x.sev),
                  ],
                  x.ok ||
                    !a.payroll ||
                    !['Exceptions', 'Calculated', 'Inputs Locked'].includes(
                      r.status,
                    )
                    ? []
                    : [
                        'Resolve input',
                        ...(x.sev === 'Blocking'
                          ? ['Exclude from run']
                          : ['Accept warning']),
                      ],
                  [X.name(d, x.uid), x.msg, []],
                ),
              ),
            }
          : null,
        empty: exc.length ? null : { t: 'No exceptions', d: '', acts: [] },
      });
    else if (tab === 'apr')
      body = card({
        id: 'run-a',
        title: 'Approval & separation of duties',
        fields: [
          fRead('Prepared / calculated by', X.name(d, r.preparedById)),
          fRead(
            'Approver',
            r.approvedById
              ? X.name(d, r.approvedById)
              : `Pending${d.cfg.payroll.separationOfDuties ? ` — must differ from preparer (${X.name(d, r.preparedById)})` : ''}`,
          ),
          fRead(
            'Rule',
            d.cfg.payroll.separationOfDuties
              ? 'Payroll prepares · a payroll approver approves and finalizes · Owner override is audited'
              : 'Separation of duties is off in People settings — the preparer may approve',
          ),
          fRead(
            'Snapshot',
            snap
              ? `${snap.hash} · locked ${d.fmt.dtm(new Date(snap.at))} · ${snap.engine} · ${snap.tax}`
              : 'Not locked',
          ),
        ],
      });
    else if (tab === 'fin')
      body = card({
        id: 'run-f',
        title: 'Finance posting (Finance & Accounting owns the journal)',
        fields: [
          fRead(
            'State',
            r.journalRef
              ? `Finance Posted · journal ${r.journalRef}`
              : r.status === 'Finance Posting Pending'
                ? 'Pending — waiting for the Finance ledger sweep'
                : 'Not requested',
          ),
          fRead(
            'Accounts',
            '6200 Salaries & Wages · 2450 Income Tax Payable · 2400 Payroll Liabilities · 1999 Suspense (advance recoveries) · payout from your configured cash/bank account',
          ),
          fRead(
            'Totals',
            sal && t.n
              ? `Gross ${this.m(d, t.gross)} · tax ${this.m(d, t.tax)} · employer ${this.m(d, t.er)} · net ${this.m(d, t.net)}`
              : t.n
                ? LOCK
                : '—',
          ),
        ],
      });
    else if (tab === 'pay')
      body = card({
        id: 'run-p',
        title:
          'Payout (bank transfer file · confirmed against your bank statement)',
        sub: 'Paid only after you record the bank’s confirmation for each transfer. Noxtill has no payroll payout provider connected.',
        table: r.batchRef
          ? {
              hasActs: false,
              cols: cols([
                'Employee',
                'Destination',
                'Net',
                'Bank reference',
                'State',
              ]),
              rows: r.lines.map((l) =>
                row(
                  l.id,
                  [
                    cell({ t: X.name(d, l.userId), fw: 700 }),
                    cell({
                      t: a.payroll
                        ? X.emp(d, l.userId)?.bankMask
                          ? `${X.emp(d, l.userId)?.bankName ?? ''} ${X.emp(d, l.userId)?.bankMask}`
                          : '—'
                        : LOCK,
                    }),
                    cell({
                      t: this.m(d, l.net == null ? null : num(l.net), !sal),
                    }),
                    cell({ t: l.payoutRef ?? '—' }),
                    stc(l.payout === 'Processing' ? 'Processing' : l.payout),
                  ],
                  [],
                  [X.name(d, l.userId), l.payout, []],
                ),
              ),
            }
          : null,
        empty: r.batchRef
          ? null
          : {
              t: 'No payout batch yet',
              d: 'A payout batch is created after finance posting.',
              acts: [],
            },
      });
    else if (tab === 'audit')
      body = card({
        id: 'run-au',
        table: {
          hasActs: false,
          cols: cols(['When', 'Event', 'By']),
          rows: [...X.runHist(r)]
            .reverse()
            .map((h, i) =>
              row(
                `h${i}`,
                [
                  cell({ t: d.fmt.dtm(new Date(h.at)) }),
                  cell({ t: h.t, fw: 700 }),
                  cell({ t: h.by }),
                ],
                [],
                [h.t, h.by, []],
              ),
            ),
        },
      });
    else
      body = card({
        id: 'run-s',
        title: 'Summary',
        fields: [
          fRead(
            'Scope',
            `${d.biz.name} · all branches · ${d.cfg.payroll.payGroup} · ${d.fmt.base}`,
          ),
          fRead('Employees', String(t.n || '—')),
          fRead('Gross', t.n ? this.m(d, t.gross, !sal) : '—'),
          fRead(
            'Deductions (benefit rules, Staff deductions, advances)',
            t.n ? this.m(d, t.ded, !sal) : '—',
          ),
          fRead('Taxes withheld', t.n ? this.m(d, t.tax, !sal) : '—'),
          fRead('Employer cost', t.n ? this.m(d, t.cost, !sal) : '—'),
          fRead('Net pay', t.n ? this.m(d, t.net, !sal) : '—'),
          fRead(
            'Status meaning',
            (
              {
                Approved: 'Approved ≠ paid.',
                Finalized: 'Finalized ≠ paid — locked, payslips generated.',
                'Finance Posted': 'Posted to the ledger — not paid yet.',
                'Payout Submitted':
                  'Bank file created — not paid until the bank confirms.',
                'Partially Paid': 'Some transfers confirmed; others failed.',
                Paid: 'Bank confirmed every transfer.',
              } as Record<string, string>
            )[r.status] ?? r.status,
          ),
        ],
      });
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [list]),
      R('minmax(0,1fr)', [head]),
      R('minmax(0,1fr)', [body]),
    ];
  }

  // ===== 11 Payslips ========================================================

  slips(d: Data) {
    return d.runs
      .filter((r) => RUN_FINAL.includes(r.status))
      .flatMap((r) =>
        r.lines
          .filter((l) => l.slipStatus)
          .map((l) => ({ id: `${r.id}|${l.userId}`, run: r, l })),
      );
  }

  vPayslips(d: Data) {
    const X = this.X;
    const a = d.a;
    const f = this.F(d, 'ps');
    const q = (f.q ?? '').trim().toLowerCase();
    const full = a.salary || a.payroll;
    const all = this.slips(d).filter((x) => full || x.l.userId === a.userId);
    if (!full && !all.length && a.scope !== 'self')
      return emptyRows(
        'Payslips are restricted',
        'Managers and HR don’t get automatic salary or payslip access. Payroll roles and Owners manage payslips; employees see only their own.',
        [],
      );
    const L = all.filter(
      (x) =>
        (!q || X.name(d, x.l.userId).toLowerCase().includes(q)) &&
        (!f.run || x.run.id === f.run) &&
        (!f.st || x.l.slipStatus === f.st),
    );
    const kpis = [
      K(
        's:Generated',
        'Generated',
        all.length,
        'From finalized runs',
        null,
        '#2E90FA',
      ),
      K(
        's:Delivered',
        'Delivered',
        all.filter((x) => x.l.slipStatus === 'Delivered').length,
        'In-app to the employee',
        null,
        '#12A150',
      ),
      K(
        's:viewed',
        'Viewed',
        all.filter((x) => x.l.slipViewedAt).length,
        'Opened in Noxtill',
        null,
        '#6941C6',
      ),
      K(
        's:Delivery Failed',
        'Delivery Failed',
        all.filter((x) => x.l.slipStatus === 'Delivery Failed').length,
        '',
        null,
        '#F04438',
      ),
    ];
    const pg = this.paged(d, [...L].reverse(), 15);
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'ps',
          acts: full
            ? [
                btn(
                  'deliverall',
                  'Deliver all generated',
                  'primary',
                  !a.payroll,
                ),
              ]
            : [],
          filters: {
            search: full ? 'Search employee' : null,
            q: f.q ?? '',
            sels: [
              sel2('run', 'Payroll run', f.run, [
                ['', 'Any run'],
                ...uniq(all.map((x) => x.run.id)).map((id) => {
                  const r = d.runs.find((y) => y.id === id)!;
                  return [id, `${r.number} · ${periodLabel(r.period)}`] as [
                    string,
                    string,
                  ];
                }),
              ]),
              sel2('st', 'Delivery', f.st, [
                ['', 'Any state'],
                'Generated',
                'Delivered',
                'Delivery Failed',
              ]),
            ],
            nOn: nOn(f, ['q']),
            count: `${L.length} payslips`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Employee',
                  'Run',
                  'Period',
                  'Pay date',
                  'Gross',
                  'Deductions',
                  'Taxes',
                  'Net',
                  'Document',
                  'Delivery',
                  'Viewed',
                ]),
                rows: pg.rows.map((x) => {
                  const c = x.l.calc as unknown as Calc;
                  return row(
                    x.id,
                    [
                      cell({ t: X.name(d, x.l.userId), fw: 700 }),
                      cell({ t: x.run.number }),
                      cell({ t: periodLabel(x.run.period) }),
                      cell({ t: X.dday(d, dayKey(x.run.payDate, 'UTC')) }),
                      cell({ t: this.m(d, c.gross) }),
                      cell({ t: this.m(d, c.pre + c.post + c.adv) }),
                      cell({ t: this.m(d, c.tax) }),
                      cell({ t: this.m(d, c.net), fw: 800 }),
                      cell({
                        t: `PS-${x.run.number.replace(/^PR-/, '')}-${X.name(d, x.l.userId).split(' ')[0].toUpperCase()}`,
                      }),
                      stc(x.l.slipStatus!),
                      cell({
                        t: x.l.slipViewedAt ? d.fmt.dtm(x.l.slipViewedAt) : '—',
                      }),
                    ],
                    [
                      'Preview',
                      'Download',
                      ...(a.payroll
                        ? [
                            x.l.slipStatus === 'Delivery Failed'
                              ? 'Retry delivery'
                              : x.l.slipStatus === 'Delivered'
                                ? 'Resend'
                                : 'Deliver securely',
                          ]
                        : []),
                    ],
                    [
                      `${X.name(d, x.l.userId)} · ${periodLabel(x.run.period)}`,
                      `Net ${this.m(d, c.net)}`,
                      [chipOf(x.l.slipStatus!)],
                    ],
                  );
                }),
              }
            : null,
          pager: pg.pager,
          empty: L.length
            ? null
            : {
                t: all.length ? 'No payslips match' : 'No payslips yet',
                d: 'Payslips are generated automatically when a run is finalized.',
                acts: [],
              },
          info: 'Every value comes from the finalized run calculation — payslips can’t be typed in by hand.',
        }),
      ]),
    ];
  }

  // ===== 12 Benefits ========================================================

  ruleVal(d: Data, method: string, v: number | null) {
    return v == null
      ? '—'
      : method.startsWith('Percentage')
        ? `${v}%`
        : this.m(d, v);
  }

  vBenefits(d: Data) {
    const X = this.X;
    const a = d.a;
    const v = d.s.view.benView || 'rules';
    const R2 = d.rules;
    const in60 = (k: string | null) =>
      k != null && diffDays(k, d.today) >= 0 && diffDays(k, d.today) <= 60;
    const kpis = [
      K(
        'b:act',
        'Active Rules',
        R2.filter((r) => r.status === 'Active').length,
        '',
        null,
        '#12A150',
      ),
      K(
        'b:cov',
        'Employees Covered',
        new Set(
          R2.filter((r) => r.status === 'Active').flatMap((r) => r.assigned),
        ).size,
        '',
        null,
        '#2E90FA',
      ),
      K(
        'b:up',
        'Upcoming Changes',
        R2.reduce(
          (s, r) => s + r.versions.filter((x) => x.from > d.today).length,
          0,
        ),
        'Effective-dated',
        null,
        '#F79009',
      ),
      K(
        'b:exp',
        'Expiring Benefits',
        R2.filter((r) => r.versions.some((x) => in60(x.to))).length,
        'Within 60 days',
        null,
        '#98A2B3',
      ),
    ];
    const sg = this.segOf(d, 'benView', 'rules', [
      ['rules', 'Rule library', R2.length],
      ['assign', 'Assignments'],
      ['hist', 'History'],
    ]);
    const acts = [btn('newrule', 'Create rule', 'primary', !a.benefits)];
    const table = X.taxTable(d);
    if (v === 'assign')
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'ben-a',
            seg: sg,
            acts,
            table: R2.length
              ? {
                  hasActs: true,
                  cols: cols(['Employee', ...R2.map((r) => r.name)]),
                  rows: X.staffV(d).map((e) =>
                    row(
                      e.id,
                      [
                        cell({ t: e.name, fw: 700 }),
                        ...R2.map((r) =>
                          cell({
                            t: r.assigned.includes(e.id)
                              ? r.status === 'Scheduled'
                                ? `◷ from ${X.dday(d, r.versions[0]?.from)}`
                                : '✓'
                              : '—',
                            fg: r.assigned.includes(e.id)
                              ? '#0E8442'
                              : '#98A2B3',
                          }),
                        ),
                      ],
                      a.benefits
                        ? R2.filter((r) => r.status !== 'Inactive').map(
                            (r) =>
                              `${r.assigned.includes(e.id) ? 'Remove' : 'Assign'} ${r.name}`,
                          )
                        : [],
                      [e.name, '', []],
                    ),
                  ),
                }
              : null,
            empty: R2.length
              ? null
              : {
                  t: 'No rules yet',
                  d: 'Create a benefit or deduction rule first.',
                  acts,
                },
          }),
        ]),
      ];
    if (v === 'hist') {
      const rows = R2.flatMap((r) =>
        r.versions.map((h, i) =>
          row(
            `${r.id}|${i}`,
            [
              cell({ t: r.name, fw: 700 }),
              cell({ t: `v${h.ver}` }),
              cell({
                t: X.dday(d, h.from) + (h.to ? ` → ${X.dday(d, h.to)}` : ''),
              }),
              cell({ t: this.ruleVal(d, r.method, h.ee) }),
              cell({ t: this.ruleVal(d, r.method, h.er) }),
              cell({ t: X.name(d, h.by), s: h.why }),
            ],
            [],
            [`${r.name} v${h.ver}`, '', []],
          ),
        ),
      );
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'ben-h',
            seg: sg,
            acts,
            table: rows.length
              ? {
                  hasActs: false,
                  cols: cols([
                    'Rule',
                    'Version',
                    'Effective',
                    'Employee share',
                    'Employer share',
                    'Changed by',
                  ]),
                  rows,
                }
              : null,
            empty: rows.length
              ? null
              : { t: 'No history yet', d: '', acts: [] },
            info: 'Historical payroll keeps the rule version it used; future changes never alter finalized runs.',
          }),
        ]),
      ];
    }
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'ben',
          seg: sg,
          acts,
          table: R2.length
            ? {
                hasActs: true,
                cols: cols([
                  'Rule',
                  'Type',
                  'Classification',
                  'Tax treatment',
                  'Method',
                  'Employee',
                  'Employer',
                  'Effective',
                  'Finance account',
                  'Status',
                ]),
                rows: R2.map((r) => {
                  const cur =
                    X.ruleVer(r.versions, d.today) ??
                    r.versions[r.versions.length - 1];
                  return row(
                    r.id,
                    [
                      cell({
                        t: r.name,
                        fw: 800,
                        s: `${r.number} · v${cur?.ver ?? 1}`,
                      }),
                      cell({ t: r.type }),
                      cell({ t: r.cls }),
                      cell({ t: r.pp }),
                      cell({ t: r.method }),
                      cell({ t: this.ruleVal(d, r.method, cur?.ee ?? null) }),
                      cell({ t: this.ruleVal(d, r.method, cur?.er ?? null) }),
                      cell({
                        t: cur
                          ? X.dday(d, cur.from) +
                            (cur.to ? ` → ${X.dday(d, cur.to)}` : '')
                          : '—',
                      }),
                      cell({ t: r.fin ? `${r.fin} (Finance)` : '—' }),
                      stc(r.status),
                    ],
                    a.benefits && r.status !== 'Inactive'
                      ? [
                          'Open',
                          'Schedule change',
                          'Bulk assign',
                          'Deactivate future',
                        ]
                      : ['Open'],
                    [r.name, r.method, [chipOf(r.status)]],
                  );
                }),
              }
            : null,
          empty: R2.length
            ? null
            : {
                t: 'No benefit or deduction rules',
                d: 'Nothing statutory is built in — add the contributions, benefits and deductions your business actually runs.',
                acts,
              },
          info: table
            ? `Income tax comes from the configured tax table (${table.key} v${table.version}), not a hard-coded rule.`
            : 'No tax table configured — income tax can’t be calculated until one is added in People settings.',
        }),
      ]),
    ];
  }

  // ===== 13 Performance =====================================================

  perfActs(a: PpActor, r: Data['reviews'][number]) {
    const o = ['Open'];
    if (
      r.userId === a.userId &&
      ['Not Started', 'Self Review'].includes(r.status)
    )
      o.push('Submit self review');
    if (r.status === 'Not Started' && a.perf) o.push('Request self review');
    if (
      r.status === 'Manager Review' &&
      (r.reviewerUserId === a.userId || a.owner)
    )
      o.push('Submit manager review');
    if (r.status === 'Completed' && r.userId === a.userId && !r.acknowledged)
      o.push('Acknowledge');
    if (a.perf) o.push('Create development task');
    return o;
  }

  vPerformance(d: Data) {
    const X = this.X;
    const a = d.a;
    const v = d.s.view.perfView || 'reviews';
    const all = d.reviews.filter(
      (r) => X.inScope(d, r.userId) || r.reviewerUserId === a.userId,
    );
    const open = d.cycles.find((c) => c.status === 'Active');
    const kpis = [
      K(
        'v:due',
        'Reviews Due',
        all.filter((r) => r.status !== 'Completed').length,
        open
          ? `${open.name} closes ${X.dday(d, dayKey(open.endOn, 'UTC'))}`
          : 'No active cycle',
        null,
        '#F79009',
      ),
      K(
        'v:prog',
        'In Progress',
        all.filter((r) => ['Self Review', 'Manager Review'].includes(r.status))
          .length,
        '',
        null,
        '#2E90FA',
      ),
      K(
        'v:done',
        'Completed',
        all.filter((r) => r.status === 'Completed').length,
        '',
        null,
        '#12A150',
      ),
      K(
        'v:goal',
        'Goals Behind',
        all.reduce((s, r) => s + X.goals(r).filter((g) => g.p < 50).length, 0),
        'Under 50% progress',
        null,
        '#F04438',
      ),
      K(
        'v:oo',
        'Not Started',
        all.filter((r) => r.status === 'Not Started').length,
        '',
        null,
        '#98A2B3',
      ),
    ];
    const sg = this.segOf(d, 'perfView', 'reviews', [
      ['reviews', 'Reviews', all.length],
      ['goals', 'Goals'],
      ['cycles', 'Cycles'],
    ]);
    if (v === 'goals') {
      const rows = all.flatMap((r) =>
        X.goals(r).map((g, i) =>
          row(
            `${r.id}|${i}`,
            [
              cell({ t: X.name(d, r.userId), fw: 700 }),
              cell({ t: g.t }),
              cell({ t: `${g.w}%` }),
              cell({
                t: `${g.p}%`,
                fg: g.p < 50 ? '#B42318' : '#0E8442',
                fw: 700,
              }),
            ],
            a.perf || r.userId === a.userId ? ['Update progress'] : [],
            [g.t, `${g.p}%`, []],
          ),
        ),
      );
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'pf-g',
            seg: sg,
            acts: [btn('newgoal', 'Add goal', 'primary', !a.perf)],
            table: rows.length
              ? {
                  hasActs: true,
                  cols: cols(['Employee', 'Goal', 'Weight', 'Progress']),
                  rows,
                }
              : null,
            empty: rows.length
              ? null
              : {
                  t: 'No goals yet',
                  d: 'Goals are added to a review.',
                  acts: [],
                },
          }),
        ]),
      ];
    }
    if (v === 'cycles')
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'pf-c',
            seg: sg,
            acts: [btn('newcycle', 'Create cycle', 'primary', !a.perf)],
            table: d.cycles.length
              ? {
                  hasActs: true,
                  cols: cols([
                    'Cycle',
                    'Start',
                    'End',
                    'Rating scale',
                    'Reviews',
                    'Status',
                  ]),
                  rows: d.cycles.map((c) =>
                    row(
                      c.id,
                      [
                        cell({ t: c.name, fw: 700, s: c.number }),
                        cell({ t: X.dday(d, dayKey(c.startOn, 'UTC')) }),
                        cell({ t: X.dday(d, dayKey(c.endOn, 'UTC')) }),
                        cell({ t: `${c.scale}-point` }),
                        cell({
                          t: String(
                            d.reviews.filter((r) => r.cycleId === c.id).length,
                          ),
                        }),
                        stc(
                          c.status === 'Active'
                            ? 'In Progress'
                            : c.status === 'Closed'
                              ? 'Closed'
                              : 'Planned',
                        ),
                      ],
                      a.perf
                        ? [
                            ...(c.status !== 'Closed'
                              ? ['Add reviews', 'Close cycle']
                              : []),
                          ]
                        : [],
                      [c.name, c.status, []],
                    ),
                  ),
                }
              : null,
            empty: d.cycles.length
              ? null
              : {
                  t: 'No review cycles',
                  d: 'Create a cycle, then add reviews for the people in it.',
                  acts: [],
                },
          }),
        ]),
      ];
    const cycName = (id: string) =>
      d.cycles.find((c) => c.id === id)?.name ?? '—';
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'pf',
          seg: sg,
          table: all.length
            ? {
                hasActs: true,
                cols: cols([
                  'Employee',
                  'Cycle',
                  'Reviewer',
                  'Goals',
                  'Self review',
                  'Manager review',
                  'Rating',
                  'Acknowledged',
                  'Status',
                ]),
                rows: all.map((r) => {
                  const priv =
                    a.perfPrivate ||
                    r.reviewerUserId === a.userId ||
                    r.userId === a.userId;
                  const G = X.goals(r);
                  return row(
                    r.id,
                    [
                      cell({ t: X.name(d, r.userId), fw: 700 }),
                      cell({ t: cycName(r.cycleId) }),
                      cell({ t: X.name(d, r.reviewerUserId) }),
                      cell({
                        t: G.length
                          ? `${Math.round(G.reduce((s, g) => s + (g.p * g.w) / 100, 0))}% weighted`
                          : 'No goals',
                      }),
                      cell({ t: r.selfText ? '✓ Submitted' : '—' }),
                      cell({
                        t: priv
                          ? r.managerText
                            ? '✓ Submitted'
                            : '—'
                          : '🔒 Private',
                      }),
                      cell({ t: priv ? (r.rating ?? '—') : LOCK }),
                      cell({ t: r.acknowledged ? 'Yes' : 'No' }),
                      stc(r.status),
                    ],
                    this.perfActs(a, r),
                    [X.name(d, r.userId), r.status, [chipOf(r.status)]],
                  );
                }),
              }
            : null,
          empty: all.length
            ? null
            : {
                t: 'No reviews in scope',
                d: d.cycles.length
                  ? 'Add reviews to a cycle from the Cycles view.'
                  : 'Create a review cycle first.',
                acts: [],
              },
          info: 'Reviews are written by people. Nothing is auto-scored from activity, messages, logins or AI inference.',
        }),
      ]),
    ];
  }

  // ===== 14 Training ========================================================

  trActs(a: PpActor, d: Data, t: Data['tas'][number]) {
    const o: string[] = [];
    const own = t.userId === a.userId;
    const st = this.X.taStatus(d, t);
    const c = this.X.course(d, t.courseId);
    if (
      (own || a.training) &&
      ['Assigned', 'In Progress', 'Overdue'].includes(st)
    )
      o.push('Mark completion');
    if (own && st === 'Assigned') o.push('Start');
    if (a.training && t.status === 'Completed') o.push('Verify completion');
    if (
      (own || a.training) &&
      ['Completed', 'Verified'].includes(t.status) &&
      c?.validDays
    )
      o.push(t.certDocId ? 'Renew' : 'Upload / link certificate');
    if (a.training && st !== 'Verified') o.push('Send reminder');
    return o;
  }

  vTraining(d: Data) {
    const X = this.X;
    const a = d.a;
    const v = d.s.view.trView || 'assign';
    const f = this.F(d, 'tr');
    const all = d.tas.filter((t) => X.inScope(d, t.userId));
    const L = all.filter(
      (t) =>
        (!f.st || X.taStatus(d, t) === f.st) &&
        (!f.course || t.courseId === f.course),
    );
    const due = (t: Data['tas'][number]) => X.off(d, t.dueOn) ?? 0;
    const ce = (t: Data['tas'][number]) => X.off(d, t.certExpires);
    const kpis = [
      K(
        't:Assigned',
        'Assigned',
        all.filter((t) =>
          ['Assigned', 'In Progress'].includes(X.taStatus(d, t)),
        ).length,
        '',
        null,
        '#2E90FA',
      ),
      K(
        't:soon',
        'Due Soon',
        all.filter(
          (t) =>
            ['Assigned', 'In Progress'].includes(X.taStatus(d, t)) &&
            due(t) <= 14,
        ).length,
        '14 days',
        null,
        '#F79009',
      ),
      K(
        't:Overdue',
        'Overdue',
        all.filter((t) => X.taStatus(d, t) === 'Overdue').length,
        '',
        null,
        '#F04438',
      ),
      K(
        't:Completed',
        'Completed',
        all.filter((t) => ['Completed', 'Verified'].includes(t.status)).length,
        '',
        null,
        '#12A150',
      ),
      K(
        't:cert',
        'Certificates Expiring',
        all.filter((t) => ce(t) != null && ce(t)! <= 60).length,
        '60 days',
        null,
        '#F79009',
      ),
    ];
    const sg = this.segOf(d, 'trView', 'assign', [
      ['assign', 'Assignments', all.length],
      ['catalog', 'Catalog', d.courses.length],
      ['matrix', 'Skills matrix'],
    ]);
    const acts = [
      btn(
        'assigntr',
        'Assign training',
        'primary',
        !a.training || !d.courses.length,
      ),
    ];
    if (v === 'catalog')
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'tr-c',
            seg: sg,
            acts: [
              btn('newcourse', 'Create training item', 'primary', !a.training),
            ],
            table: d.courses.length
              ? {
                  hasActs: true,
                  cols: cols([
                    'Course',
                    'Provider',
                    'Type',
                    'Required for',
                    'Duration',
                    'Mode',
                    'Assessment',
                    'Validity',
                    'Skill',
                  ]),
                  rows: d.courses.map((c) => {
                    const roles = (c.roles as unknown as string[]) ?? [];
                    return row(
                      c.id,
                      [
                        cell({ t: c.name, fw: 700, s: c.number }),
                        cell({ t: c.provider }),
                        cell({ t: c.type }),
                        cell({ t: roles.join(', ') || 'Optional' }),
                        cell({ t: `${num(c.hours)} h` }),
                        cell({ t: c.mode }),
                        cell({ t: c.assessment ? 'Yes' : 'No' }),
                        cell({
                          t: c.validDays
                            ? `${Math.round((c.validDays / 365) * 10) / 10} yr`
                            : '—',
                        }),
                        cell({ t: c.skill }),
                      ],
                      a.training ? ['Bulk assign by department', 'Assign'] : [],
                      [c.name, c.type, []],
                    );
                  }),
                }
              : null,
            empty: d.courses.length
              ? null
              : {
                  t: 'No training items yet',
                  d: 'Create the courses, inductions and certifications your team needs.',
                  acts: [],
                },
          }),
        ]),
      ];
    if (v === 'matrix') {
      const sk = uniq(d.courses.map((c) => c.skill));
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'tr-m',
            seg: sg,
            table: sk.length
              ? {
                  hasActs: false,
                  cols: cols(['Employee', ...sk]),
                  rows: X.staffV(d).map((e) =>
                    row(
                      e.id,
                      [
                        cell({ t: e.name, fw: 700, s: e.dept }),
                        ...sk.map((k) => {
                          const t = all.find(
                            (x) =>
                              x.userId === e.id &&
                              X.course(d, x.courseId)?.skill === k,
                          );
                          const st = t ? X.taStatus(d, t) : '';
                          return cell({
                            t: !t
                              ? '—'
                              : ['Completed', 'Verified'].includes(st)
                                ? `✓${st === 'Completed' ? ' (unverified)' : ''}${ce(t) != null && ce(t)! <= 60 ? ' expiring' : ''}`
                                : st === 'Overdue'
                                  ? '! overdue'
                                  : `○ ${st.toLowerCase()}`,
                            fg: !t
                              ? '#98A2B3'
                              : st === 'Verified'
                                ? '#0E8442'
                                : st === 'Overdue'
                                  ? '#B42318'
                                  : '#B54708',
                          });
                        }),
                      ],
                      [],
                      [e.name, '', []],
                    ),
                  ),
                }
              : null,
            empty: sk.length
              ? null
              : {
                  t: 'No skills yet',
                  d: 'Skills come from the training catalog.',
                  acts: [],
                },
            info: 'Skills come only from completed and verified training — never inferred.',
          }),
        ]),
      ];
    }
    const pg = this.paged(d, L, 15);
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'tr',
          seg: sg,
          acts,
          filters: {
            search: null,
            sels: [
              sel2('st', 'Status', f.st, [
                ['', 'Any status'],
                'Assigned',
                'In Progress',
                'Overdue',
                'Completed',
                'Verified',
              ]),
              sel2('course', 'Course', f.course, [
                ['', 'Any course'],
                ...d.courses.map((c) => [c.id, c.name] as [string, string]),
              ]),
            ],
            nOn: nOn(f),
            count: `${L.length} assignments`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Employee',
                  'Course',
                  'Type',
                  'Due',
                  'Status',
                  'Score',
                  'Certificate',
                  'Cert expiry',
                ]),
                rows: pg.rows.map((t) => {
                  const c = X.course(d, t.courseId);
                  const st = X.taStatus(d, t);
                  return row(
                    t.id,
                    [
                      cell({ t: X.name(d, t.userId), fw: 700 }),
                      cell({ t: c?.name ?? '—' }),
                      cell({ t: c?.type ?? '—' }),
                      cell({
                        t: X.dday(d, dayKey(t.dueOn, 'UTC')),
                        fg: st === 'Overdue' ? '#B42318' : '#344054',
                      }),
                      stc(st),
                      cell({ t: t.score != null ? `${num(t.score)}%` : '—' }),
                      cell({
                        t: t.certDocId ? 'Stored (Contracts documents)' : '—',
                      }),
                      cell({
                        t: t.certExpires
                          ? X.dday(d, dayKey(t.certExpires, 'UTC'))
                          : '—',
                        fg:
                          ce(t) != null && ce(t)! <= 60 ? '#B54708' : '#344054',
                      }),
                    ],
                    this.trActs(a, d, t),
                    [
                      `${X.name(d, t.userId)} · ${c?.name ?? ''}`,
                      `${st} · due ${X.dday(d, dayKey(t.dueOn, 'UTC'))}`,
                      [chipOf(st)],
                    ],
                  );
                }),
              }
            : null,
          pager: pg.pager,
          empty: L.length
            ? null
            : {
                t: all.length ? 'No assignments match' : 'No training assigned',
                d: d.courses.length
                  ? ''
                  : 'Create a training item in the Catalog first.',
                acts: [],
              },
        }),
      ]),
    ];
  }

  // ===== 15 Offboarding =====================================================

  vOffboarding(d: Data) {
    const X = this.X;
    const a = d.a;
    const all = d.ofbs.filter(
      (o) => a.offboard || a.payroll || X.inScope(d, o.userId, true),
    );
    const kpis = [
      K(
        'x:up',
        'Upcoming Exits',
        all.filter((o) => o.status !== 'Completed').length,
        '',
        null,
        '#F79009',
      ),
      K(
        'x:acc',
        'Access Pending Revoke',
        all.reduce(
          (s, o) =>
            s +
            X.ofbItems(o).filter((i) => i.kind === 'access' && !i.verified)
              .length,
          0,
        ),
        'Staff login still active',
        null,
        '#F04438',
      ),
      K(
        'x:ast',
        'Assets Outstanding',
        all.reduce(
          (s, o) =>
            s +
            X.ofbItems(o).filter((i) => i.kind === 'asset' && !i.done).length,
          0,
        ),
        'Confirmed manually',
        null,
        '#F79009',
      ),
      K(
        'x:pay',
        'Final Payroll Pending',
        all.filter((o) => o.status !== 'Completed' && !o.finalRunId).length,
        '',
        null,
        '#F79009',
      ),
      K(
        'x:done',
        'Completed',
        all.filter((o) => o.status === 'Completed').length,
        '',
        null,
        '#12A150',
      ),
    ];
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'ofb',
          acts: [btn('newofb', 'Start offboarding', 'primary', !a.offboard)],
          table: all.length
            ? {
                hasActs: true,
                cols: cols([
                  'Employee',
                  'Exit type',
                  'Reason',
                  'Last working day',
                  'Handover',
                  'Open items',
                  'Final pay',
                  'Status',
                ]),
                rows: all.map((o) => {
                  const it = X.ofbItems(o);
                  const fr = d.runs.find((r) => r.id === o.finalRunId);
                  return row(
                    o.id,
                    [
                      cell({ t: X.name(d, o.userId), fw: 800, s: o.number }),
                      cell({ t: o.exitType }),
                      cell({ t: a.exitReason ? o.reason : '🔒 Restricted' }),
                      cell({ t: X.dday(d, dayKey(o.lastDay, 'UTC')) }),
                      cell({ t: X.name(d, o.handoverUserId) }),
                      cell({
                        t: `${it.filter((i) => !i.done).length} (${it.filter((i) => !i.done && i.mand).length} mandatory)`,
                      }),
                      cell({
                        t: fr ? fr.number : 'Not linked',
                        fg: fr ? '#0E8442' : '#B54708',
                      }),
                      stc(o.status),
                    ],
                    a.offboard && o.status !== 'Completed'
                      ? [
                          'Open',
                          'Create linked tasks',
                          'Revoke access',
                          'Confirm asset return',
                          'Link final payroll',
                          'Generate documents',
                          'Complete',
                        ]
                      : ['Open'],
                    [
                      X.name(d, o.userId),
                      `${o.exitType} · ${X.dday(d, dayKey(o.lastDay, 'UTC'))}`,
                      [chipOf(o.status)],
                    ],
                  );
                }),
              }
            : null,
          empty: all.length
            ? null
            : { t: 'No exits in progress', d: '', acts: [] },
          info: 'Deactivation keeps the Staff record and its history. Final pay is calculated in a payroll run and linked here — never recalculated in Offboarding.',
        }),
      ]),
    ];
  }

  inpOf(i: Inp) {
    return i;
  }
}
