import { HttpStatus, Injectable } from '@nestjs/common';
import { btn } from '../payments/pay-vm';
import { AmActor, AmContextService, amErr, num } from './am-context.service';
import { AAsset, AmDataService, AmScope, Data } from './am-data.service';
import { AmViewsService } from './am-views.service';
import {
  AM_CONDC,
  AM_CRITC,
  AM_CST,
  AM_ERRORS,
  DONE_WO,
  WO_T,
} from './am.constants';

type Item = { a: string; c: string; b: string; d: string };
const B = (t: string, bg?: string, fg?: string) => ({
  t,
  bg: bg ?? '#F2F4F7',
  fg: fg ?? '#344054',
});
const KV = (k: string, v: unknown) => ({
  k,
  v:
    v == null || v === ''
      ? '—'
      : typeof v === 'string'
        ? v
        : typeof v === 'number' || typeof v === 'boolean'
          ? String(v)
          : JSON.stringify(v),
});
const none = (a = 'None'): Item[] => [{ a, c: '', b: '', d: '' }];

/** Record drawers and KPI drill-downs (assets-ui.js vDrawer + kpiClick lists), all from real rows. */
@Injectable()
export class AmDrawersService {
  constructor(
    private readonly ctx: AmContextService,
    private readonly data: AmDataService,
    private readonly views: AmViewsService,
  ) {}

  private base = {
    badges: [] as unknown[],
    sections: [] as unknown[],
    hasActs: false,
    acts: [] as unknown[],
  };

  async drawer(a: AmActor, s: AmScope, kind: string, id: string, tab?: string) {
    const d = await this.data.load(a, s);
    switch (kind) {
      case 'asset':
        return this.asset(d, id);
      case 'req':
        return this.req(d, id);
      case 'wo':
        return this.wo(d, id, tab || 'overview');
      case 'pm':
        return this.pm(d, id);
      case 'hist':
        return this.hist(d, id);
      case 'list':
        return this.list(d, id);
      case 'fresh':
        return this.fresh(d);
      case 'audit':
        return this.audit(d);
      default:
        throw amErr(
          AM_ERRORS.NOT_FOUND,
          'Unknown drawer',
          HttpStatus.NOT_FOUND,
        );
    }
  }

  private mustAsset(d: Data, id: string) {
    const x = this.data.A(d, id);
    if (!x || !d.ids.has(x.id))
      throw amErr(AM_ERRORS.NOT_FOUND, 'ASSET_NOT_FOUND', HttpStatus.NOT_FOUND);
    return x;
  }
  private st(t: string) {
    const c = AM_CST[t] ?? ['#344054', '#F2F4F7'];
    return B(t, c[1], c[0]);
  }
  private crit(t: string) {
    const c = AM_CRITC[t] ?? AM_CRITC.Medium;
    return B(t, c[1], c[0]);
  }

  asset(d: Data, id: string) {
    const x = this.mustAsset(d, id);
    const h = this.data.health(d, x);
    const n = this.data.nextDue(d, x.id);
    const cc = AM_CONDC[x.condition] ?? AM_CONDC.Unknown;
    const open = [
      ...this.data.openReqs(d, x.id).map((r) => ({
        a: `${r.number} · ${r.title}`,
        c: r.priority,
        b: r.status,
        d: '',
      })),
      ...this.data.openWOs(d, x.id).map((w) => ({
        a: `${w.number} · ${w.type}`,
        c: w.priority,
        b: w.status,
        d: '',
      })),
    ];
    return {
      ...this.base,
      kicker: 'Asset summary',
      title: `${x.number} · ${x.name}`,
      badges: [
        this.st(x.status),
        B(x.condition, cc[1], cc[0]),
        this.crit(x.criticality),
      ],
      sections: [
        {
          h: `Health ${h.score ?? '—'} · ${h.band}`,
          items: h.factors.map((f) => ({
            a: f[0],
            c: '',
            b: `${f[1] > 0 ? '+' : ''}${f[1]}`,
            d: '',
          })),
        },
        {
          h: 'Where & who',
          kv: [
            KV('Location', this.data.locPath(d, x.locationId, x.branchId)),
            KV('Owner', this.data.ownerLabel(d, x)),
            KV('Team', this.data.person(d, x.teamId)),
            KV(
              'Next maintenance',
              n ? `${n.name} · ${d.fmt.rel(n.nextDueOn ?? d.now)}` : '—',
            ),
          ],
        },
        { h: 'Open work', items: open.length ? open : none() },
      ],
      hasActs: true,
      acts: [
        btn('dr-open', 'Open asset', 'primary'),
        ...(d.a.pm ? [btn('dr-sched', 'Schedule maintenance')] : []),
      ],
      ctxId: x.id,
    };
  }

  req(d: Data, id: string) {
    const r = d.requests.find((z) => z.id === id);
    if (!r || !d.ids.has(r.assetId))
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'Request not found',
        HttpStatus.NOT_FOUND,
      );
    const x = this.data.A(d, r.assetId)!;
    const m = this.data.meterNow(d, x.id);
    const prior = d.requests.filter((z) => z.assetId === x.id && z.id !== r.id);
    const wo = r.woId ? d.wos.find((w) => w.id === r.woId) : null;
    const photos = d.docs.filter(
      (z) =>
        z.assetId === x.id &&
        z.type === 'Photo' &&
        Math.abs(z.createdAt.getTime() - r.createdAt.getTime()) < 10 * 60000,
    );
    return {
      ...this.base,
      kicker: `Maintenance request · ${r.number}`,
      title: r.title,
      badges: [
        this.st(r.status),
        this.crit(r.priority),
        ...(r.safety ? [B('⚠ Safety concern', '#FEF3F2', '#B42318')] : []),
        ...(r.down ? [B('● Asset down', '#FEF3F2', '#B42318')] : []),
      ],
      sections: [
        {
          h: 'Issue',
          text: `${r.issueType} — ${r.description ?? 'No description.'}\nObserved condition: ${r.observed ?? '—'}${r.preferredOn ? `\nPreferred date: ${d.fmt.day(r.preferredOn)}` : ''}`,
        },
        {
          h: 'Asset',
          kv: [
            KV('Asset', `${x.number} · ${x.name}`),
            KV('Location', this.data.locPath(d, x.locationId, x.branchId)),
            KV('Criticality', x.criticality),
            KV(
              'Meter',
              m
                ? `${num(m.value).toLocaleString()} ${x.meterUnit ?? ''} (${d.fmt.rel(m.takenAt)})`
                : '—',
            ),
          ],
        },
        {
          h: 'People',
          kv: [
            KV('Reporter', this.data.person(d, r.reporterId)),
            KV('Triage owner', this.data.person(d, r.triageId)),
            KV('Created', d.fmt.dtm(r.createdAt)),
            KV('Linked work order', wo?.number ?? '—'),
          ],
        },
        ...(r.notes.length
          ? [
              {
                h: 'Triage notes',
                items: r.notes.map((n) => ({
                  a: n.text,
                  c: `${this.data.person(d, n.byUserId)} · ${d.fmt.dtm(n.createdAt)}`,
                  b: '',
                  d: '',
                })),
              },
            ]
          : []),
        {
          h: 'Evidence',
          items: photos.length
            ? photos.map((p) => ({
                a: p.name,
                c: 'Photo · stored on the asset',
                b: '',
                d: '',
              }))
            : none('No evidence attached.'),
        },
        {
          h: 'Earlier requests on this asset',
          items: prior.length
            ? prior.map((z) => ({
                a: `${z.number} · ${z.title}`,
                c: d.fmt.day(z.createdAt),
                b: z.status,
                d: '',
              }))
            : none(),
        },
      ],
      hasActs: true,
      acts: this.views
        .reqActs(d, r)
        .filter((t) => t !== 'View')
        .slice(0, 4)
        .map((t, i) => btn(`ra:${t}`, t, i === 0 ? 'primary' : 'ghost')),
    };
  }

  async wo(d: Data, id: string, t: string) {
    const w = d.wos.find((z) => z.id === id);
    if (!w || !d.ids.has(w.assetId))
      throw amErr(
        AM_ERRORS.NOT_FOUND,
        'Work order not found',
        HttpStatus.NOT_FOUND,
      );
    const x = this.data.A(d, w.assetId)!;
    const dts = d.down.filter((z) => z.woId === w.id);
    const src = w.requestId
      ? (d.requests.find((r) => r.id === w.requestId)?.number ?? 'Request')
      : w.pmPlanId
        ? (d.plans.find((p) => p.id === w.pmPlanId)?.name ?? 'PM plan')
        : 'Direct';
    const od = this.data.woOverdue(d, w);
    const bills = await this.views.billsFor(
      d,
      w.costs.map((c) => c.finBillId),
    );
    const audit = await this.ctx.db.amAudit.findMany({
      where: { businessId: d.a.rootId, entityId: w.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    // Field jobs on the same asset, and the Field Service request raised from this work order.
    const [fsJobs, fsReq] = await Promise.all([
      this.ctx.db.fsWorkOrder.findMany({
        where: { businessId: d.a.rootId, assetId: w.assetId },
        select: { number: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.ctx.db.fsRequest.findFirst({
        where: {
          businessId: d.a.rootId,
          channel: 'Assets & Maintenance',
          sourceRef: w.number,
        },
        select: { number: true, status: true },
      }),
    ]);
    const tabs: Record<string, unknown[]> = {
      overview: [
        {
          h: 'Scope',
          text:
            w.scope + (w.workDone ? `\n\nWork performed: ${w.workDone}` : ''),
        },
        {
          h: 'Details',
          kv: [
            KV('Asset', `${x.number} · ${x.name}`),
            KV('Type', w.type),
            KV('Assignee', this.data.assignee(d, w)),
            KV('Due', `${d.fmt.day(w.dueAt)}${od ? ' · OVERDUE' : ''}`),
            KV('Scheduled', w.scheduledAt ? d.fmt.dtm(w.scheduledAt) : '—'),
            KV('Source', src),
            KV(
              'Approved by',
              w.approvedById
                ? this.data.person(d, w.approvedById)
                : w.status === 'Draft'
                  ? 'Awaiting approval'
                  : '—',
            ),
            KV('Outcome', w.outcome),
            KV('Safety', w.safety ? 'Safety concern' : 'No'),
            KV('Version', `v${w.version}`),
          ],
        },
        {
          h: 'Allowed next steps',
          text: (WO_T[w.status] ?? []).join(' · ') || 'None — final state',
        },
        {
          h: 'Field Service',
          text: [
            fsReq
              ? `Handed to Field Service as ${fsReq.number} (${fsReq.status}).`
              : 'Not linked. Customer-owned equipment can be dispatched as a field job with “Link to Field Service”.',
            fsJobs.length
              ? `Field jobs on this asset: ${fsJobs.map((j) => `${j.number} ${j.status}`).join(' · ')}`
              : 'No field jobs on this asset yet.',
          ].join('\n'),
        },
      ],
      checklist: [
        {
          h: 'Checklist',
          items: w.checklist.length
            ? w.checklist.map((c) => ({
                a: `${c.done ? '☑' : '☐'} ${c.text}`,
                c:
                  c.done && c.doneById
                    ? `${this.data.person(d, c.doneById)} · ${c.doneAt ? d.fmt.dtm(c.doneAt) : ''}`
                    : '',
                b: c.done ? 'Done' : '',
                d: '',
                id: c.id,
              }))
            : none('No checklist'),
        },
      ],
      parts: [
        {
          h: 'Parts (Inventory)',
          items: w.parts.length
            ? w.parts.map((p) => {
                const pr = d.products.get(p.productId);
                return {
                  a: pr?.name ?? 'Removed product',
                  c: `Planned ${p.planned} · issued ${p.issued} · used ${p.used} · returned ${p.returned} · on hand ${pr?.stock ?? '—'}`,
                  b:
                    p.moves
                      .map(
                        (m) =>
                          `SM-${m.stockMovementId.slice(0, 8)} (${m.qty > 0 ? '+' : ''}${m.qty})`,
                      )
                      .join(', ') || 'No movement',
                  d: p.issued ? '' : 'Planned — no stock moved',
                  id: p.id,
                };
              })
            : none('No parts planned'),
        },
        {
          h: 'Rule',
          text: 'Planning a part never moves stock. Stock moves only when parts are issued (or returned) here — each movement is a real Inventory record and posts to Finance as Repairs & Maintenance.',
        },
      ],
      labor: [
        {
          h: 'Labor',
          items: w.labor.length
            ? w.labor.map((l) => ({
                a: this.data.person(d, l.userId),
                c: `${num(l.hours)} h`,
                b: d.a.cost
                  ? l.rate != null
                    ? `${d.fmt.money(num(l.rate))}/h`
                    : 'Hourly rate not set'
                  : '',
                d: d.fmt.dtm(l.createdAt),
              }))
            : none('No labor logged'),
        },
        {
          h: 'How labor is costed',
          text: 'Hours × the person’s hourly rate from Staff. People without a rate are logged with hours only. Labor is already paid through payroll, so it isn’t posted to Finance again.',
        },
      ],
      downtime: [
        {
          h: 'Downtime',
          items: dts.length
            ? dts.map((z) => ({
                a: `${z.kind} · ${z.cause}`,
                c: `${d.fmt.dtm(z.startAt)} → ${z.endAt ? d.fmt.dtm(z.endAt) : 'ongoing'}`,
                b: this.data.fmtH(this.data.dHours(d, z)),
                d: z.impact ?? '',
              }))
            : none(
                `None recorded · expected ${w.expectedDownH ? num(w.expectedDownH) : 0} h`,
              ),
        },
      ],
      costs: [
        {
          h: 'Cost references',
          items: !d.a.cost
            ? none('🔒 Restricted for your role')
            : w.costs.length
              ? w.costs.map((c) => ({
                  a: `${c.type}${c.note ? ` · ${c.note}` : ''}`,
                  c: this.views.finText(c, bills),
                  b: d.fmt.money(num(c.amount)),
                  d: '',
                  id: c.id,
                }))
              : none('No costs yet'),
        },
      ],
      timeline: [
        {
          h: 'Timeline',
          items: [
            ...audit.map((z) => ({
              a: z.action,
              c: `${z.actorName} · ${d.fmt.dtm(z.createdAt)}`,
              b: '',
              d: z.detail,
            })),
          ].concat(audit.length ? [] : none('No activity yet')),
        },
      ],
    };
    const T = [
      'overview',
      'checklist',
      'parts',
      'labor',
      'downtime',
      'costs',
      'timeline',
    ];
    const cur = T.includes(t) ? t : 'overview';
    return {
      ...this.base,
      kicker: `Work order · ${w.number}`,
      title: x.name,
      badges: [
        this.st(w.status),
        this.crit(w.priority),
        B(
          `Due ${d.fmt.day(w.dueAt)}`,
          od ? '#FEF3F2' : undefined,
          od ? '#B42318' : undefined,
        ),
      ],
      tabs: T.map((k) => ({
        k,
        t: k[0].toUpperCase() + k.slice(1),
        on: k === cur,
      })),
      sections: tabs[cur],
      hasActs: true,
      acts: this.views
        .woActs(d, w)
        .filter((z) => z !== 'View')
        .slice(0, 5)
        .map((z, i) => btn(`wa:${z}`, z, i === 0 ? 'primary' : 'ghost')),
      checkable:
        cur === 'checklist' &&
        d.a.start &&
        !['Closed', 'Cancelled'].includes(w.status),
      returnable: cur === 'parts' && d.a.start && !DONE_WO.includes(w.status),
      linkable: cur === 'costs' && d.a.cost,
    };
  }

  pm(d: Data, id: string) {
    const p = d.plans.find((z) => z.id === id);
    if (!p || !d.ids.has(p.assetId))
      throw amErr(AM_ERRORS.NOT_FOUND, 'Plan not found', HttpStatus.NOT_FOUND);
    const x = this.data.A(d, p.assetId)!;
    const m = this.data.meterNow(d, x.id);
    const n = this.data.dueDay(d, p);
    return {
      ...this.base,
      kicker: `PM plan · ${p.number}`,
      title: p.name,
      badges: [this.st(p.status), B(p.trigger)],
      sections: [
        {
          h: 'Schedule',
          kv: [
            KV('Asset', `${x.number} · ${x.name}`),
            KV('Template', this.data.tplName(d, p.templateId)),
            KV(
              'Interval',
              p.trigger === 'Meter'
                ? `Every ${p.interval} ${x.meterUnit ?? ''}`
                : `Every ${p.interval} ${p.unit}${p.trigger === 'Hybrid' ? ` or ${num(p.meterInterval)} ${x.meterUnit ?? ''}` : ''}`,
            ),
            KV('Tolerance', p.tolerance),
            KV(
              'Next due',
              `${p.nextDueOn ? d.fmt.day(p.nextDueOn) : ''}${p.nextDueMeter != null ? `${p.nextDueOn ? ' or ' : ''}${num(p.nextDueMeter).toLocaleString()} ${x.meterUnit ?? ''}` : ''}${n != null ? ` (${n < 0 ? `${-n}d overdue` : n === 0 ? 'today' : `in ${n}d`})` : ''}`,
            ),
            KV(
              'Current meter',
              m ? `${num(m.value).toLocaleString()} ${x.meterUnit ?? ''}` : '—',
            ),
            KV('Responsible', this.data.assignee(d, p)),
            KV(
              'Auto-create',
              p.autoCreate
                ? `Yes, ${p.leadDays} days ahead`
                : 'No — remind only',
            ),
            KV('Last done', p.lastDoneOn ? d.fmt.day(p.lastDoneOn) : '—'),
          ],
        },
        {
          h: 'Due instances (idempotency keys)',
          items: p.instances.length
            ? p.instances.map((i) => ({
                a: i.key,
                c: d.wos.find((w) => w.id === i.woId)?.number ?? '—',
                b: i.status,
                d: d.fmt.dtm(i.createdAt),
              }))
            : none('None generated yet'),
        },
      ],
      hasActs: d.a.pm && p.status === 'Active',
      acts: [
        btn('pm-gen', 'Generate work order', 'primary'),
        ...(p.trigger !== 'Meter' ? [btn('pm-resched', 'Reschedule')] : []),
      ],
    };
  }

  hist(d: Data, id: string) {
    const e = d.events.find((z) => z.id === id.replace(/^ev:/, ''));
    if (!e || !d.ids.has(e.assetId))
      throw amErr(AM_ERRORS.NOT_FOUND, 'Event not found', HttpStatus.NOT_FOUND);
    const x = this.data.A(d, e.assetId)!;
    const extra = (e.extra ?? {}) as Record<string, unknown>;
    return {
      ...this.base,
      kicker: e.type,
      title: `${x.number} · ${x.name}`,
      badges: [B(e.result ?? '—'), B('Assets & Maintenance')],
      sections: [
        { h: 'Summary', text: e.summary },
        {
          h: 'Details',
          kv: [
            KV('Date', d.fmt.dtm(e.occurredAt)),
            KV(
              'Performed by',
              this.data.person(d, e.byUserId ?? e.bySupplierId ?? e.byTeamId),
            ),
            KV('Condition', `${e.condBefore ?? '?'} → ${e.condAfter ?? '?'}`),
            KV('Work order', d.wos.find((w) => w.id === e.woId)?.number),
            ...(e.checklistRef ? [KV('Checklist', e.checklistRef)] : []),
            ...(e.score != null ? [KV('Score', e.score)] : []),
            ...(extra.recommendation
              ? [KV('Recommendation', extra.recommendation)]
              : []),
          ],
        },
        ...(e.findings
          ? [
              {
                h: 'Findings',
                text:
                  e.findings +
                  (e.critical ? '\n⚠ Marked critical finding' : ''),
              },
            ]
          : []),
      ],
      hasActs: d.a.request && e.result === 'Fail',
      acts: [btn('h-follow', 'Create follow-up request', 'primary')],
      ctxId: x.id,
      follow: e.findings ?? e.summary,
    };
  }

  // ── KPI drill-downs ───────────────────────────────────────────────────

  list(d: Data, key: string) {
    const a = d.a;
    const L = d.assets;
    const aRow = (x: AAsset): Item => ({
      a: `${x.number} · ${x.name}`,
      c: `${this.data.catName(d, x.categoryId)} · ${this.data.locShort(d, x)}`,
      b: x.status,
      d: '',
    });
    const out = (title: string, items: Item[], note?: string, h?: string) => ({
      ...this.base,
      kicker: 'Records',
      title,
      sections: [
        {
          h: h ?? 'Supporting records',
          items: items.length ? items : none('No records'),
        },
        ...(note ? [{ h: 'How this number is calculated', text: note }] : []),
      ],
    });
    const P0 = this.data.periodStart(d);
    if (key === 'k-wty' || key === 'r-wty')
      return out(
        'Warranty expiring · 90 days',
        L.filter((x) => {
          const n = this.data.wtyDays(d, x);
          return this.data.live(x) && n != null && n >= 0 && n <= 90;
        })
          .sort((x, y) => this.data.wtyDays(d, x)! - this.data.wtyDays(d, y)!)
          .map((x) => ({
            a: `${x.number} · ${x.name}`,
            c: `${x.warrantyProvider ?? '—'} · ${x.warrantyType ?? '—'}`,
            b: d.fmt.day(x.warrantyEnd),
            d: '',
          })),
      );
    if (key === 'r-noloc')
      return out(
        'Assets without a location',
        L.filter((x) => !x.locationId).map(aRow),
      );
    if (key === 'k-due' || key === 'k-od') {
      const ps = d.plans
        .filter((p) => d.ids.has(p.assetId) && p.status === 'Active')
        .filter((p) => {
          const n = this.data.dueDay(d, p);
          return n != null && (key === 'k-od' ? n < 0 : n <= 30);
        })
        .sort((p, q) => this.data.dueDay(d, p)! - this.data.dueDay(d, q)!);
      return out(
        key === 'k-od' ? 'Overdue maintenance' : 'Maintenance due · 30 days',
        ps.map((p) => {
          const x = this.data.A(d, p.assetId)!;
          const n = this.data.dueDay(d, p)!;
          return {
            a: `${x.number} · ${x.name} — ${p.name}`,
            c: `${this.data.catName(d, x.categoryId)} · ${this.data.locShort(d, x)} · ${this.data.assignee(d, p)}`,
            b: n < 0 ? `${-n}d overdue` : n === 0 ? 'Today' : `in ${n}d`,
            d: `${x.criticality} criticality`,
          };
        }),
      );
    }
    if (key === 'k-down')
      return out(
        'Assets currently down',
        L.filter(
          (x) =>
            this.data.live(x) &&
            (this.data.isDown(d, x.id) ||
              ['Out of Service', 'Under Maintenance'].includes(x.status)),
        ).map((x) => ({
          ...aRow(x),
          d: d.down.find((z) => z.assetId === x.id && !z.endAt)?.cause ?? '',
        })),
      );
    if (key === 'k-cost' || key === 'a-cost') {
      if (!a.cost)
        throw amErr(
          AM_ERRORS.FORBIDDEN,
          'Cost is restricted for your role.',
          HttpStatus.FORBIDDEN,
        );
      const W = d.wos.filter(
        (w) =>
          d.ids.has(w.assetId) && w.completedAt && w.completedAt.getTime() > P0,
      );
      return out(
        `Maintenance cost · ${d.fmt.money(W.reduce((s, w) => s + this.data.woCost(w), 0))}`,
        W.map((w) => ({
          a: `${w.number} · ${this.data.A(d, w.assetId)?.name ?? ''}`,
          c:
            w.costs
              .map((c) => `${c.type} ${d.fmt.money(num(c.amount))}`)
              .join(' · ') || 'No costs',
          b: d.fmt.money(this.data.woCost(w)),
          d: '',
        })),
        `Sum of operational cost references on work orders completed in the last ${d.s.period} days. Finance holds the ledger.`,
      );
    }
    if (key === 'k-health')
      return out(
        'Asset health scores',
        L.filter((x) => this.data.live(x))
          .map((x) => {
            const h = this.data.health(d, x);
            return {
              a: `${x.number} · ${x.name}`,
              c: h.factors.map((f) => `${f[0]} ${f[1]}`).join(' · '),
              b: h.score == null ? 'Unknown' : String(h.score),
              d: h.band,
              s: h.score ?? 101,
            };
          })
          .sort((p, q) => p.s - q.s)
          .map(({ s: _s, ...r }) => r),
        'Score = condition score (Asset Settings › Condition) + penalties: open high/critical request −10 each, overdue PM −10 each, failure in 90 days −8 each, currently down −15, failed inspection in 30 days −5 each. Unknown condition is never scored.',
      );
    if (key === 'a-rep')
      return out(
        'Assets that failed more than once',
        L.map((x) => [x, this.data.metrics(d, x.id)] as const)
          .filter((z) => z[1].f >= 2)
          .map(([x, m]) => ({
            a: `${x.number} · ${x.name}`,
            c: m.events
              .filter((z) => z.kind === 'Unplanned')
              .map((z) => `${d.fmt.day(z.startAt)} ${z.cause}`)
              .join(' · '),
            b: `${m.f} failures`,
            d: '',
          })),
      );
    if (key === 'a-ratio' || key === 'a-pmc')
      return out(
        'Supporting work orders',
        d.wos
          .filter(
            (w) =>
              d.ids.has(w.assetId) &&
              w.completedAt &&
              w.completedAt.getTime() > P0,
          )
          .map((w) => ({
            a: `${w.number} · ${w.type}`,
            c: this.data.A(d, w.assetId)?.name ?? '',
            b: w.outcome ?? '—',
            d: '',
          })),
      );
    if (key.startsWith('down:')) {
      const aid = key.slice(5) === 'all' ? null : key.slice(5);
      const pu = d.s.f.an?.pu;
      const Ld = d.down
        .filter(
          (z) =>
            d.ids.has(z.assetId) &&
            (!aid || z.assetId === aid) &&
            this.data.inPeriod(d, z) &&
            (!pu || z.kind === pu),
        )
        .sort((p, q) => q.startAt.getTime() - p.startAt.getTime());
      const tot = Ld.reduce((s, z) => s + this.data.dHours(d, z, P0), 0);
      return {
        ...out(
          `${aid ? `${this.data.A(d, aid)?.number ?? ''} · ` : 'All assets · '}${this.data.fmtH(tot)}`,
          Ld.map((z) => ({
            a: `${this.data.A(d, z.assetId)?.number ?? ''} · ${z.kind} · ${z.cause}`,
            c: `${d.fmt.dtm(z.startAt)} → ${z.endAt ? d.fmt.dtm(z.endAt) : 'ongoing'} · ${d.wos.find((w) => w.id === z.woId)?.number ?? 'no WO'}`,
            b: this.data.fmtH(this.data.dHours(d, z, P0)),
            d: z.impact ?? '',
          })),
          'Duration = end − start (ongoing events count up to now), clipped to the selected period. Planned downtime is excluded from availability’s denominator.',
          `${Ld.length} events that sum to ${this.data.fmtH(tot)}`,
        ),
        kicker: `Downtime records · last ${d.s.period} days`,
      };
    }
    throw amErr(AM_ERRORS.NOT_FOUND, 'Unknown list', HttpStatus.NOT_FOUND);
  }

  async fresh(d: Data) {
    const fin = await this.ctx.db.finSettings
      .findUnique({
        where: { businessId: d.a.rootId },
        select: { lastSweepAt: true },
      })
      .catch(() => null);
    const evalAudit = await this.ctx.db.amAudit.findFirst({
      where: {
        businessId: d.a.rootId,
        action: { in: ['PM evaluator run', 'PM work order generated'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      ...this.base,
      kicker: 'Data freshness',
      title: 'Assets & Maintenance',
      sections: [
        {
          h: 'Sources',
          items: [
            {
              a: 'Assets, requests, work orders, plans, downtime',
              c: 'Live — read on every load',
              b: `Loaded ${d.fmt.dtm(d.now)}`,
              d: 'KPIs and downtime are computed from these records each time',
            },
            {
              a: 'PM due evaluator',
              c: 'Hourly job + “Run due evaluation now”',
              b: evalAudit
                ? `Last generated ${d.fmt.ago(evalAudit.createdAt)}`
                : 'Nothing generated yet',
              d: '',
            },
            {
              a: 'Inventory stock (parts)',
              c: 'Live',
              b: 'Read from Inventory products',
              d: '',
            },
            {
              a: 'Finance posting (parts → Repairs & Maintenance)',
              c: 'Finance sweep',
              b: fin?.lastSweepAt
                ? `Last sweep ${d.fmt.ago(fin.lastSweepAt)}`
                : 'Finance ledger not set up yet',
              d: '',
            },
            {
              a: 'Meter readings',
              c: 'Manual entry',
              b: 'Recorded by your team',
              d: 'Typed in, read from a photo of the meter, or captured when a work order is completed',
            },
          ],
        },
      ],
      hasActs: true,
      acts: [btn('dr-refresh', 'Refresh now', 'primary')],
    };
  }

  async audit(d: Data) {
    const L = await this.ctx.db.amAudit.findMany({
      where: { businessId: d.a.rootId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      ...this.base,
      kicker: 'Audit log',
      title: 'Assets & Maintenance',
      sections: [
        {
          h: 'Latest 100 actions (append-only)',
          items: L.length
            ? L.map((z) => ({
                a: z.action,
                c: `${z.actorName} · ${d.fmt.dtm(z.createdAt)}`,
                b: z.correlation,
                d: z.detail,
              }))
            : none('No actions yet'),
        },
      ],
    };
  }
}
