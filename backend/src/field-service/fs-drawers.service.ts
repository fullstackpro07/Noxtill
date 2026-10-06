import { Injectable } from '@nestjs/common';
import { btn } from '../payments/pay-vm';
import { FsActor, FsContextService, num } from './fs-context.service';
import { Data, FsDataService, FsScope } from './fs-data.service';
import { FsViewsService } from './fs-views.service';
import { DONE, OPEN, REQ_FINAL } from './fs.constants';
import { hh, mins } from './fs-time';

type Item = { a: string; c: string; b: string; d: string; id?: string };
type Section = {
  h: string;
  kv?: { k: string; v: string }[];
  items?: Item[];
  text?: string;
  bullets?: string[];
  warn?: string;
};

const K = (k: string, v: string | number | null | undefined) => ({
  k,
  v: v == null || v === '' ? '—' : String(v),
});
const none = (a = 'None'): Item[] => [{ a, c: '', b: '', d: '' }];

/** Record drawers (fs-ui.js vDrawer) — every value read from real rows. */
@Injectable()
export class FsDrawersService {
  constructor(
    private readonly ctx: FsContextService,
    private readonly data: FsDataService,
    private readonly views: FsViewsService,
  ) {}

  private B(st: string) {
    const c = this.views.chip(st);
    return { t: c.t, bg: c.bg, fg: c.fg };
  }
  private base(kicker: string, title: string) {
    return {
      kicker,
      title,
      badges: [] as { t: string; bg: string; fg: string }[],
      sections: [] as Section[],
      hasActs: false,
      acts: [] as ReturnType<typeof btn>[],
    };
  }

  async drawer(a: FsActor, s: FsScope, kind: string, id: string) {
    const d = await this.data.load(a, s);
    const m: Record<string, () => unknown> = {
      wo: () => this.wo(d, id),
      req: () => this.req(d, id),
      tech: () => this.tech(d, id),
      report: () => this.report(d, id),
      opt: () => this.opt(d),
      asset: () => this.asset(d, id),
      agr: () => this.agr(d, id),
      wrn: () => this.wrn(d, id),
      plan: () => this.plan(d, id),
      ins: () => this.ins(d, id),
      tpl: () => this.tpl(d, id),
      audit: () => this.audit(d),
      approvals: () => this.approvals(d),
      kpi: () => this.kpi(d, id),
      wrnasset: () =>
        this.asset(d, d.warranty.find((x) => x.id === id)?.assetId ?? ''),
    };
    const r = await (m[kind] ?? (() => null))();
    return (
      r ?? {
        ...this.base('Not found', 'This record no longer exists'),
        sections: [],
      }
    );
  }

  async wo(d: Data, id: string) {
    const w = this.data.W(d, id);
    if (!w || !this.data.woVisible(d, w)) return null;
    const x = w.assetId ? d.assets.get(w.assetId) : undefined;
    const ev = await this.views.events(d, w.id);
    return {
      ...this.base(
        `Work order · ${this.data.svName(d, w.serviceTypeId)}`,
        `${w.number} · ${this.data.cname(d, w.customerId)}`,
      ),
      badges: [
        this.B(w.status),
        this.B(this.data.slaSt(d, w)),
        this.B(this.data.ready(d, w)),
      ],
      sections: [
        {
          h: 'Summary',
          kv: [
            K('Scope', w.scope),
            K('Priority', w.priority),
            K('SLA', `${this.data.slaSt(d, w)} · ${this.data.slaText(d, w)}`),
            K('Window', this.data.win(d, w)),
            K('Technician', this.data.tname(d, w.techUserId)),
            K(
              'Site',
              `${this.data.addr(d, w.siteId, w.customerId)}${this.data.zoneOf(d, w) !== '—' ? `, ${this.data.zoneOf(d, w)}` : ''}`,
            ),
            K('Asset', x ? `${x.name} · ${x.serial || 'no serial'}` : '—'),
            K('Coverage', this.data.coverage(d, w)),
          ],
        },
        {
          h: 'Recent timeline',
          items: [...ev]
            .reverse()
            .slice(0, 5)
            .map((e) => ({
              a: e.text,
              c: `${e.byName} · ${d.fmt.dtm(e.createdAt)}`,
              b: '',
              d: '',
            })),
        },
      ],
      ref: {
        customerId: w.customerId,
        assetId: w.assetId,
        siteId: w.siteId,
        scope: w.scope,
        serviceTypeId: w.serviceTypeId,
        priority: w.priority,
        parts: w.parts.map((p) => ({
          id: p.id,
          productId: p.productId,
          name: this.data.partName(d, p.productId),
          left: p.issued - p.used - p.returned,
        })),
      },
      hasActs: true,
      acts: [
        btn('dw:full', 'Open full work order', 'primary'),
        ...this.views
          .woActs(d, w)
          .filter((v) => v !== 'Open')
          .slice(0, 4)
          .map((v) => btn(`dw:${v}`, v)),
      ],
    };
  }

  async req(d: Data, id: string) {
    const r = d.requests.find((x) => x.id === id || x.number === id);
    if (!r) return null;
    const x = r.assetId ? d.assets.get(r.assetId) : undefined;
    const sv = this.data.sv(d, r.serviceTypeId);
    const dup = d.requests.filter(
      (o) =>
        o.id !== r.id &&
        o.customerId === r.customerId &&
        o.assetId &&
        o.assetId === r.assetId &&
        !['Rejected', 'Duplicate'].includes(o.status),
    );
    const prior = r.assetId
      ? d.wos.filter((w) => w.assetId === r.assetId && DONE.includes(w.status))
      : [];
    const files = await this.ctx.db.fsFile.findMany({
      where: { businessId: d.a.rootId, requestId: r.id },
      select: { id: true, name: true },
    });
    const notes = Array.isArray(r.notes) ? (r.notes as string[]) : [];
    const acts = this.views.reqActs(d, r).filter((v) => v !== 'Open');
    return {
      ...this.base(
        `Service request · ${r.channel}`,
        `${r.number} · ${this.data.cname(d, r.customerId)}`,
      ),
      badges: [
        this.B(r.status),
        { t: r.priority, bg: '#F2F4F7', fg: '#344054' },
      ],
      sections: [
        {
          h: 'Request',
          kv: [
            K('Issue', r.issue),
            K('Site', this.data.addr(d, r.siteId, r.customerId)),
            K('Asset', x ? `${x.name} · ${x.serial || 'no serial'}` : '—'),
            K('Service type', sv?.name ?? 'Not set — set it during triage'),
            K('Preferred window', r.window),
            K('Entitlement', this.views.entitlement(d, r)),
            K('Source', `${r.channel} · ${r.sourceRef ?? '—'}`),
            K(
              'Photos',
              files.length ? files.map((f) => f.name).join(', ') : 'None',
            ),
            K(
              'Owner',
              r.ownerId ? this.data.tname(d, r.ownerId) : 'Unassigned',
            ),
            ...(r.outcome ? [K('Outcome', r.outcome)] : []),
          ],
        },
        {
          h: 'Triage checks (rules, not AI — review before using)',
          items: [
            ...(sv
              ? [
                  {
                    a: `Required skill: ${sv.skill}${sv.cert ? ` + ${sv.cert}` : ''}`,
                    c: 'Service-type default',
                    b: `${sv.durMin} min`,
                    d: '',
                  },
                ]
              : []),
            {
              a: `Priority: ${r.priority}`,
              c: `SLA from ${this.views.entitlement(d, r).startsWith('Agreement') ? this.views.entitlement(d, r) : 'standard policy'} · respond within ${(d.cfg.sla[r.priority] ?? [8])[0]} h`,
              b: '',
              d: '',
            },
            ...(dup.length
              ? [
                  {
                    a: `⚠ Possible duplicate / repeat: ${dup.map((o) => o.number).join(', ')}`,
                    c: 'Same customer and asset',
                    b: '',
                    d: '',
                  },
                ]
              : []),
            ...(prior.length
              ? [
                  {
                    a: `Prior jobs on this asset: ${prior.map((w) => w.number).join(', ')}`,
                    c: prior.some((w) => w.unresolved)
                      ? 'Includes an unresolved visit'
                      : 'All resolved',
                    b: '',
                    d: '',
                  },
                ]
              : []),
          ],
        },
        ...(notes.length ? [{ h: 'Notes', bullets: notes }] : []),
      ],
      ref: {
        preview: this.convertPreview(d, r),
        number: r.number,
        issue: r.issue,
        priority: r.priority,
        customerId: r.customerId,
        assetId: r.assetId,
      },
      hasActs: d.a.request && !REQ_FINAL.includes(r.status),
      acts: acts.map((v, i) =>
        btn(`dr:${v}`, v, i === 1 ? 'primary' : 'ghost'),
      ),
    };
  }

  /** Work-order preview shown before converting a request (fs-ui.js convert modal). */
  private convertPreview(d: Data, r: Data['requests'][number]) {
    const sv = this.data.sv(d, r.serviceTypeId);
    const x = r.assetId ? d.assets.get(r.assetId) : undefined;
    const tpl = sv?.templateId
      ? d.templates.find((t) => t.id === sv.templateId)
      : undefined;
    const g = this.data.activeAgreement(
      d,
      r.customerId,
      r.serviceTypeId,
      r.assetId,
    );
    const parts = ((sv?.partProductIds as string[]) ?? []).map((p) =>
      this.data.partName(d, p),
    );
    return [
      `Customer: ${this.data.cname(d, r.customerId)}`,
      `Site: ${this.data.addr(d, r.siteId, r.customerId)}`,
      `Asset: ${x ? `${x.name}${x.serial ? ` · ${x.serial}` : ''}` : '—'}`,
      sv
        ? `Service: ${sv.name} · ${sv.durMin} min · skill ${sv.skill}${sv.cert ? ` + ${sv.cert}` : ''}`
        : 'Service: not set — set it during triage',
      `Checklist: ${tpl ? `${tpl.name} v${tpl.version}` : 'none published'}`,
      `Parts template: ${parts.join(', ') || 'None'}`,
      `Coverage: ${g ? `${g.number} (${this.data.agrUsed(d, g)}/${g.visits} visits used)` : this.views.entitlement(d, r)}`,
      `SLA: ${r.priority} → respond ${g ? g.respH : (d.cfg.sla[r.priority] ?? [8])[0]} h`,
    ].join('\n');
  }

  tech(d: Data, id: string) {
    const t = this.data.tech(d, id);
    if (!t) return null;
    const dd = this.data
      .techDay(d, t.id, 0)
      .sort((x, y) => this.data.h(d, x)! - this.data.h(d, y)!);
    const lf = this.data.locFresh(d, t);
    const sh = this.data.shiftOn(d, t, 0);
    const ftf = this.data.ftfOf(d, t.id);
    const st = this.data.techStatus(d, t);
    return {
      ...this.base('Technician (Staff record)', t.name),
      badges: [this.B(st), ...(d.a.dispatch ? [this.B(lf.st)] : [])],
      sections: [
        {
          h: 'Profile',
          kv: [
            K('Skills', t.skills.join(', ') || 'None recorded'),
            K('Certifications', t.certs.join(', ') || 'None'),
            K('Territories', t.zones.join(', ') || 'None'),
            K(
              'Shift today',
              sh
                ? `${hh(sh[0])}–${hh(sh[1])} (${this.data.shiftSource(d, t)})`
                : `No shift (${this.data.shiftSource(d, t)})`,
            ),
            K(
              'First-time fix',
              ftf
                ? `${Math.round(ftf.v * 100)}% of ${ftf.n} jobs`
                : 'Not enough history',
            ),
            K(
              'Location',
              d.a.dispatch
                ? t.lastZone
                  ? `${t.lastZone} · ${lf.t}`
                  : 'No check-in yet'
                : '🔒 Restricted',
            ),
          ],
        },
        {
          h: 'Today',
          items: dd.length
            ? dd.map((o) => ({
                a: `${hh(this.data.h(d, o))} · ${o.number}`,
                c: `${this.data.cname(d, o.customerId)} · ${this.data.svName(d, o.serviceTypeId)}`,
                b: o.status,
                d: '',
              }))
            : none('No jobs'),
        },
      ],
      hasActs: d.a.dispatch,
      acts: [
        btn('dt:contact', 'Contact technician', 'primary'),
        btn('ext:staff', 'Open in Staff'),
      ],
    };
  }

  report(d: Data, id: string) {
    const w = this.data.W(d, id);
    if (!w || !this.data.woVisible(d, w)) return null;
    const tp = this.data.tplOf(d, w);
    const ans = this.data.answers(w);
    const L = d.labor.filter((l) => l.woId === w.id);
    return {
      ...this.base(
        'Service report · customer-safe',
        `${w.number} · ${this.data.svName(d, w.serviceTypeId)}`,
      ),
      badges: [this.B(w.status)],
      sections: [
        {
          h: 'Visit',
          kv: [
            K('Customer', this.data.cname(d, w.customerId)),
            K('Site', this.data.addr(d, w.siteId, w.customerId)),
            K('Asset', w.assetId ? d.assets.get(w.assetId)?.name : '—'),
            K('Technician', this.data.tname(d, w.techUserId)),
            K('Window', this.data.win(d, w)),
          ],
        },
        {
          h: 'Work performed',
          text: `${w.resolution || 'Resolution not entered yet.'}\nScope: ${w.scope}`,
        },
        {
          h: 'Checklist',
          items: tp
            ? this.data.tplItems(tp).map((it, i) => ({
                a: it.t,
                c: it.type,
                b:
                  ans[i] == null || ans[i] === ''
                    ? 'Pending'
                    : ans[i] === 'na'
                      ? 'N/A'
                      : ans[i] === 1
                        ? 'Passed'
                        : ans[i] === 0
                          ? 'Failed'
                          : String(ans[i]),
                d: '',
              }))
            : none('No checklist'),
        },
        {
          h: 'Parts used',
          items: w.parts.filter((p) => p.used).length
            ? w.parts
                .filter((p) => p.used)
                .map((p) => ({
                  a: this.data.partName(d, p.productId),
                  c: d.products.get(p.productId)?.sku ?? '',
                  b: `×${p.used}`,
                  d: '',
                }))
            : none(),
        },
        {
          h: 'Labor',
          text:
            L.map((l) => `${l.type} ${this.views.durOf(d, l).t}`).join(' · ') ||
            '—',
        },
        {
          h: 'Customer acknowledgement',
          text: w.signedBy
            ? `Signed by ${w.signedBy}. This confirms service was performed — it is not a payment receipt.`
            : 'Not signed yet.',
        },
        {
          h: 'Excluded from customer copy',
          bullets: [
            'Internal notes',
            'Technician scores',
            'Part costs and labor rates',
          ],
        },
      ],
      hasActs: true,
      acts: [
        btn(
          'rp:send',
          'Send via Unified Inbox',
          'primary',
          !d.a.request || !w.signedBy,
        ),
        btn('rp:pdf', 'Save to the job'),
      ],
    };
  }

  opt(d: Data) {
    const Q = this.data
      .wosV(d)
      .filter(
        (w) =>
          OPEN.includes(w.status) &&
          !w.techUserId &&
          !['Draft', 'Open', 'Awaiting Approval'].includes(w.status),
      );
    return {
      ...this.base(
        'Optimize suggestions · dispatcher confirms each one',
        `${Q.length} unassigned jobs`,
      ),
      sections: Q.length
        ? Q.map((w) => {
            const h = this.data.nextSlotAny(d, w, 0);
            const sg = this.data.suggest(d, w, 0, h).slice(0, 3);
            return {
              h: `${w.number} · ${this.data.svName(d, w.serviceTypeId)} · ${w.priority}`,
              items: sg.map((x) => ({
                a: `${x.t.name} · ${x.e.blocks.length ? 'Not eligible' : `${x.e.score}/100`}`,
                c: x.e.blocks.length
                  ? x.e.blocks[0]
                  : x.e.comps.map((c) => `${c[0]} ${c[1]}/${c[2]}`).join(' · '),
                b: hh(h),
                d: x.e.warns.join(' · '),
              })),
            };
          })
        : [
            {
              h: 'Queue',
              items: none(
                'Nothing to plan — every approved job has a technician',
              ),
            },
          ],
    };
  }

  asset(d: Data, id: string) {
    const x = d.assets.get(id);
    if (!x) return null;
    const si = this.data.site(d, d.eqSite.get(x.id));
    const ws = d.wos.filter((w) => w.assetId === x.id);
    const p = d.plans.find((q) => q.assetId === x.id && q.status === 'Active');
    const inW =
      !!x.warrantyEnd &&
      x.warrantyEnd >= new Date(d.now.toISOString().slice(0, 10));
    return {
      ...this.base(
        `Customer equipment · Assets & Maintenance ${x.number}`,
        x.name,
      ),
      badges: [
        {
          t: inW ? 'Under warranty' : 'No active warranty',
          bg: '#F2F4F7',
          fg: '#344054',
        },
      ],
      sections: [
        {
          h: 'Asset',
          kv: [
            K('Customer', this.data.cname(d, x.customerId)),
            K('Location', si ? `${si.address}, ${si.zone}` : 'Site not set'),
            K(
              'Make / model',
              [x.manufacturer, x.model].filter(Boolean).join(' '),
            ),
            K('Serial', x.serial || 'Not recorded'),
            K('Installed', x.installedOn?.toISOString().slice(0, 10)),
            K(
              'Warranty',
              x.warrantyEnd
                ? `${[x.warrantyProvider, x.warrantyType].filter(Boolean).join(' · ')} · until ${x.warrantyEnd.toISOString().slice(0, 10)}`
                : 'None',
            ),
            K(
              'Preventive plan',
              p
                ? `${p.name} · next ${this.data.planNext(d, p) != null ? this.data.dday(d, this.data.planNext(d, p)) : 'by meter'}`
                : 'None',
            ),
            K('Condition', x.condition),
          ],
        },
        {
          h: 'Service history',
          items: ws.length
            ? ws.map((w) => ({
                a: `${w.number} · ${this.data.svName(d, w.serviceTypeId)}`,
                c: `${w.startAt ? this.data.ddate(d, w.startAt) : 'not scheduled'} · ${this.data.tname(d, w.techUserId)}`,
                b: w.status,
                d: w.resolution ?? '',
              }))
            : none('No field jobs'),
        },
        {
          h: 'Documents',
          text: 'Manuals and warranty cards are attached to the asset in Assets & Maintenance.',
        },
      ],
      hasActs: true,
      acts: [
        btn('da:req', 'Create service request', 'primary', !d.a.request),
        btn('da:wo', 'Create work order', 'ghost', !d.a.workorder),
        btn(`ext:asset:${x.id}`, 'Open asset'),
      ],
    };
  }

  agr(d: Data, id: string) {
    const g = d.agreements.find((x) => x.id === id);
    if (!g) return null;
    const used = this.data.agrUsed(d, g);
    const ws = d.wos.filter((w) => w.agreementId === g.id);
    return {
      ...this.base(
        'Service agreement · entitlement',
        `${g.number} · ${this.data.cname(d, g.customerId)}`,
      ),
      badges: [this.B(this.data.agrStatus(d, g))],
      sections: [
        {
          h: 'Entitlement',
          kv: [
            K(
              'Signed contract',
              g.contractId
                ? `${d.contracts.get(g.contractId)?.number ?? 'Removed'} · ${d.contracts.get(g.contractId)?.status ?? '—'}`
                : 'Not linked',
            ),
            K(
              'Period',
              `${g.startOn.toISOString().slice(0, 10)} → ${g.endOn.toISOString().slice(0, 10)}`,
            ),
            K(
              'Visits',
              `${used} used of ${g.visits} · ${Math.max(0, g.visits - used)} remaining`,
            ),
            K('Frequency', g.freq),
            K('Response SLA', `${g.respH} h`),
            K('Resolution SLA', `${g.resH} h`),
            K('Labor', g.labor),
            K('Parts', g.parts),
            K(
              'Covered services',
              ((g.serviceTypeIds as string[]) ?? [])
                .map((s) => this.data.svName(d, s))
                .join(', '),
            ),
            K('Renewal', g.renewal),
          ],
        },
        {
          h: 'Jobs under this agreement',
          items: ws.length
            ? ws.map((w) => ({
                a: w.number,
                c: this.data.svName(d, w.serviceTypeId),
                b: w.status,
                d: w.startAt ? this.data.ddate(d, w.startAt) : '',
              }))
            : none(),
        },
        ...(used >= g.visits
          ? [
              {
                h: 'Limit',
                warn: 'All included visits are used. New visits are chargeable unless an agreement override is approved.',
              },
            ]
          : []),
      ],
      ref: {
        customerId: g.customerId,
        startOn: g.startOn.toISOString().slice(0, 10),
        endOn: g.endOn.toISOString().slice(0, 10),
        assetIds: g.assetIds,
        serviceTypeIds: g.serviceTypeIds,
        visits: g.visits,
        freq: g.freq,
        respH: g.respH,
        resH: g.resH,
        labor: g.labor,
        parts: g.parts,
        renewal: g.renewal,
        contractId: g.contractId,
        contractNumber: g.contractId
          ? (d.contracts.get(g.contractId)?.number ?? null)
          : null,
      },
      hasActs: d.a.agreement,
      acts: [
        btn('dg:Edit', 'Edit', 'primary'),
        ...(g.contractId ? [btn('dg:Open contract', 'Open contract')] : []),
      ],
    };
  }

  wrn(d: Data, id: string) {
    const x = d.warranty.find((y) => y.id === id || y.number === id);
    if (!x) return null;
    const as = d.assets.get(x.assetId);
    const prior = d.wos.filter(
      (w) => w.assetId === x.assetId && DONE.includes(w.status),
    );
    const ev = Array.isArray(x.evidence) ? (x.evidence as string[]) : [];
    const hist = Array.isArray(x.history) ? (x.history as string[]) : [];
    const inW =
      !!as?.warrantyEnd &&
      as.warrantyEnd >= new Date(d.now.toISOString().slice(0, 10));
    const st = this.views.wrnStatus(d, x);
    const acts = this.views.wrnActs(d, x).filter((v) => v !== 'Open');
    return {
      ...this.base('Warranty case', `${x.number} · ${x.issue}`),
      badges: [this.B(st), this.B(x.eligibility)],
      sections: [
        {
          h: 'Eligibility checks',
          items: [
            {
              a: 'Asset & serial',
              c: as
                ? `${as.serial || 'serial not recorded'} — ${as.serial ? 'recorded in Assets' : 'unverified'}`
                : '—',
              b: as?.serial ? '✓' : '?',
              d: '',
            },
            {
              a: 'Install date',
              c: as?.installedOn?.toISOString().slice(0, 10) ?? 'Not recorded',
              b: as?.installedOn ? '✓' : '?',
              d: '',
            },
            {
              a: 'Warranty period',
              c: `${x.source} · ends ${as?.warrantyEnd?.toISOString().slice(0, 10) ?? 'n/a'}`,
              b: inW ? '✓' : '✕',
              d: '',
            },
            {
              a: 'Prior repairs on asset',
              c: prior.map((w) => w.number).join(', ') || 'None',
              b: prior.some((w) => w.unresolved) ? '!' : '✓',
              d: '',
            },
          ],
        },
        { h: 'Evidence', bullets: ev.length ? ev : ['None attached'] },
        ...(x.note ? [{ h: 'Notes', text: x.note }] : []),
        {
          h: 'History',
          items: hist.length
            ? hist.map((h) => ({ a: h, c: '', b: '', d: '' }))
            : none(),
        },
      ],
      ref: {
        customerId: x.customerId,
        assetId: x.assetId,
        issue: x.issue,
        siteId: d.eqSite.get(x.assetId) ?? null,
      },
      hasActs: acts.length > 1,
      acts: acts.map((v, i) =>
        btn(`dy:${v}`, v, i === 1 ? 'primary' : 'ghost'),
      ),
    };
  }

  plan(d: Data, id: string) {
    const p = d.plans.find((x) => x.id === id);
    if (!p) return null;
    const n = this.data.planNext(d, p);
    const meter = p.assetId ? d.meters.get(p.assetId) : undefined;
    const gen = p.instances.filter((i) => i.woId);
    return {
      ...this.base('Preventive plan', p.name),
      badges: [this.B(p.status)],
      sections: [
        {
          h: 'Rule',
          kv: [
            K('Customer', this.data.cname(d, p.customerId)),
            K('Asset', p.assetId ? d.assets.get(p.assetId)?.name : 'Site-wide'),
            K('Service', this.data.svName(d, p.serviceTypeId)),
            K('Trigger', `${p.trigger} · ${p.freq}`),
            ...(p.trigger === 'Usage hours'
              ? [
                  K(
                    'Meter',
                    `${meter ?? 'no reading'} — due at ${num(p.nextDueMeter)} (Assets meter readings)`,
                  ),
                ]
              : [K('Next due', this.data.dday(d, n))]),
            K('Window', p.window),
            K('Auto-create WO', p.autoCreate ? 'Yes' : 'No'),
            K('Approval', p.approval ? 'Required' : 'No'),
          ],
        },
        {
          h: 'Generated work orders',
          items: gen.length
            ? gen.map((i) => {
                const w = d.wos.find((x) => x.id === i.woId);
                return {
                  a: w?.number ?? '—',
                  c: i.key.split(':').pop() ?? '',
                  b: w?.status ?? 'Removed',
                  d: '',
                };
              })
            : none('None yet'),
        },
      ],
      ref: {
        name: p.name,
        customerId: p.customerId,
        assetId: p.assetId,
        serviceTypeId: p.serviceTypeId,
        trigger: p.trigger,
        freq: p.freq,
        window: p.window,
        autoCreate: p.autoCreate,
        approval: p.approval,
        firstDueDays: Math.max(0, n ?? 0),
      },
      hasActs: d.a.plan,
      acts: [
        btn('dp:Generate WO', 'Generate WO', 'primary', p.status !== 'Active'),
        btn('dp:Edit', 'Edit'),
      ],
    };
  }

  ins(d: Data, id: string) {
    const i = d.inspections.find((x) => x.id === id);
    if (!i) return null;
    const tp = d.templates.find((t) => t.id === i.templateId);
    const w = d.wos.find((x) => x.id === i.woId);
    const ans = w ? this.data.answers(w) : [];
    return {
      ...this.base(
        `Inspection · ${tp ? `${tp.name} v${tp.version}` : '—'}`,
        `${i.number} · ${i.result}`,
      ),
      badges: [this.B(i.result)],
      sections: [
        {
          h: 'Context',
          kv: [
            K('Work order', w?.number),
            K('Asset', i.assetId ? d.assets.get(i.assetId)?.name : '—'),
            K('Technician', this.data.tname(d, i.techUserId)),
            K('Started', d.fmt.dtm(i.startedAt)),
            K('Completed', i.completedAt ? d.fmt.dtm(i.completedAt) : '—'),
            K(
              'Approved by',
              i.approvedById ? this.data.tname(d, i.approvedById) : '—',
            ),
          ],
        },
        {
          h: 'Answers',
          items: tp
            ? this.data.tplItems(tp).map((it, k) => ({
                a: it.t,
                c: `${it.type}${it.ev ? ' · evidence' : ''}`,
                b:
                  ans[k] == null || ans[k] === ''
                    ? 'Pending'
                    : ans[k] === 'na'
                      ? 'N/A'
                      : ans[k] === 1
                        ? 'Passed'
                        : ans[k] === 0
                          ? 'Failed'
                          : String(ans[k]),
                d: '',
              }))
            : none(),
        },
        ...(i.exceptions
          ? [
              {
                h: 'Exceptions',
                warn: `${i.exceptions} failed item(s) — create a follow-up work order or record a customer acknowledgement.`,
              },
            ]
          : []),
      ],
      ref: {
        woId: i.woId,
        customerId: w?.customerId ?? null,
        assetId: i.assetId,
        siteId: w?.siteId ?? null,
        serviceTypeId: w?.serviceTypeId ?? null,
        number: i.number,
      },
      hasActs:
        (!!i.exceptions && d.a.workorder) ||
        (d.a.approve && i.result !== 'In Progress' && !i.approvedById),
      acts: [
        ...(i.exceptions && d.a.workorder
          ? [btn('di:follow', 'Create follow-up', 'primary')]
          : []),
        ...(d.a.approve && i.result !== 'In Progress' && !i.approvedById
          ? [btn('di:approve', 'Approve')]
          : []),
      ],
    };
  }

  tpl(d: Data, id: string) {
    const t = d.templates.find((x) => x.id === id);
    if (!t) return null;
    return {
      ...this.base('Checklist template', `${t.name} · v${t.version}`),
      badges: [this.B(t.status)],
      sections: [
        {
          h: 'Items',
          items: this.data.tplItems(t).map((it, k) => ({
            a: `${k + 1}. ${it.t}`,
            c: it.type,
            b: it.req ? 'Required' : 'Optional',
            d: it.ev ? 'Evidence' : '',
          })),
        },
        {
          h: 'Versioning',
          text:
            t.status === 'Published'
              ? 'Published versions are immutable. Duplicate to change.'
              : t.status === 'Superseded'
                ? 'Superseded — kept so past inspections reproduce exactly.'
                : 'Draft — publish to use on new work orders.',
        },
      ],
      hasActs: d.a.plan,
      acts: [
        ...(t.status === 'Draft'
          ? [btn('dk:Publish version', 'Publish version', 'primary')]
          : []),
        btn('dk:Duplicate', 'Duplicate'),
      ],
    };
  }

  async audit(d: Data) {
    const rows = await this.ctx.db.fsAudit.findMany({
      where: { businessId: d.a.rootId },
      orderBy: { createdAt: 'desc' },
      take: 80,
    });
    return {
      ...this.base('Audit log · append-only', 'Field Service'),
      sections: [
        {
          h: `Latest ${rows.length} actions`,
          items: rows.length
            ? rows.map((r) => ({
                a: r.action,
                c: `${r.actorName} · ${d.fmt.dtm(r.createdAt)}`,
                b: r.correlation,
                d: r.detail.slice(0, 180),
              }))
            : none('No actions yet'),
        },
      ],
    };
  }

  async approvals(d: Data) {
    const rows = await this.ctx.db.fsApproval.findMany({
      where: { businessId: d.a.rootId },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    return {
      ...this.base(
        'Approvals (Action Center)',
        `${rows.filter((r) => r.status === 'Pending').length} pending`,
      ),
      sections: [
        {
          h: 'Pending',
          items: rows.filter((r) => r.status === 'Pending').length
            ? rows
                .filter((r) => r.status === 'Pending')
                .map((r) => ({
                  a: r.kind,
                  c: `${r.what} · by ${this.data.tname(d, r.requestedById)}`,
                  b: 'Pending',
                  d: d.fmt.dtm(r.createdAt),
                  id: r.id,
                }))
            : none('Nothing waiting'),
        },
        {
          h: 'Decided',
          items: rows
            .filter((r) => r.status !== 'Pending')
            .map((r) => ({
              a: r.kind,
              c: `${r.what}${r.reason ? ` · ${r.reason}` : ''}`,
              b: r.status,
              d: r.decidedById ? this.data.tname(d, r.decidedById) : '',
            })),
        },
      ],
      decidable: d.a.approve,
    };
  }

  kpi(d: Data, k: string) {
    const [p, x] = k.split(':');
    const items = (L: Item[]) => (L.length ? L : none());
    if (p === 'm')
      return {
        ...this.base('Drill-through', 'Preventive plans'),
        sections: [
          {
            h: 'Records',
            items: items(
              d.plans
                .filter((q) => {
                  const n = this.data.planNext(d, q);
                  return x === 'over'
                    ? q.status === 'Active' && (n ?? 0) < 0
                    : x === 'wk'
                      ? n != null && n >= 0 && n <= 7
                      : x === 'up'
                        ? (n ?? -1) > 7
                        : x === 'act'
                          ? q.status === 'Active'
                          : true;
                })
                .map((q) => ({
                  a: q.name,
                  c: this.data.cname(d, q.customerId),
                  b: this.data.dday(d, this.data.planNext(d, q)),
                  d: q.status,
                })),
            ),
          },
        ],
      };
    if (p === 'g')
      return {
        ...this.base('Drill-through', 'Service agreements'),
        sections: [
          {
            h: 'Records',
            items: items(
              d.agreements
                .filter((g) =>
                  x === 'exp'
                    ? this.data.agrStatus(d, g) === 'Expired'
                    : x === 'ren'
                      ? this.data.agrStatus(d, g) === 'Renewing Soon'
                      : true,
                )
                .map((g) => ({
                  a: `${g.number} · ${this.data.cname(d, g.customerId)}`,
                  c: `${this.data.agrUsed(d, g)}/${g.visits} visits · ends ${g.endOn.toISOString().slice(0, 10)}`,
                  b: this.data.agrStatus(d, g),
                  d: '',
                })),
            ),
          },
        ],
      };
    if (p === 'y')
      return {
        ...this.base('Drill-through', 'Warranty cases'),
        sections: [
          {
            h: 'Records',
            items: items(
              d.warranty
                .filter((w) => {
                  const s = this.views.wrnStatus(d, w);
                  return x === 'el'
                    ? w.eligibility === 'Eligible'
                    : x === 'rej'
                      ? s === 'Rejected'
                      : x === 'pv'
                        ? ['Validating', 'Approval Required'].includes(s)
                        : x === 'rep'
                          ? s === 'Repairing'
                          : x === 'done'
                            ? s === 'Completed'
                            : true;
                })
                .map((w) => ({
                  a: `${w.number} · ${w.issue}`,
                  c: this.data.cname(d, w.customerId),
                  b: this.views.wrnStatus(d, w),
                  d: w.eligibility,
                })),
            ),
          },
        ],
      };
    if (p === 'i')
      return {
        ...this.base('Drill-through', 'Inspections'),
        sections: [
          {
            h: 'Records',
            items: items(
              d.inspections
                .filter((i) =>
                  x === 'fail'
                    ? i.result === 'Failed'
                    : x === 'exc'
                      ? i.exceptions > 0
                      : x === 'prog'
                        ? i.result === 'In Progress'
                        : true,
                )
                .map((i) => ({
                  a: `${i.number} · ${d.wos.find((w) => w.id === i.woId)?.number ?? ''}`,
                  c: this.data.tname(d, i.techUserId),
                  b: i.result,
                  d: `${i.exceptions} exceptions`,
                })),
            ),
          },
        ],
      };
    if (p === 'e')
      return {
        ...this.base('Drill-through', 'Customer assets'),
        sections: [
          {
            h: 'Records',
            items: items(
              d.equipment
                .filter((a) =>
                  x === 'unv'
                    ? !a.serial
                    : x === 'fail'
                      ? d.wos.filter(
                          (w) =>
                            w.assetId === a.id &&
                            !w.planId &&
                            w.status !== 'Cancelled',
                        ).length >= 3
                      : x === 'open'
                        ? d.wos.some(
                            (w) =>
                              w.assetId === a.id && OPEN.includes(w.status),
                          )
                        : true,
                )
                .map((a) => ({
                  a: a.name,
                  c: `${a.serial || 'no serial'} · ${this.data.cname(d, a.customerId)}`,
                  b:
                    a.warrantyEnd && a.warrantyEnd >= d.now
                      ? 'Under warranty'
                      : 'No warranty',
                  d: a.number,
                })),
            ),
          },
        ],
      };
    if (p === 'o' && x === 'ftf') {
      const done = d.wos.filter((w) => DONE.includes(w.status));
      const f = this.data.ftfOf(d);
      return {
        ...this.base('Drill-through', 'First-time fix'),
        sections: [
          {
            h: 'Definition',
            text: `A job counts as a first-time fix only if resolved on the first qualifying visit and no repeat (non-preventive) field visit on the same asset follows within ${d.cfg.warranty.repeatWindowDays} days.${f ? ` Current rate ${Math.round(f.v * 100)}% over ${f.n} jobs.` : ''}`,
          },
          {
            h: `Records (${done.length})`,
            items: items(
              done.map((w) => ({
                a: `${w.number} · ${this.data.cname(d, w.customerId)}`,
                c: w.resolution ?? '',
                b: w.unresolved ? 'Not resolved' : 'Resolved',
                d: w.completedAt ? d.fmt.dtm(w.completedAt) : '',
              })),
            ),
          },
        ],
      };
    }
    if (p === 'r' && x === 'tt') {
      const L = d.requests.filter((r) => r.triagedAt);
      return {
        ...this.base('Drill-through', 'Triage time'),
        sections: [
          {
            h: 'Triaged requests',
            items: items(
              L.map((r) => ({
                a: `${r.number} · ${this.data.cname(d, r.customerId)}`,
                c: r.triageResult ?? '',
                b: mins(
                  (r.triagedAt!.getTime() - r.createdAt.getTime()) / 60000,
                ).replace(' left', ''),
                d: '',
              })),
            ),
          },
        ],
      };
    }
    return {
      ...this.base('Drill-through', 'Records'),
      sections: [{ h: 'Records', items: none() }],
    };
  }
}
