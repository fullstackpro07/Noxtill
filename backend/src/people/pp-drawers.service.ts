import { Injectable } from '@nestjs/common';
import { btn } from '../payments/pay-vm';
import { dayKey, hourOf, hh } from '../field-service/fs-time';
import { num } from './pp-context.service';
import {
  Calc,
  Data,
  PpDataService,
  diffDays,
  periodLabel,
} from './pp-data.service';
import { PpViewsService, chipOf } from './pp-views.service';
import { RUN_FINAL } from './pp.constants';

type Btn = ReturnType<typeof btn>;
const LOCK = '🔒 Restricted';
const B = (st: string) => {
  const c = chipOf(st);
  return { t: c.t, bg: c.bg, fg: c.fg };
};
const KV = (k: string, v: unknown) => ({
  k,
  v:
    v == null || v === ''
      ? '—'
      : typeof v === 'string'
        ? v
        : typeof v === 'number' || typeof v === 'boolean'
          ? v.toString()
          : JSON.stringify(v),
});
const none = [{ a: 'None', c: '', b: '', d: '' }];

/** Record drawers (pp-ui.js vDrawer), from real rows only. */
@Injectable()
export class PpDrawersService {
  constructor(
    private readonly X: PpDataService,
    private readonly V: PpViewsService,
  ) {}

  private base() {
    return {
      kicker: '',
      title: '',
      badges: [] as { t: string; bg: string; fg: string }[],
      sections: [] as Record<string, unknown>[],
      hasActs: false,
      acts: [] as Btn[],
      ref: null as unknown,
    };
  }
  async drawer(d: Data, kind: string, id: string) {
    const X = this.X;
    const a = d.a;
    const o = this.base();
    switch (kind) {
      case 'kpi':
        return this.kpi(d, id);
      case 'emp': {
        const e = X.emp(d, id);
        if (!e || !(X.inScope(d, id, true) || a.onboard || a.offboard))
          return {
            ...o,
            title: 'Not available',
            sections: [
              {
                h: 'Restricted',
                text: 'This person isn’t in your People scope.',
              },
            ],
          };
        const lv = d.leaves.filter((l) => l.uid === id).slice(0, 4);
        const pay = a.salary || id === a.userId;
        const pr = a.payroll || id === a.userId;
        const types = d.cfg.leave.types.filter((t) => t.entitlement != null);
        return {
          ...o,
          kicker: `Employee · Staff record · ${X.brName(d, e.branchId)}`,
          title: e.name,
          badges: [B(X.onLeave(d, id) ? 'On Leave' : e.status)],
          sections: [
            {
              h: 'Employment',
              kv: [
                KV('Title', e.title),
                KV('Department', e.dept || 'Not set'),
                KV('Branch', X.brName(d, e.branchId)),
                KV('Type', e.type),
                KV('Manager', e.mgr ? X.name(d, e.mgr) : '—'),
                KV(
                  'Started',
                  e.startSet
                    ? X.dday(d, e.start)
                    : `${X.dday(d, e.start)} (Staff record created)`,
                ),
                KV(
                  'Probation ends',
                  e.probationEnd
                    ? X.dday(d, dayKey(e.probationEnd, 'UTC'))
                    : '—',
                ),
                KV(
                  'Contract ends',
                  e.contractEnd ? X.dday(d, dayKey(e.contractEnd, 'UTC')) : '—',
                ),
                KV('Pay basis', e.basis ?? 'Not set'),
                KV(
                  'Pay rate',
                  pay
                    ? e.rate == null
                      ? 'Not set'
                      : `${d.fmt.money(e.rate)}${e.basis === 'Hourly' ? '/h' : e.basis === 'Salaried' ? '/month' : ''}`
                    : LOCK,
                ),
                KV(
                  'Bank / payout',
                  pr
                    ? e.bankMask
                      ? `${e.bankName ?? ''} ${e.bankMask}`
                      : 'Missing'
                    : LOCK,
                ),
                KV(
                  'Tax profile',
                  pr
                    ? (e.taxStatus ?? 'Missing') +
                        (e.taxMask ? ` · ID ${e.taxMask}` : '')
                    : LOCK,
                ),
                KV('In payroll', e.inPayroll ? 'Yes' : 'No'),
                KV('Role in Noxtill', e.roleLabel),
              ],
            },
            {
              h: 'Leave balance',
              kv: types.length
                ? types.map((t) => KV(t.name, `${X.bal(d, id, t.key)} days`))
                : [KV('Leave types', 'Not configured')],
            },
            {
              h: 'Recent leave',
              items: lv.length
                ? lv.map((l) => ({
                    a: X.ltName(d, l.type),
                    c: `${X.dday(d, l.sKey)} → ${X.dday(d, l.eKey)}`,
                    b: l.status,
                    d: '',
                  }))
                : none,
            },
          ],
          hasActs: true,
          acts: [
            btn(
              'de:profile',
              'Edit employment & payroll profile',
              'primary',
              !(
                a.onboard ||
                a.offboard ||
                a.salary ||
                a.payroll ||
                a.owner ||
                id === a.userId
              ),
            ),
            btn('ext:staff', 'Open in Staff'),
          ],
          ref: { uid: id, version: e.version },
        };
      }
      case 'cand': {
        const c = d.cands.find((x) => x.id === id);
        if (!c) return null;
        const ints = d.ints.filter((i) => i.candidateId === id);
        const offs = d.offers.filter((x) => x.candidateId === id);
        const acc = offs.some((x) => x.status === 'Accepted');
        const acts = this.V.appActs(a, c, acc)
          .filter((x) => x !== 'Open' && !x.startsWith('Move to'))
          .slice(0, 5);
        return {
          ...o,
          kicker: `Candidate · ${c.number} · not a CRM lead`,
          title: c.name,
          badges: [
            B(c.stage),
            { t: `Consent: ${c.consent}`, bg: '#F2F4F7', fg: '#344054' },
          ],
          sections: [
            {
              h: 'Profile',
              kv: [
                KV('Job', X.job(d, c.jobId)?.title),
                KV('Email', a.pii ? c.email : '🔒'),
                KV('Phone', a.pii ? (c.phone ?? '—') : '🔒'),
                KV(
                  'Source',
                  c.source +
                    (c.referredBy ? ` · referred by ${c.referredBy}` : ''),
                ),
                KV('Applied', X.dday(d, c.appliedAt)),
                KV('Availability', c.availability),
                KV(
                  'Expected compensation',
                  a.comp
                    ? c.expectedComp != null
                      ? d.fmt.money(num(c.expectedComp))
                      : '—'
                    : LOCK,
                ),
                KV(
                  'Resume',
                  c.resumeName
                    ? `${c.resumeName} (Contracts documents)`
                    : 'Not uploaded',
                ),
                KV('Owner', X.name(d, c.ownerUserId)),
                ...(c.rejectReason
                  ? [KV('Rejection / withdrawal', c.rejectReason)]
                  : []),
                ...(c.hiredUserId
                  ? [KV('Linked Staff record', X.name(d, c.hiredUserId))]
                  : []),
              ],
            },
            {
              h: 'Interviews',
              items: ints.length
                ? ints.map((i) => ({
                    a: i.round,
                    c: `${X.dday(d, i.startsAt)} ${hh(hourOf(i.startsAt, d.tz))}`,
                    b: i.status,
                    d: Object.values(X.sc(i))
                      .map((x) => x.rec)
                      .join(', '),
                  }))
                : none,
            },
            {
              h: 'Offers',
              items: offs.length
                ? offs.map((x) => ({
                    a: `${x.number} v${x.version}`,
                    c: X.job(d, x.jobId)?.title ?? '',
                    b: x.status,
                    d: '',
                  }))
                : none,
            },
            {
              h: 'Timeline',
              items: [...X.candHist(c)].reverse().map((h) => ({
                a: h.t,
                c: d.fmt.dtm(new Date(h.at)),
                b: h.by ?? '',
                d: '',
              })),
            },
            {
              h: 'Privacy',
              text: `Retention: ${['Rejected', 'Withdrawn'].includes(c.stage) ? `anonymise ${d.cfg.recruiting.retentionMonths} months after the decision unless consent is renewed` : 'active application'}. Nothing about protected characteristics is inferred.`,
            },
          ],
          hasActs: true,
          acts: [
            ...acts.map((x, i) =>
              btn(`dc:${x}`, x, i === 0 ? 'primary' : 'ghost'),
            ),
            ...(c.resumeKey
              ? [btn('dc:Download resume', 'Download resume')]
              : a.recruit
                ? [btn('dc:Upload resume', 'Upload resume')]
                : []),
          ],
          ref: {
            id: c.id,
            version: c.version,
            stage: c.stage,
            name: c.name,
            jobId: c.jobId,
            next: this.V.appActs(a, c, acc)
              .filter((x) => x.startsWith('Move to'))
              .map((x) => x.slice(8)),
          },
        };
      }
      case 'job': {
        const j = d.jobs.find((x) => x.id === id);
        if (!j) return null;
        const A = d.cands.filter((c) => c.jobId === id);
        const comp = a.comp || a.salary;
        const acts = this.V.jobActs(a, j).filter((x) => x !== 'Open job');
        return {
          ...o,
          kicker: `Vacancy · ${j.number} · v${j.version}`,
          title: j.title,
          badges: [B(j.status)],
          sections: [
            {
              h: 'Basics',
              kv: [
                KV('Department', j.department),
                KV('Location', `${X.brName(d, j.branchId)} · ${j.workMode}`),
                KV('Employment type', j.employmentType),
                KV('Headcount target', j.target),
                KV('Hiring manager', X.name(d, j.managerUserId)),
                KV('Recruiter', X.name(d, j.recruiterUserId)),
                KV('Opening reason', j.reason),
                KV(
                  'Budget approval',
                  j.budgetRef ?? 'Missing — needed before approval',
                ),
                KV(
                  'Compensation range',
                  comp
                    ? j.compMin != null || j.compMax != null
                      ? `${d.fmt.money(num(j.compMin))} – ${d.fmt.money(num(j.compMax))}${j.compPublic ? ' (public)' : ''}`
                      : 'Not set'
                    : LOCK,
                ),
                KV(
                  'Opened',
                  j.openedAt
                    ? `${X.dday(d, j.openedAt)} · target ${j.targetDays} days`
                    : `Not opened · target ${j.targetDays} days`,
                ),
                KV(
                  'Public page',
                  j.status === 'Published'
                    ? `/careers/${d.biz.slug ?? ''}/${j.slug}`
                    : 'Not published',
                ),
              ],
            },
            {
              h: 'Public posting preview',
              text: `${j.title} — ${X.brName(d, j.branchId)} (${j.workMode}, ${j.employmentType})\n${j.description ?? 'No description yet.'}\nExcluded: budget, internal notes, approval comments${j.compPublic ? '' : ', compensation range'}.`,
            },
            {
              h: `Applicants (${A.length})`,
              items: A.length
                ? A.map((c) => ({ a: c.name, c: c.source, b: c.stage, d: '' }))
                : none,
            },
          ],
          hasActs: acts.length > 1,
          acts: acts
            .slice(0, 6)
            .map((x, i) => btn(`dj:${x}`, x, i === 1 ? 'primary' : 'ghost')),
          ref: {
            id: j.id,
            version: j.version,
            title: j.title,
            department: j.department,
            branchId: j.branchId ?? '',
            workMode: j.workMode,
            employmentType: j.employmentType,
            target: j.target,
            managerUserId: j.managerUserId ?? '',
            compMin: comp && j.compMin != null ? num(j.compMin) : '',
            compMax: comp && j.compMax != null ? num(j.compMax) : '',
            reason: j.reason ?? '',
            budgetRef: j.budgetRef ?? '',
            description: j.description ?? '',
            targetDays: j.targetDays,
            slug: j.slug,
            status: j.status,
          },
        };
      }
      case 'int': {
        const i = d.ints.find((x) => x.id === id);
        if (!i) return null;
        const hide =
          d.cfg.recruiting.hideFeedbackUntilSubmitted &&
          !a.recruit &&
          !X.sc(i)[a.userId];
        const acts = this.V.intActs(a, i).filter(
          (x) => x !== 'Open' && x !== 'Open scorecard',
        );
        const mine = X.ivs(i).includes(a.userId) || a.owner;
        return {
          ...o,
          kicker: `Interview · ${i.number}`,
          title: `${X.candName(d, i.candidateId)} · ${i.round}`,
          badges: [B(X.fbOver(d, i) ? 'Feedback Overdue' : i.status)],
          sections: [
            {
              h: 'Details',
              kv: [
                KV('Job', X.job(d, i.jobId)?.title),
                KV(
                  'When',
                  `${X.dday(d, i.startsAt)} ${hh(hourOf(i.startsAt, d.tz))} · ${i.durationMin} min`,
                ),
                KV('Timezone', i.timezone),
                KV('Location', i.location),
                KV(
                  'Interviewers',
                  X.ivs(i)
                    .map((v) => X.name(d, v))
                    .join(', '),
                ),
                KV(
                  'Competencies',
                  `${d.cfg.recruiting.competencies.join(' · ')} (job-related only)`,
                ),
                KV(
                  'Feedback due',
                  i.feedbackDue ? X.dday(d, i.feedbackDue) : '—',
                ),
              ],
            },
            {
              h: 'Scorecards',
              items: X.ivs(i).map((v) => {
                const sc = X.sc(i)[v];
                return {
                  a: X.name(d, v),
                  c:
                    hide && v !== a.userId
                      ? 'Hidden until you submit yours'
                      : sc
                        ? `Ratings ${sc.r.join(' / ')} · ${sc.note}`
                        : 'Not submitted',
                  b: sc && !(hide && v !== a.userId) ? sc.rec : '—',
                  d: sc ? `v${sc.ver} · locked` : '',
                };
              }),
            },
          ],
          hasActs: acts.length > 0 || (i.status === 'Completed' && mine),
          acts: [
            ...acts
              .slice(0, 4)
              .map((x, k) => btn(`di:${x}`, x, k === 0 ? 'primary' : 'ghost')),
            ...(i.status === 'Completed' && mine
              ? [
                  btn(
                    'di:Submit feedback',
                    X.sc(i)[a.userId] ? 'Amend feedback' : 'Submit feedback',
                    'primary',
                  ),
                ]
              : []),
          ],
          ref: {
            id: i.id,
            candidateId: i.candidateId,
            round: i.round,
            date: dayKey(i.startsAt, i.timezone || d.tz),
            time: hh(hourOf(i.startsAt, i.timezone || d.tz)),
            timezone: i.timezone,
            durationMin: i.durationMin,
            interviewers: X.ivs(i),
            location: i.location,
            mine: X.sc(i)[a.userId] ?? null,
            competencies: d.cfg.recruiting.competencies,
          },
        };
      }
      case 'offer': {
        const x = d.offers.find((y) => y.id === id);
        if (!x) return null;
        const comp = a.comp || a.salary;
        const acts = this.V.offActs(a, x).filter((y) => y !== 'Open');
        return {
          ...o,
          kicker: `Offer · ${x.number} · v${x.version}`,
          title: `${X.candName(d, x.candidateId)} · ${X.job(d, x.jobId)?.title ?? ''}`,
          badges: [B(x.status)],
          sections: [
            {
              h: 'Terms',
              kv: [
                KV(
                  'Entity / branch',
                  `${d.biz.name} · ${X.brName(d, x.branchId)}`,
                ),
                KV('Employment type', x.employmentType),
                KV('Start date', X.dday(d, dayKey(x.startDate, 'UTC'))),
                KV(
                  'Compensation',
                  comp
                    ? `${d.fmt.money(num(x.comp))} ${x.frequency.toLowerCase()}`
                    : LOCK,
                ),
                KV('Probation', x.probation),
                KV('Benefits', x.benefits),
                KV('Conditions', x.conditions),
                KV('Expiry', X.dday(d, dayKey(x.expiresOn, 'UTC'))),
                KV(
                  'Approved compensation',
                  x.approvedComp == null
                    ? 'Not approved'
                    : comp
                      ? `${d.fmt.money(num(x.approvedComp))} · by ${X.name(d, x.approvedById)}`
                      : '🔒',
                ),
                KV(
                  'Offer letter',
                  x.docId ? 'Generated in Contracts › Documents' : '—',
                ),
                KV(
                  'eSign',
                  x.signRequestId ? 'Noxtill eSign request (Contracts)' : '—',
                ),
                ...(x.declineReason
                  ? [KV('Decline reason', x.declineReason)]
                  : []),
              ],
            },
            {
              h: 'Versions',
              items: X.offerVers(x).map((v) => ({
                a: `v${v.ver}`,
                c: comp ? d.fmt.money(v.comp) : '🔒',
                b: v.st,
                d: v.at ? d.fmt.dtm(new Date(v.at)) : '',
              })),
            },
            {
              h: 'Rule',
              text: 'Accepted means the candidate signed in Noxtill eSign. It does not complete onboarding or create the Staff record — use Hire / convert.',
            },
          ],
          hasActs: acts.length > 0,
          acts: acts
            .slice(0, 5)
            .map((y, i) => btn(`do:${y}`, y, i === 0 ? 'primary' : 'ghost')),
          ref: {
            id: x.id,
            version: x.version,
            comp: comp ? num(x.comp) : null,
            startDate: dayKey(x.startDate, 'UTC'),
            approvedComp:
              comp && x.approvedComp != null ? num(x.approvedComp) : null,
            candidateId: x.candidateId,
          },
        };
      }
      case 'onb': {
        const x = d.onbs.find((y) => y.id === id);
        if (!x) return null;
        const sk = dayKey(x.startDate, 'UTC');
        const it = X.onbItems(x);
        const ms = [...new Set(it.map((i) => i.ms))];
        return {
          ...o,
          kicker: `Onboarding · ${x.number} · ${x.template}`,
          title: this.V.onbWho(d, x),
          badges: [
            B(x.status),
            { t: `${this.V.onbPct(x)}%`, bg: '#F2F4F7', fg: '#344054' },
          ],
          sections: [
            {
              h: 'Case',
              kv: [
                KV('Start date', X.dday(d, sk)),
                KV('Manager', X.name(d, x.managerUserId)),
                KV('Buddy', X.name(d, x.buddyUserId)),
                KV(
                  'Staff record',
                  x.userId
                    ? X.name(d, x.userId)
                    : 'Not hired yet — Hire / convert from Applicants',
                ),
              ],
            },
            ...ms.map((m) => ({
              h: m,
              items: it
                .map((i, n) => ({ i, n }))
                .filter(({ i }) => i.ms === m)
                .map(({ i }) => {
                  const due = diffDays(sk, d.today) + i.off;
                  return {
                    a: `${i.done ? '✓ ' : due < 0 ? '! ' : '○ '}${i.t}${i.mand ? '' : ' (optional)'}`,
                    c: `${i.owner} · due ${X.dday(d, dayKey(new Date(Date.parse(`${sk}T00:00:00Z`) + i.off * 86400000), 'UTC'))}${i.task ? ` · ${i.task} (Projects & Tasks)` : ''}${i.ovr ? ` · override: ${i.ovr}` : ''}`,
                    b: i.done ? 'Done' : 'Open',
                    d: i.kind,
                  };
                }),
            })),
          ],
          hasActs: a.onboard && x.status !== 'Completed',
          acts: [
            btn(
              'dn:item',
              'Mark item complete',
              'primary',
              x.status === 'Completed',
            ),
            btn(
              'dn:tasks',
              'Create linked tasks',
              'ghost',
              it.every((i) => i.task || i.done),
            ),
            btn('dn:docs', 'Request documents'),
            btn('dn:edit', 'Edit manager / buddy'),
            btn('dn:training', 'Assign training', 'ghost', !x.userId),
          ],
          ref: {
            id: x.id,
            open: it
              .map((i, n) => ({
                n,
                t: `${i.ms} · ${i.t}${i.mand ? ' (mandatory)' : ''}`,
                done: i.done,
              }))
              .filter((y) => !y.done),
            userId: x.userId,
            managerUserId: x.managerUserId ?? '',
            buddyUserId: x.buddyUserId ?? '',
            startDate: sk,
          },
        };
      }
      case 'leave': {
        const l = d.leaves.find((y) => y.id === id);
        if (!l || !(X.inScope(d, l.uid, true) || l.uid === a.userId))
          return null;
        const t = X.lt(d, l.type);
        const cov = await X.coverage(d, l);
        const acts = this.V.lvActs(a, l, d.today).filter(
          (y) => y !== 'Open schedule impact',
        );
        const e = X.emp(d, l.uid);
        return {
          ...o,
          kicker: `Leave request · ${l.number}`,
          title: `${X.name(d, l.uid)} · ${X.ltName(d, l.type)}`,
          badges: [
            B(l.status),
            ...(l.emerg
              ? [{ t: 'Emergency', bg: '#FEF3F2', fg: '#B42318' }]
              : []),
          ],
          sections: [
            {
              h: 'Request',
              kv: [
                KV(
                  'Dates',
                  `${X.dday(d, l.sKey)} → ${X.dday(d, l.eKey)}${l.partial ? ' (half day)' : ''}`,
                ),
                KV('Days', l.days),
                KV(
                  'Balance now',
                  X.bal(d, l.uid, l.type) == null
                    ? 'n/a'
                    : `${X.bal(d, l.uid, l.type)} d`,
                ),
                KV(
                  'Reason',
                  a.leaveReason || l.uid === a.userId || !t?.sensitive
                    ? l.reason
                    : '🔒 Sensitive — HR only',
                ),
                KV(
                  'Approver',
                  l.apr
                    ? X.name(d, l.apr)
                    : e?.mgr
                      ? X.name(d, e.mgr)
                      : 'Leave approver',
                ),
                KV(
                  'Attachment',
                  l.attachmentKey ? 'Filed in Contracts documents' : '—',
                ),
                ...(l.rej ? [KV('Rejection reason', l.rej)] : []),
              ],
            },
            {
              h: 'Schedule & coverage impact',
              bullets: cov.length
                ? cov
                : [
                    'No coverage conflicts found in Staff schedules or Bookings',
                  ],
            },
          ],
          hasActs: acts.length > 0 || !!l.attachmentKey,
          acts: [
            ...acts.map((y, i) =>
              btn(
                `dl:${y}`,
                y,
                i === 0 ? 'primary' : y === 'Reject' ? 'danger' : 'ghost',
              ),
            ),
            ...(l.attachmentKey && (a.leaveReason || l.uid === a.userId)
              ? [btn('dl:Download attachment', 'Download attachment')]
              : []),
          ],
          ref: { id: l.id, status: l.status, number: l.number },
        };
      }
      case 'calc':
        return this.calc(d, id);
      case 'slip':
        return this.slip(d, id);
      case 'rule': {
        const r = d.rules.find((y) => y.id === id);
        if (!r) return null;
        const cur =
          X.ruleVer(r.versions, d.today) ?? r.versions[r.versions.length - 1];
        return {
          ...o,
          kicker: `Rule · ${r.number} · v${cur?.ver ?? 1}`,
          title: r.name,
          badges: [B(r.status)],
          sections: [
            {
              h: 'Definition',
              kv: [
                KV('Type', r.type),
                KV('Classification', r.cls),
                KV('Tax treatment', r.pp),
                KV('Method', r.method),
                KV(
                  'Employee share',
                  this.V.ruleVal(d, r.method, cur?.ee ?? null),
                ),
                KV(
                  'Employer share',
                  this.V.ruleVal(d, r.method, cur?.er ?? null),
                ),
                KV('Eligibility', r.elig),
                KV(
                  'Effective',
                  cur
                    ? `${X.dday(d, cur.from)}${cur.to ? ` → ${X.dday(d, cur.to)}` : ' → open'}`
                    : '—',
                ),
                KV(
                  'Finance account',
                  r.fin ? `${r.fin} (reference only)` : '—',
                ),
                KV('Provider', r.prov),
              ],
            },
            {
              h: `Assigned (${r.assigned.length})`,
              text:
                r.assigned.map((u) => X.name(d, u)).join(', ') ||
                'Nobody yet — assign from the Assignments view.',
            },
            {
              h: 'Versions',
              items: r.versions.map((h) => ({
                a: `v${h.ver}`,
                c: `from ${X.dday(d, h.from)}${h.to ? ` to ${X.dday(d, h.to)}` : ''} · ${h.why}`,
                b: X.name(d, h.by),
                d: d.fmt.dtm(new Date(h.at)),
              })),
            },
          ],
          hasActs: a.benefits && r.status !== 'Inactive',
          acts: [
            btn('db:Schedule change', 'Schedule change', 'primary'),
            btn('db:Bulk assign', 'Bulk assign'),
            btn('db:Deactivate future', 'Deactivate future'),
          ],
          ref: {
            id: r.id,
            method: r.method,
            ee: cur?.ee ?? null,
            er: cur?.er ?? null,
            name: r.name,
          },
        };
      }
      case 'review': {
        const r = d.reviews.find((y) => y.id === id);
        if (!r) return null;
        const priv =
          a.perfPrivate ||
          r.reviewerUserId === a.userId ||
          r.userId === a.userId;
        const acts = this.V.perfActs(a, r).filter((y) => y !== 'Open');
        const dev = (r.dev as unknown as string[]) ?? [];
        return {
          ...o,
          kicker: `Review · ${d.cycles.find((c) => c.id === r.cycleId)?.name ?? ''}`,
          title: X.name(d, r.userId),
          badges: [B(r.status)],
          sections: [
            {
              h: 'Goals',
              items: X.goals(r).length
                ? X.goals(r).map((g) => ({
                    a: g.t,
                    c: `Weight ${g.w}%`,
                    b: `${g.p}%`,
                    d: '',
                  }))
                : none,
            },
            { h: 'Self review', text: r.selfText ?? 'Not submitted' },
            {
              h: 'Manager review',
              text: priv
                ? r.managerText
                  ? `${r.managerText}\nRating: ${r.rating}`
                  : 'Not submitted'
                : '🔒 Private feedback',
            },
            {
              h: 'Context (not a verdict)',
              text: 'Nothing here is auto-scored. Ratings are written by the reviewer.',
            },
            ...(dev.length ? [{ h: 'Development actions', bullets: dev }] : []),
          ],
          hasActs: acts.length > 0 || a.perf,
          acts: [
            ...acts.map((y, i) =>
              btn(`dv:${y}`, y, i === 0 ? 'primary' : 'ghost'),
            ),
            ...(a.perf || r.reviewerUserId === a.userId
              ? [btn('dv:Add goal', 'Add goal')]
              : []),
          ],
          ref: { id: r.id, goals: X.goals(r) },
        };
      }
      case 'ofb': {
        const x = d.ofbs.find((y) => y.id === id);
        if (!x) return null;
        const it = X.ofbItems(x);
        const fr = d.runs.find((r) => r.id === x.finalRunId);
        const types = d.cfg.leave.types.filter(
          (t) => t.entitlement != null && t.paid,
        );
        return {
          ...o,
          kicker: `Offboarding · ${x.number}`,
          title: `${X.name(d, x.userId)} · ${x.exitType}`,
          badges: [B(x.status)],
          sections: [
            {
              h: 'Overview',
              kv: [
                KV('Exit type', x.exitType),
                KV('Reason', a.exitReason ? x.reason : LOCK),
                KV('Notice date', X.dday(d, dayKey(x.noticeDate, 'UTC'))),
                KV('Last working day', X.dday(d, dayKey(x.lastDay, 'UTC'))),
                KV('Handover owner', X.name(d, x.handoverUserId)),
                KV(
                  'Final pay',
                  fr
                    ? `Linked to ${fr.number} (${fr.status})`
                    : 'Not linked yet',
                ),
                KV(
                  'Leave balance at exit',
                  types.length
                    ? types
                        .map((t) => `${t.name} ${X.bal(d, x.userId, t.key)} d`)
                        .join(' · ')
                    : 'No paid leave types',
                ),
              ],
            },
            {
              h: 'Checklist',
              items: it.map((i) => ({
                a: `${i.done ? '✓ ' : '○ '}${i.t}${i.mand ? '' : ' (optional)'}`,
                c: `${i.owner}${i.ref ? ` · ${i.ref}` : ''}${i.task ? ` · ${i.task}` : ''}${i.ovr ? ` · override: ${i.ovr}` : ''}`,
                b:
                  i.kind === 'access'
                    ? i.verified
                      ? 'Revoked'
                      : i.done
                        ? 'Scheduled'
                        : 'Open'
                    : i.done
                      ? 'Done'
                      : 'Open',
                d: i.kind,
              })),
            },
            {
              h: 'Staff history',
              text: 'The Staff record stays; only its login is deactivated. Attendance, commissions and audit history are preserved. Leave payout, if any, is entered as a Staff payroll line item for the final run.',
            },
          ],
          hasActs: a.offboard && x.status !== 'Completed',
          acts: [
            btn('dx:tasks', 'Create linked tasks'),
            btn('dx:access', 'Revoke access'),
            btn('dx:asset', 'Confirm asset return'),
            btn('dx:final', 'Link final payroll'),
            btn('dx:docs', 'Generate documents'),
            btn('dx:item', 'Mark item done'),
            btn('dx:complete', 'Complete', 'primary'),
          ],
          ref: {
            id: x.id,
            open: it
              .map((i, n) => ({ n, t: i.t, done: i.done, kind: i.kind }))
              .filter(
                (y) => !y.done && !['access', 'payroll'].includes(y.kind),
              ),
            period: dayKey(x.lastDay, 'UTC').slice(0, 7),
          },
        };
      }
      case 'audit': {
        const L = await this.X.db.ppAudit.findMany({
          where: {
            businessId: d.a.rootId,
            ...(id && id !== 'all' ? { entityId: id } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: 120,
        });
        return {
          ...o,
          kicker: 'Audit log · append-only',
          title: 'People & Payroll',
          sections: [
            {
              h: `Most recent (${L.length})`,
              items: L.length
                ? L.map((x) => ({
                    a: x.action,
                    c: `${x.actorName} · ${d.fmt.dtm(x.createdAt)}`,
                    b: x.correlation,
                    d: x.detail.slice(0, 160),
                  }))
                : [{ a: 'No actions yet', c: '', b: '', d: '' }],
            },
          ],
        };
      }
      default:
        return null;
    }
  }

  private kpi(d: Data, k: string) {
    const X = this.X;
    const o = this.base();
    const st = (L: Data['emps']) =>
      L.map((e) => ({
        a: e.name,
        c: `${e.title} · ${e.dept || 'No department'} · ${X.brName(d, e.branchId)}`,
        b: e.status,
        d: e.type,
      }));
    const in60 = (x: Date | null) => {
      const n = X.off(d, x);
      return n != null && n >= 0 && n <= 60;
    };
    const M: Record<
      string,
      [string, string, { a: string; c: string; b: string; d: string }[]]
    > = {
      'o:head': [
        'Headcount',
        'Active Staff records in your scope (Staff is the source).',
        st(X.staffV(d)),
      ],
      'o:active': [
        'Active employees',
        'Active + probation Staff records.',
        st(
          X.staffV(d).filter((e) => ['Active', 'Probation'].includes(e.status)),
        ),
      ],
      'o:ctr': [
        'Contracts & probation ending',
        'Contract end or probation end within 60 days, from payroll profiles.',
        st(
          X.staffV(d).filter(
            (e) =>
              in60(e.contractEnd) ||
              (e.status === 'Probation' && in60(e.probationEnd)),
          ),
        ),
      ],
      'r:tth': [
        'Time to hire',
        'Days from application to hire, last 90 days.',
        d.cands
          .filter((c) => c.stage === 'Hired' && c.decidedAt)
          .map((c) => ({
            a: c.name,
            c: X.job(d, c.jobId)?.title ?? '',
            b: `${diffDays(dayKey(c.decidedAt!, d.tz), dayKey(c.appliedAt, d.tz))} d`,
            d: '',
          })),
      ],
      'r:acc': [
        'Offer acceptance',
        'Accepted ÷ (accepted + declined) offers.',
        d.offers
          .filter((x) => ['Accepted', 'Declined'].includes(x.status))
          .map((x) => ({
            a: x.number,
            c: X.candName(d, x.candidateId),
            b: x.status,
            d: '',
          })),
      ],
      'b:exp': [
        'Expiring benefits',
        'Rule versions ending within 60 days.',
        d.rules
          .filter((r) =>
            r.versions.some(
              (v) =>
                v.to &&
                diffDays(v.to, d.today) >= 0 &&
                diffDays(v.to, d.today) <= 60,
            ),
          )
          .map((r) => ({ a: r.name, c: r.number, b: r.status, d: '' })),
      ],
      'b:act': [
        'Active rules',
        'Rules with a version in force today.',
        d.rules
          .filter((r) => r.status === 'Active')
          .map((r) => ({
            a: r.name,
            c: r.method,
            b: `${r.assigned.length} assigned`,
            d: '',
          })),
      ],
    };
    const x = M[k] ?? [k, 'Shown on the screen it opens.', []];
    return {
      ...o,
      kicker: `Metric · ${d.s.branch ? X.brName(d, d.s.branch) : 'all branches'} · updated ${d.fmt.dtm(d.now)}`,
      title: x[0],
      sections: [
        { h: 'Definition', text: x[1] },
        { h: `Records (${x[2].length})`, items: x[2].length ? x[2] : none },
      ],
    };
  }

  private async calc(d: Data, id: string) {
    const X = this.X;
    const a = d.a;
    const o = this.base();
    const [runId, uid] = id.includes('|') ? id.split('|') : ['', id];
    const r = runId ? d.runs.find((x) => x.id === runId) : null;
    let c: Calc | null = null;
    if (r)
      c =
        (r.lines.find((l) => l.userId === uid)?.calc as unknown as Calc) ??
        null;
    else {
      const i = (await X.inputs(d, d.period)).get(uid);
      if (i) c = X.calc(d, i, X.taxTable(d));
    }
    if (!c)
      return {
        ...o,
        title: X.name(d, uid),
        sections: [
          {
            h: 'Not in payroll',
            text: 'This person has no calculation for the period.',
          },
        ],
      };
    const sal =
      a.salary || (uid === a.userId && !!r && RUN_FINAL.includes(r.status));
    const m = (v: number | null) =>
      v == null ? 'Cannot calculate' : d.fmt.money(v);
    const snap = r?.snapshot as unknown as { hash?: string } | null;
    return {
      ...o,
      kicker: `Calculation · ${r ? r.number : 'preview (not a run)'} · ${c.ver} · ${c.taxVer}`,
      title: X.name(d, uid),
      badges: c.warn.map((w) => ({
        t: `! ${w}`,
        bg: '#FEF3F2',
        fg: '#B42318',
      })),
      sections: sal
        ? [
            {
              h: 'Source inputs (snapshot)',
              kv: [
                KV('Pay basis', c.inp.basis ?? 'Not set'),
                KV('Rate', c.inp.rate == null ? 'Not set' : m(c.inp.rate)),
                KV('Hours (attendance)', c.inp.hours || '—'),
                KV('Overtime hours', c.inp.ot),
                KV(
                  'Timesheet',
                  c.inp.tsOk
                    ? 'Approved in Staff'
                    : c.inp.tsNeeded
                      ? 'Not approved'
                      : 'Not needed',
                ),
                KV(
                  'Commission (Staff)',
                  `${m(c.inp.comm)}${c.inp.commPaidOutside ? ' · paid in Staff' : ''}`,
                ),
                KV('Tips', 'Not tracked'),
                KV(
                  'Outstanding advances (Staff)',
                  m(c.inp.advances.reduce((s, x) => s + x.amount, 0)),
                ),
                KV('Unpaid leave days', c.inp.unpaid),
                KV('Tax profile', c.inp.taxp ?? 'Missing'),
                KV('Snapshot', snap?.hash ?? 'live preview'),
              ],
            },
            {
              h: 'Earnings',
              kv: [
                KV(`Regular · ${c.f.regular}`, m(c.regular)),
                KV(`Overtime · ${c.f.ot}`, m(c.ot)),
                KV(`Leave impact · ${c.f.leave}`, m(c.leaveImp)),
                KV(`Commission · ${c.f.comm ?? ''}`, m(c.comm)),
                KV('Additions (Staff line items)', m(c.bonus)),
                KV('Allowances (rules)', m(c.allow)),
                KV('Gross', m(c.gross)),
              ],
            },
            {
              h: 'Deductions & tax',
              kv: [
                KV(`Pre-tax · ${c.f.pf}`, m(c.pre)),
                KV(`Income tax · ${c.f.tax}`, m(c.tax)),
                KV('Post-tax deductions', m(c.post)),
                KV(
                  `Advance recovery${c.advIds.length ? ` (${c.advIds.length})` : ''}`,
                  m(c.adv),
                ),
                KV('Net pay', m(c.net)),
              ],
            },
            {
              h: 'Employer contributions',
              kv: [
                ...c.lines
                  .filter((x) => x.kind === 'employer')
                  .map((x) => KV(x.name, m(x.amount))),
                KV('Employer cost', m(c.cost)),
              ],
            },
          ]
        : [
            {
              h: 'Restricted',
              text: '🔒 Salary details are not sent to your browser for your role.',
            },
          ],
    };
  }

  private slip(d: Data, id: string) {
    const X = this.X;
    const a = d.a;
    const o = this.base();
    const [rid, uid] = id.split('|');
    const r = d.runs.find((x) => x.id === rid);
    const l = r?.lines.find((x) => x.userId === uid);
    if (
      !r ||
      !l ||
      !l.slipStatus ||
      (uid !== a.userId && !a.salary && !a.payroll)
    )
      return {
        ...o,
        title: 'Not available',
        sections: [
          {
            h: 'Restricted',
            text: 'Payslips are visible to payroll roles and the employee only.',
          },
        ],
      };
    const c = l.calc as unknown as Calc;
    const e = X.emp(d, uid);
    const m = (v: number | null) => d.fmt.money(v);
    return {
      ...o,
      kicker: `Payslip · ${r.number} · from finalized ${r.number}`,
      title: `${X.name(d, uid)} · ${periodLabel(r.period)}`,
      badges: [B(l.slipStatus)],
      sections: [
        {
          h: 'Employer',
          text: `${d.biz.name}${d.biz.address ? ` · ${d.biz.address}` : ''}`,
        },
        {
          h: 'Employee',
          kv: [
            KV('Name', X.name(d, uid)),
            KV('Title', e?.title),
            KV('Department', e?.dept || '—'),
            KV('Pay period', periodLabel(r.period)),
            KV('Pay date', X.dday(d, dayKey(r.payDate, 'UTC'))),
          ],
        },
        {
          h: 'Earnings',
          kv: [
            KV('Basic / regular', m(c.regular)),
            KV('Overtime', m(c.ot)),
            KV('Commission', m(c.comm)),
            KV('Additions', m(c.bonus)),
            KV('Allowances', m(c.allow)),
            ...(c.leaveImp ? [KV('Unpaid leave', m(c.leaveImp))] : []),
            KV('Gross', m(c.gross)),
          ],
        },
        {
          h: 'Deductions',
          kv: [
            ...c.lines
              .filter((x) => x.kind === 'pre-tax' || x.kind === 'post-tax')
              .map((x) => KV(x.name, m(x.amount))),
            KV('Income tax', m(c.tax)),
            KV('Advance recovery', m(c.adv)),
            KV('Net pay', m(c.net)),
          ],
        },
        {
          h: 'Footer',
          text: `Computed with ${c.ver} and ${c.taxVer}. This payslip reflects the finalized payroll run and cannot be edited.`,
        },
      ],
      hasActs: true,
      acts: [btn('ds:dl', 'Download PDF', 'primary')],
      ref: { runId: rid, uid },
    };
  }
}
