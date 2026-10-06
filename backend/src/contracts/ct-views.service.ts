import { Injectable } from '@nestjs/common';
import {
  K,
  R,
  btn,
  card,
  cell,
  cols,
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
import { CtActor, CtContextService, num } from './ct-context.service';
import {
  Cmp,
  CtDataService,
  CtScope,
  Ctr,
  Data,
  Doc,
  Exp,
  Sig,
  Step,
  Tpl,
} from './ct-data.service';
import {
  CT_CST,
  CT_SECS,
  CT_T,
  CT_TABS,
  FILE_TYPES,
  LIVE,
  REMIND_DAYS,
  RETENTIONS,
  SIGNER_ROLES,
} from './ct.constants';
import { CtSettingsService } from './ct-settings.service';
import { dayKey, keyPlus } from '../field-service/fs-time';

type Btn = ReturnType<typeof btn>;
const LOCK = '🔒';
const MONO = 'ui-monospace,monospace';
const OPEN_APR = ['Pending', 'Escalated'];
const SIG_LIVE = ['Sent', 'Partially Signed'];

export const chipOf = (st: string) => {
  const C = CT_CST[st] ?? ['#344054', '#F2F4F7', ''];
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
const mb = (kb: number) => `${(kb / 1024).toFixed(1)} MB`;

/** Server-built view-models for the Contracts screens (contracts-core.js v*), from real rows only. */
@Injectable()
export class CtViewsService {
  constructor(
    private readonly ctx: CtContextService,
    private readonly data: CtDataService,
    private readonly settings: CtSettingsService,
  ) {}

  allowed(a: CtActor, k: string) {
    if (k === 'settings') return a.settings || a.compliance;
    if (!a.contracts)
      return ['overview', 'documents', 'compliance'].includes(k);
    return true;
  }

  // ── header ────────────────────────────────────────────────────────────

  header(d: Data) {
    const a = d.a;
    const T = CT_TABS.find((t) => t[0] === d.s.tab) ?? CT_TABS[0];
    const cur = d.s.tab === 'detail' ? this.data.ct(d, d.s.cur) : undefined;
    const vis = cur && this.data.ctVisible(d, cur);
    const H: Record<string, Btn[]> = {
      overview: [btn('new', '+ New', 'primary', !a.upload && !a.manage)],
      documents: [
        btn(
          'upload',
          'Upload',
          'primary',
          !a.upload && !a.documents && !a.manage,
        ),
      ],
      templates: [btn('newtpl', 'Create template', 'primary', !a.manage)],
      contracts: [btn('newct', '+ New contract', 'primary', !a.manage)],
      signatures: [btn('newsig', 'Prepare request', 'primary', !a.manage)],
      compliance: [btn('cmp-up', 'Upload', 'primary', !a.compliance)],
      settings: [btn('audit', 'View audit')],
    };
    const exp = a.contracts
      ? this.data.expiries(d).filter((e) => e.exp >= 0 && e.exp <= 30).length
      : 0;
    const aprN = d.approvals.filter((x) => OPEN_APR.includes(x.status)).length;
    const sigIssues = d.sigs
      .filter(
        (s) =>
          ['Declined', 'Expired'].includes(s.status) ||
          s.signers.some((x) => x.status === 'Delivery Failed'),
      )
      .filter(
        (s) =>
          !d.sigs.some((o) => o.docId === s.docId && o.createdAt > s.createdAt),
      ).length;
    return {
      title: vis ? cur.title : T[3],
      sub: vis
        ? `${cur.number} · ${cur.status} · ${this.data.party(d, cur.cpKind, cur.cpId).name}`
        : T[4],
      icon: T[5],
      roleLabel: `${a.roleLabel} · ${a.name}`,
      tabs: CT_TABS.filter(
        (t) =>
          (t[0] !== 'detail' || d.s.tab === 'detail') && this.allowed(a, t[0]),
      ).map((t) => ({
        k: t[0],
        label: t[0] === 'detail' ? (vis ? cur.number : 'Detail') : t[1],
        path: t[0] === 'detail' ? `/${cur?.number ?? d.s.cur}` : t[2],
        badge:
          t[0] === 'approvals' && aprN
            ? String(aprN)
            : t[0] === 'signatures' && sigIssues
              ? `${sigIssues} issue`
              : t[0] === 'expiries' && exp
                ? String(exp)
                : null,
      })),
      hdrActs: H[d.s.tab] ?? [],
      sels: ['overview', 'documents', 'contracts', 'expiries'].includes(d.s.tab)
        ? [
            {
              k: 'branch',
              l: 'Branch / entity scope',
              v: d.s.branch,
              opts: [
                { v: '', t: a.branches ? 'Your branches' : 'All branches' },
                ...d.group
                  .filter((g) => !a.branches || a.branches.includes(g.id))
                  .map((g) => ({ v: g.id, t: g.name })),
              ],
            },
          ]
        : [],
      more: [
        ...(d.s.tab === 'documents' && (a.documents || a.manage || a.settings)
          ? [{ v: 'newfolder', t: 'New folder' }]
          : []),
        ...(d.s.tab === 'contracts' && a.manage
          ? [{ v: 'import', t: 'Import signed contract' }]
          : []),
        ...(d.s.tab === 'templates'
          ? [{ v: 'vars', t: 'Variable browser' }]
          : []),
        ...(a.export ? [{ v: 'export', t: 'Export' }] : []),
        { v: 'audit', t: 'Audit / history' },
        { v: 'storage', t: 'Storage detail' },
        ...(a.upload || a.manage
          ? [{ v: 'reqdoc', t: 'Request document' }]
          : []),
      ],
      loadedAt: d.now.toISOString(),
      me: a.userId,
    };
  }

  async screen(a: CtActor, s: CtScope) {
    const d = await this.data.load(a, s);
    const head = this.header(d);
    if (!this.allowed(a, s.tab))
      return {
        head,
        gate: {
          t: `${(CT_TABS.find((t) => t[0] === s.tab) ?? CT_TABS[0])[3]} isn’t available for your role`,
          d: 'Contracts, signatures and approvals need a Contracts role. Restricted values are never sent to this browser.',
        },
      };
    if (s.tab === 'settings')
      return { head, settings: await this.vSettings(d) };
    const fn: Record<string, (x: Data) => unknown[] | Promise<unknown[]>> = {
      overview: (x) => this.vOverview(x),
      documents: (x) => this.vDocuments(x),
      templates: (x) => this.vTemplates(x),
      contracts: (x) => this.vContracts(x),
      detail: (x) => this.vDetail(x),
      signatures: (x) => this.vSignatures(x),
      approvals: (x) => this.vApprovals(x),
      expiries: (x) => this.vExpiries(x),
      compliance: (x) => this.vCompliance(x),
    };
    const i = CT_TABS.findIndex((t) => t[0] === s.tab);
    const rows = hoistSegActs(await (fn[s.tab] ?? fn.overview)(d), head);
    return {
      head,
      rows,
      screenLabel: `${String(i + 1).padStart(2, '0')} ${(CT_TABS[i] ?? CT_TABS[0])[3]}`,
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
  private owners(d: Data, ids: string[]): [string, string][] {
    return uniq(ids).map((id) => [id, this.data.name(d, id)]);
  }

  // ===== 1 Overview =========================================================

  attention(d: Data) {
    type Att = {
      id: string;
      sev: string;
      t: string;
      ent: string;
      ref: string;
      refId: string;
      due: number | null;
      owner: string;
      st: string;
      act: string;
      kind: string;
    };
    const out: Att[] = [];
    const A = (
      sev: string,
      t: string,
      ent: string,
      ref: string,
      refId: string,
      due: number | null,
      ownerId: string | null,
      st: string,
      act: string,
      kind: string,
    ) =>
      out.push({
        id: `${kind}:${refId}:${out.length}`,
        sev,
        t,
        ent,
        ref,
        refId,
        due,
        owner: this.data.name(d, ownerId),
        st,
        act,
        kind,
      });
    const docT = (id: string) =>
      d.docs.find((x) => x.id === id)?.title ?? 'Document';
    if (d.a.contracts) {
      for (const s of d.sigs) {
        const dl = this.data.off(d, s.deadline)!;
        if (SIG_LIVE.includes(s.status) && dl <= 5)
          A(
            dl < 2 ? 'High' : 'Medium',
            `Signature due ${this.data.rel(dl)}`,
            docT(s.docId),
            s.number,
            s.id,
            dl,
            s.senderId,
            s.status,
            'Remind',
            'sig',
          );
        const failed = s.signers.filter((x) => x.status === 'Delivery Failed');
        if (SIG_LIVE.includes(s.status) && failed.length)
          A(
            'High',
            `Failed signature delivery — ${failed.map((x) => x.name).join(', ')}`,
            docT(s.docId),
            s.number,
            s.id,
            dl,
            s.senderId,
            s.status,
            'Resend',
            'sig',
          );
        const newer = d.sigs.some(
          (o) => o.docId === s.docId && o.createdAt > s.createdAt,
        );
        if (s.status === 'Declined' && !newer)
          A(
            'High',
            `Signature declined — ${s.note ?? ''}`,
            docT(s.docId),
            s.number,
            s.id,
            null,
            s.senderId,
            'Declined',
            'Open',
            'sig',
          );
        if (s.status === 'Expired' && !newer)
          A(
            'Medium',
            'Signature request expired',
            docT(s.docId),
            s.number,
            s.id,
            dl,
            s.senderId,
            'Expired',
            'Open',
            'sig',
          );
      }
      for (const x of d.approvals.filter((y) => OPEN_APR.includes(y.status))) {
        const due = this.data.off(d, x.dueOn)!;
        const cs = (x.steps as unknown as Step[]).find((s) =>
          OPEN_APR.includes(s.status),
        );
        A(
          due < 0 ? 'High' : 'Medium',
          `${due < 0 ? 'Approval overdue — ' : 'Approval pending — '}${x.type}`,
          this.aprEnt(d, x).t,
          x.number,
          x.id,
          due,
          cs?.userId ?? null,
          x.status,
          'Review',
          'apr',
        );
      }
      for (const e of this.data
        .expiries(d)
        .filter(
          (y) =>
            y.exp <= 30 &&
            !['Renewed', 'Will Not Renew', 'Renewal Draft', 'Snoozed'].includes(
              y.st,
            ),
        ))
        A(
          e.exp < 0 || (e.notice != null && e.notice < 0) ? 'High' : 'Medium',
          e.exp < 0
            ? `${e.kind} expired ${this.data.rel(e.exp)}`
            : e.notice != null && e.notice < 0
              ? 'Notice deadline passed — renewal decision needed'
              : `Expires ${this.data.rel(e.exp)}`,
          e.title,
          e.ref,
          e.id,
          e.exp,
          d.contracts.find((c) => c.id === e.refId)?.ownerId ??
            d.docs.find((x) => x.id === e.refId)?.ownerId ??
            d.comp.find((x) => x.id === e.refId)?.ownerId ??
            null,
          e.st,
          'Review renewal',
          'exp',
        );
      for (const c of this.data.cts(d))
        for (const o of c.obls.filter(
          (y) => this.data.oblSt(d, y) === 'Overdue',
        ))
          A(
            'Medium',
            `Obligation overdue — ${o.title}`,
            c.title,
            c.number,
            c.id,
            this.data.off(d, o.dueOn),
            o.ownerId,
            'Overdue',
            'Open contract',
            'ctr',
          );
    }
    for (const x of d.comp.filter(
      (y) => this.data.cmpSt(d, y) === 'Missing Evidence',
    ))
      A(
        'Medium',
        'Missing compliance evidence',
        x.title,
        x.number,
        x.id,
        this.data.off(d, x.expiresOn),
        x.ownerId,
        'Missing Evidence',
        'Upload',
        'cmp',
      );
    for (const x of this.data
      .docs(d)
      .filter((y) => ['Failed', 'Partial'].includes(y.status) && !y.archivedAt))
      A(
        'Low',
        `Processing ${x.status.toLowerCase()} — ${x.processing ?? ''}`,
        x.title,
        x.number,
        x.id,
        null,
        x.ownerId,
        x.status,
        'Open',
        'doc',
      );
    const rk: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
    return out.sort(
      (x, y) => rk[x.sev] - rk[y.sev] || (x.due ?? 99) - (y.due ?? 99),
    );
  }

  private aprEnt(d: Data, x: Data['approvals'][number]) {
    if (x.kind === 'Contract') {
      const c = d.contracts.find((y) => y.id === x.entityId);
      return {
        t: c ? `${c.number} · ${c.title}` : 'Removed contract',
        ref: c?.number ?? '',
      };
    }
    if (x.kind === 'Amendment') {
      const c = d.contracts.find((y) =>
        y.amends.some((m) => m.id === x.entityId),
      );
      const m = c?.amends.find((y) => y.id === x.entityId);
      return {
        t: c && m ? `${c.number} · ${m.number}` : 'Removed amendment',
        ref: c?.number ?? '',
      };
    }
    if (x.kind === 'Template') {
      const t = d.templates.find((y) => y.id === x.entityId);
      return {
        t: t ? `${t.number} · ${t.name}` : 'Removed template',
        ref: t?.number ?? '',
      };
    }
    const doc = d.docs.find((y) => y.id === x.entityId);
    return {
      t: doc ? `${doc.number} · ${doc.title}` : 'Removed document',
      ref: doc?.number ?? '',
    };
  }

  async vOverview(d: Data) {
    const a = d.a;
    const D = this.data.docs(d);
    const C = this.data.cts(d);
    const f = this.F(d, 'ov');
    if (!d.docs.length && !d.contracts.length)
      return emptyRows(
        'No documents or contracts yet.',
        'Upload a document or create your first contract. Other Noxtill modules link here by document ID.',
        [
          btn(
            'upload',
            'Upload first document',
            'primary',
            !a.upload && !a.manage,
          ),
          btn('newct', 'Create first contract', 'ghost', !a.manage),
          btn('newtpl', 'Create template', 'ghost', !a.manage),
        ],
      );
    const typeOf: Record<string, string> = {
      sig: 'Contract',
      apr: 'Contract',
      ctr: 'Contract',
      exp: 'Contract',
      doc: 'Document',
      cmp: 'Compliance',
    };
    const srcOf = (x: { kind: string; refId: string }) => {
      if (x.kind === 'doc')
        return d.docs.find((y) => y.id === x.refId)?.linkModule ?? '';
      const c = d.contracts.find((y) => y.id === x.refId);
      return c ? this.data.party(d, c.cpKind, c.cpId).module : '';
    };
    const att = this.attention(d).filter(
      (x) =>
        (!f.owner || x.owner === this.data.name(d, f.owner)) &&
        (!f.type || typeOf[x.kind] === f.type) &&
        (!f.src || srcOf(x) === f.src),
    );
    const exp = a.contracts ? this.data.expiries(d) : [];
    const aw = d.sigs.filter((s) => SIG_LIVE.includes(s.status));
    const ap = d.approvals.filter((x) => OPEN_APR.includes(x.status));
    const recent30 = (x: Date) => d.now.getTime() - x.getTime() < 30 * 86400000;
    const kpis = [
      K(
        'o:docs',
        'Total Documents',
        D.filter((x) => !x.archivedAt).length,
        `${D.filter((x) => recent30(x.createdAt)).length} new in 30 days`,
        null,
        '#12A150',
      ),
      K(
        'o:active',
        'Active Contracts',
        a.contracts ? C.filter((c) => LIVE.includes(c.status)).length : LOCK,
        a.contracts ? `${C.length} in register` : 'Not available for your role',
        null,
        '#12A150',
      ),
      K(
        'o:apr',
        'Awaiting Approval',
        ap.length,
        `${ap.filter((x) => this.data.off(d, x.dueOn)! < 0).length} overdue`,
        ap.some((x) => this.data.off(d, x.dueOn)! < 0) ? '#B42318' : null,
        '#F79009',
      ),
      K(
        'o:sig',
        'Awaiting Signature',
        aw.length,
        ((n) => `${n} ${n === 1 ? 'signer' : 'signers'} outstanding`)(
          aw.reduce(
            (s, x) => s + x.signers.filter((y) => y.status !== 'Signed').length,
            0,
          ),
        ),
        null,
        '#2E90FA',
      ),
      K(
        'o:exp',
        'Expiring Soon',
        exp.filter((e) => e.exp >= 0 && e.exp <= 30).length,
        'Next 30 days',
        null,
        '#F79009',
      ),
      K(
        'o:expd',
        'Expired / Attention',
        exp.filter(
          (e) => e.exp < 0 && !['Renewed', 'Will Not Renew'].includes(e.st),
        ).length + att.filter((x) => x.sev === 'High').length,
        'Expired + high-severity items',
        '#B42318',
        '#F04438',
      ),
      K(
        'o:fail',
        'Failed Processing',
        D.filter((x) => ['Failed', 'Partial'].includes(x.status)).length,
        'Uploads / text extraction',
        null,
        '#F04438',
      ),
      K(
        'o:ret',
        'Retention Alerts',
        D.filter((x) => x.legalHold).length,
        `${D.filter((x) => x.legalHold).length} on legal hold`,
        null,
        '#98A2B3',
      ),
    ];
    const audit = await this.ctx.db.ctAudit.findMany({
      where: { businessId: a.rootId },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
    const ownerOpts = this.owners(d, [
      ...D.map((x) => x.ownerId),
      ...C.map((c) => c.ownerId),
    ]);
    const sizes = d.cfg.folders.list
      .map(
        (fd) =>
          [
            fd,
            D.filter((x) => x.folder === fd).reduce(
              (s, x) => s + this.data.sizeKb(x),
              0,
            ),
          ] as [string, number],
      )
      .filter((x) => x[1] > 0);
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'ov-f',
          filters: {
            search: null,
            sels: [
              sel2('type', 'Type', f.type, [
                ['', 'Any type'],
                'Contract',
                'Document',
                'Compliance',
              ]),
              sel2('owner', 'Owner', f.owner, [
                ['', 'Any owner'],
                ...ownerOpts,
              ]),
              sel2('src', 'Source module', f.src, [
                ['', 'Any source module'],
                'Suppliers',
                'Customers CRM',
                'People & Payroll',
                'Assets & Maintenance',
                'Branches',
                'Projects & Tasks',
                'Finance & Accounting',
                'Field Service',
              ]),
            ],
            nOn: nOn(f),
            count: `${att.length} items need attention`,
          },
        }),
      ]),
      R('minmax(0,1fr)', [
        card({
          id: 'ov-att',
          title: 'Needs attention',
          sub: 'Every item opens the record that needs action',
          table: att.length
            ? {
                hasActs: true,
                cols: cols([
                  'Severity',
                  'Item',
                  'Entity',
                  'Due',
                  ['Owner', '1'],
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
                      cell({ t: x.t, fw: 700, fg: '#101828', mw: '300px' }),
                      cell({ t: x.ent, s: x.ref }),
                      cell({
                        t:
                          x.due == null
                            ? '—'
                            : this.data.dday(d, this.data.dateIn(d, x.due)),
                        s: x.due == null ? '' : this.data.rel(x.due),
                        fg: x.due != null && x.due < 0 ? '#B42318' : '#344054',
                      }),
                      cell({ t: x.owner, opt: '1' }),
                      stc(x.st),
                      cell({ t: x.act, fg: '#0E8442', fw: 700 }),
                    ],
                    uniq([x.act, 'Open']),
                    [
                      x.t,
                      x.ent,
                      [
                        { t: x.sev, fg: '#344054', bg: '#F2F4F7' },
                        chipOf(x.st),
                      ],
                    ],
                  ),
                ),
              }
            : null,
          empty: att.length
            ? null
            : { t: 'Nothing needs attention', d: '', acts: [] },
          acts: [
            btn(
              'go:approvals',
              'Open pending approvals',
              'ghost',
              !this.allowed(a, 'approvals'),
            ),
            btn(
              'go:signatures',
              'Open signatures',
              'ghost',
              !this.allowed(a, 'signatures'),
            ),
          ],
        }),
      ]),
      R('minmax(0,1.2fr) minmax(0,1fr)', [
        card({
          id: 'ov-act',
          title: 'Recent activity',
          table: audit.length
            ? {
                hasActs: false,
                cols: cols(['Activity', 'Record', 'Actor', 'Time', 'Status']),
                rows: audit.map((x, i) =>
                  row(
                    `a${i}`,
                    [
                      cell({ t: x.action, fw: 700 }),
                      cell({
                        t: x.detail.split(' · ')[0].slice(0, 60),
                        mw: '220px',
                      }),
                      cell({ t: x.actorName }),
                      cell({ t: this.ago(d, x.createdAt) }),
                      stc('Recorded'),
                    ],
                    [],
                    [x.action, x.detail.slice(0, 60), []],
                  ),
                ),
              }
            : null,
          empty: audit.length
            ? null
            : {
                t: 'No activity yet',
                d: 'Every action in Contracts is recorded here.',
                acts: [],
              },
          acts: [btn('audit', 'Audit')],
        }),
        card({
          id: 'ov-exp',
          title: 'Upcoming expiries',
          table: a.contracts
            ? {
                hasActs: true,
                cols: cols([
                  'Document / contract',
                  'Expiry',
                  'Notice by',
                  'Renewal',
                ]),
                rows: exp
                  .filter((e) => e.exp >= -15 && e.exp <= 90)
                  .slice(0, 7)
                  .map((e) =>
                    row(
                      e.id,
                      [
                        cell({
                          t: e.title,
                          fw: 700,
                          s: `${e.type} · ${e.owner}`,
                        }),
                        cell({
                          t: this.data.dday(d, this.data.dateIn(d, e.exp)),
                          s: this.data.rel(e.exp),
                          fg: e.exp < 0 ? '#B42318' : '#344054',
                        }),
                        cell({
                          t:
                            e.notice == null
                              ? '—'
                              : this.data.dday(
                                  d,
                                  this.data.dateIn(d, e.notice),
                                ),
                          fg:
                            e.notice != null && e.notice < 0
                              ? '#B42318'
                              : '#344054',
                          s: e.notice != null && e.notice < 0 ? 'Passed' : '',
                        }),
                        stc(e.st),
                      ],
                      ['Open renewal'],
                      [
                        e.title,
                        `Expires ${this.data.dday(d, this.data.dateIn(d, e.exp))}`,
                        [chipOf(e.st)],
                      ],
                    ),
                  ),
              }
            : null,
          empty: !a.contracts
            ? { t: 'Not available for your role', d: '', acts: [] }
            : exp.some((e) => e.exp >= -15 && e.exp <= 90)
              ? null
              : { t: 'Nothing expiring in the next 90 days', d: '', acts: [] },
          acts: [
            btn(
              'go:expiries',
              'All expiries',
              'ghost',
              !this.allowed(a, 'expiries'),
            ),
          ],
        }),
      ]),
      R('minmax(0,1fr)', [
        card({
          id: 'ov-store',
          title: 'Storage & document health',
          bars: sizes.length ? mkBars(sizes, '#12A150', (v) => mb(v)) : null,
          empty: sizes.length
            ? null
            : { t: 'No stored files yet', d: '', acts: [] },
          acts: [
            btn('storage', 'Storage detail'),
            btn('export', 'Export index', 'ghost', !a.export),
          ],
          info: 'Files live in private storage; downloads use 5-minute signed links. Lists never load file bytes.',
        }),
      ]),
    ];
  }

  ago(d: Data, x: Date) {
    const m = Math.round((d.now.getTime() - x.getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.round(m / 60)}h ago`;
    return this.data.dday(d, x);
  }

  // ===== 2 Documents ========================================================

  docFiltered(d: Data) {
    const f = this.F(d, 'doc');
    const q = (f.q ?? '').trim().toLowerCase();
    const v = d.s.view.docView;
    return this.data
      .docs(d)
      .filter(
        (x) =>
          (v === 'arch' ? !!x.archivedAt : !x.archivedAt) &&
          (v !== 'recent' ||
            d.now.getTime() - x.updatedAt.getTime() < 14 * 86400000) &&
          (v !== 'shared' || ((x.shares as string[]) ?? []).length > 0) &&
          (!q ||
            [
              x.number,
              x.title,
              x.type,
              this.data.name(d, x.ownerId),
              ...((x.tags as string[]) ?? []),
              this.data.linkName(d, x.linkModule, x.linkId),
            ]
              .join(' ')
              .toLowerCase()
              .includes(q)) &&
          (!f.folder || x.folder === f.folder) &&
          (!f.type || x.type === f.type) &&
          (!f.mod || x.linkModule === f.mod) &&
          (!f.owner || x.ownerId === f.owner) &&
          (!f.st || x.status === f.st) &&
          (!f.sens || x.sensitivity === f.sens) &&
          (!f.exp ||
            (x.expiresOn != null &&
              this.data.off(d, x.expiresOn)! <= +f.exp &&
              this.data.off(d, x.expiresOn)! >= 0)) &&
          (!f.tag || ((x.tags as string[]) ?? []).includes(f.tag)),
      )
      .sort((x, y) =>
        f.sort === 'title'
          ? x.title.localeCompare(y.title)
          : y.updatedAt.getTime() - x.updatedAt.getTime(),
      );
  }

  docActs(d: Data, x: Doc) {
    const a = d.a;
    const own = x.ownerId === a.userId || x.createdById === a.userId;
    const edit = a.documents || a.manage || (a.upload && own);
    const o = ['Open'];
    if (this.data.cur(x)?.storageKey) o.push('Download');
    if (edit && !x.archivedAt)
      o.push('Upload new version', 'Move', 'Tag', 'Share internally');
    if (x.versions.length > 1) o.push('Compare versions');
    if (edit) o.push(x.archivedAt ? 'Restore' : 'Archive');
    if (a.settings)
      o.push(x.legalHold ? 'Release legal hold' : 'Place legal hold');
    if (a.delete) o.push('Delete');
    return uniq(o);
  }

  vDocuments(d: Data) {
    const a = d.a;
    const f = this.F(d, 'doc');
    const all = this.data.docs(d);
    const L = this.docFiltered(d);
    const adv = d.s.view.docCols === 'adv';
    const sz = all.reduce((s, x) => s + this.data.sizeKb(x), 0);
    const hidden = d.docs.length - all.length;
    const kpis = [
      K(
        'd:all',
        'Total Documents',
        all.filter((x) => !x.archivedAt).length,
        `${all.filter((x) => x.archivedAt).length} archived`,
        null,
        '#12A150',
      ),
      K(
        'd:new',
        'Added This Month',
        all.filter(
          (x) => dayKey(x.createdAt, d.tz).slice(0, 7) === d.today.slice(0, 7),
        ).length,
        '',
        null,
        '#2E90FA',
      ),
      K(
        'd:rev',
        'Awaiting Review',
        all.filter((x) =>
          ['Approval Pending', 'Review Required', 'Partial'].includes(x.status),
        ).length,
        '',
        null,
        '#F79009',
      ),
      K(
        'd:exp',
        'Expiring Soon',
        all.filter(
          (x) =>
            x.expiresOn &&
            this.data.off(d, x.expiresOn)! >= 0 &&
            this.data.off(d, x.expiresOn)! <= 30,
        ).length,
        'Next 30 days',
        null,
        '#F79009',
      ),
      K(
        'd:res',
        'Restricted Documents',
        all.filter((x) =>
          ['Restricted', 'Confidential'].includes(x.sensitivity),
        ).length,
        hidden
          ? `${hidden} more hidden for your role`
          : 'Confidential + restricted',
        null,
        '#F04438',
      ),
      K(
        'd:store',
        'Storage Used',
        mb(sz),
        'All versions · private storage',
        null,
        '#98A2B3',
      ),
    ];
    const sg = seg(
      [
        ['table', 'All documents'],
        ['folders', 'Folders'],
        ['recent', 'Recent'],
        ['shared', 'Shared internally'],
        ['arch', 'Archived'],
      ],
      d.s.view.docView || 'table',
    );
    if (!all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No documents yet.',
          'Upload formal documents once — other modules link to them by ID.',
          [btn('upload', 'Upload Document', 'primary', !a.upload && !a.manage)],
        ),
      ];
    if (d.s.view.docView === 'folders')
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'fold',
            seg: sg,
            qcards: d.cfg.folders.list.map((fd) => {
              const L2 = all.filter((x) => x.folder === fd && !x.archivedAt);
              return {
                id: fd,
                t: fd,
                d:
                  L2.slice(0, 2)
                    .map((x) => x.title)
                    .join(' · ') || 'Empty',
                badge: String(L2.length),
                bbg: '#F2F4F7',
                bfg: '#344054',
                bg: '#fff',
                aria: `Open folder ${fd}`,
                stats: [
                  { l: 'Documents', v: String(L2.length), fg: '#101828' },
                  {
                    l: 'Expiring',
                    v: String(
                      L2.filter(
                        (x) =>
                          x.expiresOn && this.data.off(d, x.expiresOn)! <= 30,
                      ).length,
                    ),
                    fg: '#B54708',
                  },
                ],
              };
            }),
          }),
        ]),
      ];
    const pg = this.paged(d, L);
    const tags = uniq(all.flatMap((x) => (x.tags as string[]) ?? []));
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'doc',
          seg: sg,
          filters: {
            search: 'Search title, ID, tag, owner or linked record',
            q: f.q ?? '',
            sels: [
              sel2('folder', 'Folder', f.folder, [
                ['', 'Any folder'],
                ...d.cfg.folders.list,
              ]),
              sel2('type', 'Type', f.type, [
                ['', 'Any type'],
                ...uniq(all.map((x) => x.type)),
              ]),
              sel2('mod', 'Linked module', f.mod, [
                ['', 'Any linked module'],
                ...uniq(
                  all.map((x) => x.linkModule).filter(Boolean) as string[],
                ),
              ]),
              sel2('owner', 'Owner', f.owner, [
                ['', 'Any owner'],
                ...this.owners(
                  d,
                  all.map((x) => x.ownerId),
                ),
              ]),
              sel2('st', 'Status', f.st, [
                ['', 'Any status'],
                'Draft',
                'Ready',
                'Approval Pending',
                'Approved',
                'Signature Pending',
                'Signed',
                'Active',
                'Partial',
              ]),
              sel2('sens', 'Sensitivity', f.sens, [
                ['', 'Any sensitivity'],
                'Public',
                'Internal',
                'Confidential',
                ...(a.restricted ? ['Restricted'] : []),
              ]),
              sel2('exp', 'Expiry', f.exp, [
                ['', 'Any expiry'],
                ['30', 'Next 30 days'],
                ['90', 'Next 90 days'],
              ]),
              ...(tags.length
                ? [sel2('tag', 'Tag', f.tag, [['', 'Any tag'], ...tags])]
                : []),
              sel2('sort', 'Sort', f.sort, [
                ['', 'Recently updated'],
                ['title', 'Title A–Z'],
              ]),
            ],
            nOn: nOn(f, ['sort', 'q']),
            count: `${L.length} documents`,
          },
          bulk: {
            acts: [
              btn('bk-move', 'Move', 'ghost', !a.documents && !a.manage),
              btn('bk-tag', 'Tag', 'ghost', !a.documents && !a.manage),
              btn('bk-export', 'Export index', 'ghost', !a.export),
            ],
          },
          table: L.length
            ? {
                sel: true,
                hasActs: true,
                cols: cols([
                  'Document',
                  'Type',
                  'Version',
                  'Linked to',
                  ['Owner', '1'],
                  ['Folder', '1'],
                  'Status',
                  'Sensitivity',
                  'Updated',
                  ...(adv
                    ? [
                        'Document ID',
                        'Tags',
                        'Expiry',
                        'Retention',
                        'Size',
                        'Hash',
                      ]
                    : []),
                ]),
                rows: pg.rows.map((x) => {
                  const v = this.data.cur(x);
                  return row(
                    x.id,
                    [
                      cell({
                        t: x.title,
                        fw: 800,
                        fg: '#101828',
                        s: x.legalHold ? '⚖ Legal hold' : (x.processing ?? ''),
                      }),
                      cell({ t: x.type }),
                      cell({
                        t: `v${v?.version ?? 1}`,
                        s: v?.immutable ? 'Immutable' : 'Editable draft',
                      }),
                      cell({
                        t: x.linkModule
                          ? this.data.linkName(d, x.linkModule, x.linkId)
                          : '—',
                        s: x.linkModule ?? '',
                      }),
                      cell({ t: this.data.name(d, x.ownerId), opt: '1' }),
                      cell({ t: x.folder, opt: '1' }),
                      stc(x.status),
                      stc(x.sensitivity),
                      cell({ t: this.data.dday(d, x.updatedAt) }),
                      ...(adv
                        ? [
                            cell({ t: x.number, ff: MONO }),
                            cell({
                              t: ((x.tags as string[]) ?? []).join(', ') || '—',
                            }),
                            cell({ t: this.data.dday(d, x.expiresOn) }),
                            cell({ t: x.retention }),
                            cell({
                              t: v?.size
                                ? `${Math.max(1, Math.round(v.size / 1024))} KB`
                                : '—',
                            }),
                            cell({
                              t: v?.sha256 ? `${v.sha256.slice(0, 12)}…` : '—',
                              ff: MONO,
                            }),
                          ]
                        : []),
                    ],
                    this.docActs(d, x),
                    [
                      x.title,
                      `${x.type} · v${v?.version ?? 1} · ${this.data.name(d, x.ownerId)}`,
                      [chipOf(x.status), chipOf(x.sensitivity)],
                    ],
                  );
                }),
              }
            : null,
          pager: pg.pager,
          empty: L.length
            ? null
            : {
                t:
                  d.s.view.docView === 'arch'
                    ? 'Nothing archived'
                    : 'No documents match these filters.',
                d: '',
                acts: [btn('clear:doc', 'Clear Filters', 'primary')],
              },
          info: 'Raw storage URLs are never exposed — downloads use 5-minute signed links. Approved and signed versions are immutable; edits create a new version.',
        }),
      ]),
    ];
  }

  // ===== 3 Templates ========================================================

  tplInfo(d: Data, t: Tpl) {
    const cur = t.versions[t.versions.length - 1];
    const pub = [...t.versions].reverse().find((v) => v.status === 'Published');
    const used = d.contracts.filter(
      (c) =>
        c.templateId === t.id &&
        dayKey(c.createdAt, d.tz).slice(0, 7) === d.today.slice(0, 7),
    ).length;
    const st =
      t.status === 'Archived'
        ? 'Archived'
        : cur.status === 'Draft'
          ? 'Draft'
          : 'Published';
    return {
      cur,
      pub,
      used,
      st,
      nr:
        !!pub &&
        t.status !== 'Archived' &&
        d.now.getTime() - pub.createdAt.getTime() > 182 * 86400000,
      pending: d.approvals.some(
        (x) => x.entityId === t.id && OPEN_APR.includes(x.status),
      ),
    };
  }

  tplActs(d: Data, t: Tpl) {
    const i = this.tplInfo(d, t);
    const o = ['Preview', 'Version history'];
    if (d.a.manage) {
      if (i.st !== 'Archived') o.push('Edit');
      o.push('Duplicate');
      if (i.st === 'Draft' && !i.pending) o.push('Publish version');
      if (i.st !== 'Archived') o.push('Archive');
    }
    if (i.pub && t.status !== 'Archived' && d.a.manage)
      o.push('Generate contract');
    return o;
  }

  vTemplates(d: Data) {
    const a = d.a;
    const all = d.templates;
    const f = this.F(d, 'tpl');
    const q = (f.q ?? '').trim().toLowerCase();
    const L = all.filter(
      (t) =>
        (!q || `${t.name} ${t.type} ${t.number}`.toLowerCase().includes(q)) &&
        (!f.st || this.tplInfo(d, t).st === f.st) &&
        (!f.type || t.type === f.type),
    );
    const kpis = [
      K(
        't:Published',
        'Active Templates',
        all.filter((t) => t.status !== 'Archived' && this.tplInfo(d, t).pub)
          .length,
        '',
        null,
        '#12A150',
      ),
      K(
        't:Draft',
        'Draft Templates',
        all.filter((t) => this.tplInfo(d, t).st === 'Draft').length,
        '',
        null,
        '#98A2B3',
      ),
      K(
        't:ver',
        'Published Versions',
        all.reduce(
          (s, t) => s + t.versions.filter((v) => v.status !== 'Draft').length,
          0,
        ),
        'Immutable once published',
        null,
        '#2E90FA',
      ),
      K(
        't:used',
        'Used This Month',
        all.reduce((s, t) => s + this.tplInfo(d, t).used, 0),
        'Contracts generated',
        null,
        '#12A150',
      ),
      K(
        't:rev',
        'Needing Review',
        all.filter((t) => this.tplInfo(d, t).nr).length,
        'Older than 6 months',
        null,
        '#F79009',
      ),
    ];
    if (!all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No templates yet.',
          'Create formal templates with typed variables and signer roles.',
          [btn('newtpl', 'Create Template', 'primary', !a.manage)],
        ),
      ];
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'tpl',
          acts: [
            btn('newtpl', 'Create template', 'primary', !a.manage),
            btn('vars', 'Variable browser'),
          ],
          filters: {
            search: 'Search templates',
            q: f.q ?? '',
            sels: [
              sel2('st', 'Status', f.st, [
                ['', 'Any status'],
                'Draft',
                'Published',
                'Archived',
              ]),
              sel2('type', 'Type', f.type, [
                ['', 'Any type'],
                ...uniq(all.map((t) => t.type)),
              ]),
            ],
            nOn: nOn(f, ['q']),
            count: `${L.length} templates`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Name',
                  'Type',
                  'Version',
                  ['Owner', '1'],
                  'Variables',
                  'Signature roles',
                  ['Approval policy', '1'],
                  'Status',
                  'Updated',
                ]),
                rows: L.map((t) => {
                  const i = this.tplInfo(d, t);
                  const vars = (i.cur.vars as string[]) ?? [];
                  return row(
                    t.id,
                    [
                      cell({
                        t: t.name,
                        fw: 800,
                        fg: '#101828',
                        s: i.nr
                          ? 'Review due'
                          : i.pending
                            ? 'Awaiting approval'
                            : '',
                      }),
                      cell({ t: t.type }),
                      cell({
                        t: `v${t.version}`,
                        s:
                          i.pub && i.pub.version !== t.version
                            ? `v${i.pub.version} published`
                            : '',
                      }),
                      cell({ t: this.data.name(d, t.ownerId), opt: '1' }),
                      cell({
                        t: String(vars.length),
                        s: vars
                          .slice(0, 3)
                          .map((v) => `{{${v}}}`)
                          .join(' '),
                      }),
                      cell({
                        t: ((t.roles as string[]) ?? []).join(', ') || '—',
                      }),
                      cell({ t: t.approval, opt: '1' }),
                      stc(i.st),
                      cell({ t: this.data.dday(d, t.updatedAt) }),
                    ],
                    this.tplActs(d, t),
                    [t.name, `${t.type} · v${t.version}`, [chipOf(i.st)]],
                  );
                }),
              }
            : null,
          empty: L.length
            ? null
            : {
                t: 'No templates match these filters.',
                d: '',
                acts: [btn('clear:tpl', 'Clear Filters', 'primary')],
              },
          info: 'Variables are a typed schema (no code execution). Published versions are immutable — editing a published template starts a new draft version.',
        }),
      ]),
    ];
  }

  // ===== 4 Contracts ========================================================

  ctFiltered(d: Data) {
    const f = this.F(d, 'ct');
    const q = (f.q ?? '').trim().toLowerCase();
    return this.data
      .cts(d)
      .filter(
        (c) =>
          (!q ||
            [
              c.number,
              c.title,
              this.data.party(d, c.cpKind, c.cpId).name,
              c.type,
              this.data.name(d, c.ownerId),
            ]
              .join(' ')
              .toLowerCase()
              .includes(q)) &&
          (!f.st || c.status === f.st) &&
          (!f.type || c.type === f.type) &&
          (!f.sig || c.sigState === f.sig) &&
          (!f.apr || c.aprState === f.apr) &&
          (!f.owner || c.ownerId === f.owner) &&
          (!f.ren ||
            (c.endOn != null &&
              this.data.off(d, c.endOn)! >= 0 &&
              this.data.off(d, c.endOn)! <= +f.ren)) &&
          (!f.risk || this.data.risk(d, c) === f.risk) &&
          (!f.cp || `${c.cpKind}:${c.cpId}` === f.cp),
      )
      .sort((x, y) =>
        f.sort === 'end'
          ? (x.endOn?.getTime() ?? 9e15) - (y.endOn?.getTime() ?? 9e15)
          : y.number.localeCompare(x.number),
      );
  }

  ctActs(d: Data, c: Ctr) {
    const a = d.a;
    const o = ['Open'];
    if (a.manage && c.status === 'Draft')
      o.push('Edit draft', 'Submit for approval');
    if (a.manage && c.status === 'Approved') o.push('Send for signature');
    if (a.manage) o.push('Duplicate');
    const doc = this.data.doc(d, c.docId);
    if (doc && doc.versions.length > 1) o.push('Compare versions');
    if (
      a.manage &&
      [...LIVE, 'Expired'].includes(c.status) &&
      !d.contracts.some((x) => x.renewalOf === c.id && x.status !== 'Archived')
    )
      o.push('Renew');
    if (a.manage && LIVE.includes(c.status)) o.push('Create amendment');
    if (a.terminate && LIVE.includes(c.status)) o.push('Terminate');
    if (a.manage && (CT_T[c.status] ?? []).includes('Archived'))
      o.push('Archive');
    o.push('Audit');
    return o;
  }

  vContracts(d: Data) {
    const a = d.a;
    const all = this.data.cts(d);
    const f = this.F(d, 'ct');
    const L = this.ctFiltered(d);
    const adv = d.s.view.ctCols === 'adv';
    const ending = (c: Ctr, n: number) =>
      c.endOn != null &&
      this.data.off(d, c.endOn)! >= 0 &&
      this.data.off(d, c.endOn)! <= n;
    const kpis = [
      K(
        'c:Active',
        'Active Contracts',
        all.filter((c) => LIVE.includes(c.status)).length,
        '',
        null,
        '#12A150',
      ),
      K(
        'c:Draft',
        'Draft',
        all.filter((c) => c.status === 'Draft').length,
        '',
        null,
        '#98A2B3',
      ),
      K(
        'c:Approval Required',
        'Awaiting Approval',
        all.filter((c) => c.status === 'Approval Required').length,
        '',
        null,
        '#F79009',
      ),
      K(
        'c:sig',
        'Awaiting Signature',
        all.filter((c) =>
          ['Signature Pending', 'Partially Signed'].includes(c.status),
        ).length,
        '',
        null,
        '#2E90FA',
      ),
      K(
        'c:30',
        'Expiring 30 Days',
        all.filter((c) => LIVE.includes(c.status) && ending(c, 30)).length,
        '',
        null,
        '#F79009',
      ),
      K(
        'c:Renewal Review',
        'Renewal Required',
        all.filter(
          (c) =>
            c.status === 'Renewal Review' ||
            (LIVE.includes(c.status) &&
              c.endOn != null &&
              this.data.off(d, this.data.noticeBy(c))! < 0 &&
              this.data.off(d, c.endOn)! >= 0 &&
              !['Renewal Draft', 'Will Not Renew', 'Renewed'].includes(
                this.data.renSt(d, c),
              )),
        ).length,
        'Notice window passed or review open',
        null,
        '#F04438',
      ),
      K(
        'c:risk',
        'At Risk',
        all.filter((c) => this.data.risk(d, c) === 'At Risk').length,
        'Notice passed undecided / obligation >30d overdue',
        null,
        '#F04438',
      ),
      K(
        'c:val',
        'Total Referenced Value',
        a.value
          ? d.fmt.short(
              all
                .filter(
                  (c) =>
                    !['Archived', 'Expired', 'Terminated', 'Renewed'].includes(
                      c.status,
                    ),
                )
                .reduce((s, c) => s + num(c.value), 0),
            )
          : LOCK,
        'Reference only — not accounting',
        null,
        '#98A2B3',
      ),
    ];
    if (!all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No contracts yet.',
          'Create one from a template, start blank or import an existing signed contract.',
          [btn('newct', 'Create Contract', 'primary', !a.manage)],
        ),
      ];
    const pg = this.paged(d, L);
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'ct',
          seg: seg(
            [
              ['def', 'Default columns'],
              ['adv', 'All columns'],
            ],
            d.s.view.ctCols || 'def',
          ),
          filters: {
            search: 'Search contract #, title, counterparty or owner',
            q: f.q ?? '',
            sels: [
              sel2('st', 'Status', f.st, [
                ['', 'Any status'],
                ...Object.keys(CT_T),
              ]),
              sel2('type', 'Type', f.type, [
                ['', 'Any type'],
                ...uniq(all.map((c) => c.type)),
              ]),
              sel2('cp', 'Counterparty', f.cp, [
                ['', 'Any counterparty'],
                ...uniq(all.map((c) => `${c.cpKind}:${c.cpId}`)).map(
                  (x) =>
                    [
                      x,
                      this.data.party(d, x.split(':')[0], x.split(':')[1]).name,
                    ] as [string, string],
                ),
              ]),
              sel2('sig', 'Signature', f.sig, [
                ['', 'Any signature state'],
                'Not sent',
                'Sent',
                'Partially Signed',
                'Completed',
                'Declined',
                'Voided',
                'Expired',
              ]),
              sel2('apr', 'Approval', f.apr, [
                ['', 'Any approval state'],
                'Not requested',
                'Pending',
                'Approved',
                'Rejected',
                'Changes Requested',
              ]),
              sel2('ren', 'Renewal window', f.ren, [
                ['', 'Any end date'],
                ['30', 'Ends within 30 days'],
                ['90', 'Ends within 90 days'],
              ]),
              sel2('owner', 'Owner', f.owner, [
                ['', 'Any owner'],
                ...this.owners(
                  d,
                  all.map((c) => c.ownerId),
                ),
              ]),
              sel2('risk', 'Risk', f.risk, [
                ['', 'Any risk'],
                'Normal',
                'Attention',
                'At Risk',
              ]),
              sel2('sort', 'Sort', f.sort, [
                ['', 'Newest'],
                ['end', 'Ending soonest'],
              ]),
            ],
            nOn: nOn(f, ['sort', 'q']),
            count: `${L.length} contracts`,
          },
          bulk: {
            acts: [
              btn('bk-owner', 'Assign owner', 'ghost', !a.manage),
              btn('bk-review', 'Request review', 'ghost', !a.manage),
              btn('bk-export', 'Export register', 'ghost', !a.export),
            ],
          },
          table: L.length
            ? {
                sel: true,
                hasActs: true,
                cols: cols([
                  'Contract #',
                  'Title',
                  'Counterparty',
                  ['Type', '1'],
                  ['Owner', '1'],
                  'Start',
                  'End',
                  'Renewal',
                  'Signature',
                  'Status',
                  ...(adv
                    ? [
                        'Referenced value',
                        'Approval',
                        'Obligations',
                        'Risk',
                        'Branch',
                        'Notice deadline',
                      ]
                    : []),
                ]),
                rows: pg.rows.map((c) => {
                  const p = this.data.party(d, c.cpKind, c.cpId);
                  const e = this.data.off(d, c.endOn);
                  const od = c.obls.some(
                    (o) => this.data.oblSt(d, o) === 'Overdue',
                  );
                  return row(
                    c.id,
                    [
                      cell({ t: c.number, fw: 800, fg: '#101828', ff: MONO }),
                      cell({ t: c.title, mw: '240px' }),
                      cell({ t: p.name, s: p.module }),
                      cell({ t: c.type, opt: '1' }),
                      cell({ t: this.data.name(d, c.ownerId), opt: '1' }),
                      cell({ t: this.data.dday(d, c.startOn) }),
                      cell({
                        t: c.endOn ? this.data.dday(d, c.endOn) : 'Open-ended',
                        s: e == null ? '' : this.data.rel(e),
                        fg:
                          e != null && e <= 30 && LIVE.includes(c.status)
                            ? '#B54708'
                            : '#344054',
                      }),
                      stc(this.data.renSt(d, c)),
                      stc(c.sigState),
                      stc(c.status),
                      ...(adv
                        ? [
                            cell({ t: this.data.val(d, c.value) }),
                            stc(c.aprState),
                            cell({
                              t: `${c.obls.length}${od ? ' · overdue' : ''}`,
                              fg: od ? '#B42318' : '#344054',
                            }),
                            stc(this.data.risk(d, c)),
                            cell({ t: this.data.branchName(d, c.branchId) }),
                            cell({
                              t: this.data.dday(d, this.data.noticeBy(c)),
                            }),
                          ]
                        : []),
                    ],
                    this.ctActs(d, c),
                    [
                      `${c.number} · ${c.title}`,
                      `${p.name} · ends ${this.data.dday(d, c.endOn)}`,
                      [chipOf(c.status), chipOf(c.sigState)],
                    ],
                  );
                }),
              }
            : null,
          pager: pg.pager,
          empty: L.length
            ? null
            : {
                t: 'No contracts match these filters.',
                d: '',
                acts: [btn('clear:ct', 'Clear Filters', 'primary')],
              },
          info: 'Counterparties are CRM / supplier / staff references — never copied. Referenced values are not accounting entries. Bulk actions are limited to safe operations; nothing is bulk-signed, approved or terminated.',
        }),
      ]),
    ];
  }

  // ===== 5 Contract detail ==================================================

  summary(d: Data, c: Ctr) {
    const t = c.terms.filter((x) => x.status === 'Confirmed');
    const nb = this.data.noticeBy(c);
    return [
      `Key dates: ${this.data.dday(d, c.startOn)} → ${c.endOn ? this.data.dday(d, c.endOn) : 'open-ended'}${nb ? `; notice by ${this.data.dday(d, nb)}` : ''}`,
      ...t.map((x) => `${x.term}: ${x.value} [${x.source}]`),
      ...c.obls
        .filter((o) => !['Completed', 'Waived', 'Cancelled'].includes(o.status))
        .slice(0, 2)
        .map(
          (o) => `Obligation: ${o.title} — due ${this.data.dday(d, o.dueOn)}`,
        ),
      t.length
        ? 'Built only from the terms captured on this contract — not a legal opinion.'
        : 'No terms captured yet — add the key clauses in the Terms tab.',
    ].join('\n');
  }

  async vDetail(d: Data) {
    const a = d.a;
    const c = this.data.ct(d, d.s.cur);
    if (!c || !this.data.ctVisible(d, c))
      return emptyRows(
        c ? 'You don’t have access to this contract' : 'Contract not found',
        c
          ? 'Restricted contracts need “contracts.restricted”. Knowing the ID isn’t enough.'
          : 'It may have been archived or the link is wrong.',
        [btn('go:contracts', 'Back to contracts', 'primary')],
      );
    const tab = d.s.view.dTab || 'ov';
    const doc = this.data.doc(d, c.docId);
    const sig = d.sigs.filter((s) => s.contractId === c.id);
    const apr = d.approvals.filter(
      (x) => x.entityId === c.id || c.amends.some((m) => m.id === x.entityId),
    );
    const nb = this.data.noticeBy(c);
    const nbo = this.data.off(d, nb);
    const p = this.data.party(d, c.cpKind, c.cpId);
    const risk = this.data.risk(d, c);
    const od = c.obls.filter((o) => this.data.oblSt(d, o) === 'Overdue');
    const ren = this.data.renSt(d, c);
    const prim: Record<string, [string, string]> = {
      Draft: ['d:Edit draft', 'Edit contract'],
      'Approval Required': ['d:review-apr', 'Review approval'],
      'Signature Pending': ['d:tab:sig', 'View signatures'],
      'Partially Signed': ['d:tab:sig', 'View signatures'],
      Approved: ['d:Send for signature', 'Send for signature'],
      Expiring: ['d:Renew', 'Review renewal'],
      'Renewal Review': ['d:Renew', 'Review renewal'],
      Expired: ['d:Renew', 'Renew'],
    };
    const pr = prim[c.status];
    const kp = [
      K(
        'dt:ov:1',
        'Status',
        c.status,
        `v${c.version}`,
        null,
        chipOf(c.status).fg,
      ),
      K(
        'dt:ov:2',
        'Contract period',
        `${this.data.dday(d, c.startOn)} → ${c.endOn ? this.data.dday(d, c.endOn) : 'open'}`,
        c.endOn ? this.data.rel(this.data.off(d, c.endOn)) : '',
        null,
        '#98A2B3',
      ),
      K(
        'dt:ov:3',
        'Referenced value',
        this.data.val(d, c.value),
        'Reference only',
        null,
        '#98A2B3',
      ),
      K(
        'dt:apr',
        'Approval',
        c.aprState,
        `${apr.length} workflow run(s)`,
        null,
        '#F79009',
      ),
      K(
        'dt:sig',
        'Signature',
        c.sigState,
        `${sig.length} request(s)`,
        null,
        '#2E90FA',
      ),
      K(
        'dt:obl',
        'Obligations',
        c.obls.length,
        `${od.length} overdue`,
        od.length ? '#B42318' : null,
        '#F04438',
      ),
      K(
        'dt:renew',
        'Renewal',
        ren,
        nb ? `Notice by ${this.data.dday(d, nb)}` : 'No end date',
        nbo != null && nbo < 0 && LIVE.includes(c.status) ? '#B42318' : null,
        '#F79009',
      ),
      K(
        'dt:ov:4',
        'Risk / attention',
        risk,
        od.length
          ? 'Overdue obligation'
          : nbo != null && nbo < 0 && LIVE.includes(c.status)
            ? 'Notice deadline passed'
            : '',
        risk === 'At Risk' ? '#B42318' : null,
        '#F04438',
      ),
    ];
    const head = card({
      id: 'd-h',
      title: c.title,
      sub: `${c.number} · ${p.name} (${p.module}) · owner ${this.data.name(d, c.ownerId)} · ${c.type}`,
      acts: [
        btn('go:contracts', '← Contracts'),
        ...(pr && (a.manage || pr[0].startsWith('d:tab'))
          ? [btn(pr[0], pr[1], 'primary')]
          : []),
        btn('d:more', 'More…'),
      ],
      seg: seg(
        [
          ['ov', 'Overview'],
          ['doc', 'Document'],
          ['parties', 'Parties'],
          ['terms', 'Terms', c.terms.length],
          ['obl', 'Obligations', c.obls.length],
          ['apr', 'Approvals', apr.length],
          ['sig', 'Signatures', sig.length],
          ['amend', 'Amendments', c.amends.length],
          ['renew', 'Renewal'],
          ['rel', 'Related'],
          ['act', 'Activity'],
          ['audit', 'Audit'],
        ],
        tab,
      ),
      moreActs: this.ctActs(d, c).filter((x) => x !== 'Open'),
    });
    const T = (
      cl: (string | [string, string?])[],
      rows: unknown[],
      acts = true,
    ) => ({ hasActs: acts, cols: cols(cl), rows });
    let body: unknown;
    if (tab === 'doc') {
      const v = doc ? this.data.cur(doc) : null;
      body = card({
        id: 'd-doc',
        title: doc ? doc.title : 'No document linked',
        sub:
          doc && v
            ? `${doc.number} · current v${v.version} · ${v.sha256 ? `sha256 ${v.sha256.slice(0, 16)}…` : 'no file'}`
            : '',
        table: doc
          ? T(
              ['Version', 'Note', 'By', 'Date', 'State', 'Immutable', 'Hash'],
              [...doc.versions].reverse().map((x) =>
                row(
                  `${doc.id}|${x.version}`,
                  [
                    cell({ t: `v${x.version}`, fw: 800 }),
                    cell({ t: x.note }),
                    cell({ t: this.data.name(d, x.byUserId) }),
                    cell({ t: this.data.dday(d, x.createdAt) }),
                    stc(x.state),
                    cell({ t: x.immutable ? 'Yes — locked' : 'No' }),
                    cell({
                      t: x.sha256 ? `${x.sha256.slice(0, 16)}…` : '—',
                      ff: MONO,
                    }),
                  ],
                  x.storageKey ? ['Download'] : [],
                  [`v${x.version}`, x.note, [chipOf(x.state)]],
                ),
              ),
            )
          : null,
        acts: doc
          ? [
              btn('d:Download', 'Download', 'ghost', !v?.storageKey),
              btn(
                'd:Compare versions',
                'Compare versions',
                'ghost',
                doc.versions.length < 2,
              ),
              btn(
                'd:evidence',
                'Signature evidence',
                'ghost',
                !a.evidence || !sig.some((s) => s.status === 'Completed'),
              ),
            ]
          : [],
      });
    } else if (tab === 'parties') {
      const sg = sig[0];
      const bizSigner = sg?.signers.find(
        (x) => x.role === 'Business Signatory',
      );
      const cpSigner = sg?.signers.find((x) => x.role !== 'Business Signatory');
      const draft = c.signerDraft as { name?: string } | null;
      body = card({
        id: 'd-p',
        table: T(
          ['Party', 'Role', 'Canonical record', 'Signer'],
          [
            row(
              'p0',
              [
                cell({ t: d.biz.name, fw: 700 }),
                cell({ t: 'Internal entity' }),
                cell({ t: 'Settings › Business profile' }),
                cell({
                  t: bizSigner
                    ? `Business Signatory · ${bizSigner.name}`
                    : d.cfg.approvals.signatoryUserId
                      ? `Authorized Signatory · ${this.data.name(d, d.cfg.approvals.signatoryUserId)}`
                      : 'Not set — Settings › Approvals',
                }),
              ],
              [],
              [d.biz.name, 'Internal', []],
            ),
            row(
              'p1',
              [
                cell({ t: p.name, fw: 700 }),
                cell({ t: p.type }),
                cell({ t: `${p.module}${p.email ? ` · ${p.email}` : ''}` }),
                cell({ t: cpSigner?.name ?? draft?.name ?? '—' }),
              ],
              ['Open'],
              [p.name, p.module, []],
            ),
          ],
        ),
        info: `Identity, contacts and addresses stay in ${p.module}. Contracts stores only the reference.`,
      });
    } else if (tab === 'terms') {
      body = card({
        id: 'd-t',
        acts: [btn('d:add-term', 'Add term', 'ghost', !a.manage)],
        table: c.terms.length
          ? T(
              ['Term', 'Value', 'Source clause / page', 'Entered by', 'Status'],
              c.terms.map((t) =>
                row(
                  t.id,
                  [
                    cell({ t: t.term, fw: 700 }),
                    cell({ t: t.value }),
                    cell({ t: t.source }),
                    cell({
                      t:
                        t.confidence == null
                          ? 'Person'
                          : `${Math.round(num(t.confidence) * 100)}% (suggested)`,
                    }),
                    stc(t.status),
                  ],
                  a.manage ? ['Correct'] : [],
                  [t.term, t.value, [chipOf(t.status)]],
                ),
              ),
            )
          : null,
        empty: c.terms.length
          ? null
          : {
              t: 'No structured terms yet',
              d: 'Capture key clauses (payment, renewal, liability) with their clause reference.',
              acts: [],
            },
        info: 'Terms are entered by people with their source clause. No automatic extraction runs, so nothing becomes “legal truth” silently.',
      });
    } else if (tab === 'obl') {
      body = card({
        id: 'd-o',
        acts: [btn('d:add-obl', 'Add obligation', 'ghost', !a.manage)],
        table: c.obls.length
          ? T(
              [
                'Obligation',
                'Responsible',
                'Owner',
                'Due',
                'Frequency',
                'Status',
                'Evidence',
                'Task',
              ],
              c.obls.map((o) => {
                const st = this.data.oblSt(d, o);
                const ev = this.data.doc(d, o.evidenceDocId);
                return row(
                  o.id,
                  [
                    cell({ t: o.title, fw: 700, s: o.note ?? '' }),
                    cell({ t: o.responsible }),
                    cell({ t: this.data.name(d, o.ownerId) }),
                    cell({
                      t: this.data.dday(d, o.dueOn),
                      s: this.data.rel(this.data.off(d, o.dueOn)),
                      fg: st === 'Overdue' ? '#B42318' : '#344054',
                    }),
                    cell({ t: o.frequency }),
                    stc(st),
                    cell({ t: ev?.number ?? '—' }),
                    cell({ t: o.taskId ?? '—' }),
                  ],
                  a.manage && !['Completed', 'Waived', 'Cancelled'].includes(st)
                    ? ['Mark completed', 'Create task', 'Waive']
                    : [],
                  [o.title, this.data.dday(d, o.dueOn), [chipOf(st)]],
                );
              }),
            )
          : null,
        empty: c.obls.length ? null : { t: 'No obligations', d: '', acts: [] },
        info: 'Completing a monthly, quarterly or annual obligation schedules its next occurrence within the contract term.',
      });
    } else if (tab === 'apr') {
      body = card({
        id: 'd-a',
        acts:
          c.status === 'Draft' && a.manage
            ? [btn('d:Submit for approval', 'Submit for approval', 'primary')]
            : [],
        table: apr.length
          ? T(
              ['Run', 'Type', 'Steps', 'Current', 'Status', 'Due'],
              apr.map((x) => {
                const steps = x.steps as unknown as Step[];
                const cs = steps.find((s) => OPEN_APR.includes(s.status));
                return row(
                  x.id,
                  [
                    cell({ t: x.number, fw: 800 }),
                    cell({ t: x.type, s: x.changes }),
                    cell({
                      t: steps.map((s) => `${s.role}: ${s.status}`).join(' → '),
                      mw: '320px',
                    }),
                    cell({ t: cs ? this.data.name(d, cs.userId) : '—' }),
                    stc(x.status),
                    cell({ t: this.data.dday(d, x.dueOn) }),
                  ],
                  ['Open'],
                  [x.number, x.status, [chipOf(x.status)]],
                );
              }),
            )
          : null,
        empty: apr.length
          ? null
          : {
              t: 'No approvals yet',
              d:
                c.status === 'Draft'
                  ? 'Submit the draft to start the approval route.'
                  : '',
              acts: [],
            },
      });
    } else if (tab === 'sig') {
      body = card({
        id: 'd-s',
        acts:
          c.status === 'Approved' && a.manage
            ? [btn('d:Send for signature', 'Send for signature', 'primary')]
            : [],
        table: sig.length
          ? T(
              [
                'Signer',
                'Role',
                'Order',
                'Authentication',
                'Sent',
                'Viewed',
                'Signed',
                'Status',
                'Request',
              ],
              sig.flatMap((s) =>
                s.signers.map((x) =>
                  row(
                    `${s.id}|${x.id}`,
                    [
                      cell({ t: x.name, fw: 700, s: x.email }),
                      cell({ t: x.role }),
                      cell({
                        t:
                          s.ordering === 'Parallel'
                            ? 'Parallel'
                            : String(x.seq),
                      }),
                      cell({ t: x.auth }),
                      cell({ t: this.data.dday(d, x.sentAt) }),
                      cell({ t: this.data.dday(d, x.viewedAt) }),
                      cell({ t: this.data.dday(d, x.signedAt) }),
                      stc(x.status),
                      cell({ t: `${s.number} · ${s.status}` }),
                    ],
                    ['Open request'],
                    [x.name, `${x.role} · ${x.status}`, [chipOf(x.status)]],
                  ),
                ),
              ),
            )
          : null,
        empty: sig.length
          ? null
          : {
              t: 'No signature requests',
              d:
                c.status === 'Approved'
                  ? 'Ready to send.'
                  : 'Signature follows approval.',
              acts: [],
            },
        info: 'Noxtill eSign is built in — statuses change the moment a signer views, signs or declines.',
      });
    } else if (tab === 'amend') {
      body = card({
        id: 'd-am',
        acts:
          a.manage && LIVE.includes(c.status)
            ? [btn('d:Create amendment', 'Create amendment', 'primary')]
            : [],
        table: c.amends.length
          ? T(
              [
                'Amendment',
                'Reason',
                'Effective',
                'Changed sections',
                'Approval',
                'Signature',
                'Status',
              ],
              c.amends.map((m) =>
                row(
                  m.id,
                  [
                    cell({ t: m.number, fw: 800 }),
                    cell({ t: m.reason, mw: '260px' }),
                    cell({ t: this.data.dday(d, m.effectiveOn) }),
                    cell({
                      t: ((m.sections as string[]) ?? []).join(', ') || '—',
                    }),
                    stc(m.aprState),
                    stc(m.sigState),
                    stc(m.status),
                  ],
                  a.manage
                    ? m.status === 'Draft'
                      ? ['Submit for approval', 'Open document']
                      : m.status === 'Approved'
                        ? ['Send for signature', 'Open document']
                        : ['Open document']
                    : ['Open document'],
                  [m.number, m.reason, [chipOf(m.status)]],
                ),
              ),
            )
          : null,
        empty: c.amends.length
          ? null
          : {
              t: 'No amendments',
              d: 'The signed original is never overwritten — amendments are separate records.',
              acts: [],
            },
      });
    } else if (tab === 'renew') {
      const prev = d.contracts.filter(
        (x) => x.id === c.renewalOf || x.renewalOf === c.id,
      );
      const clause = c.terms.find((t) => /renew|notice/i.test(t.term));
      body = card({
        id: 'd-r',
        title: 'Renewal',
        fields: [
          fRead(
            'Expiry',
            c.endOn
              ? `${this.data.dday(d, c.endOn)} (${this.data.rel(this.data.off(d, c.endOn))})`
              : 'Open-ended',
          ),
          fRead(
            'Notice deadline',
            nb
              ? `${this.data.dday(d, nb)}${nbo! < 0 && LIVE.includes(c.status) ? ' — passed' : ` (${this.data.rel(nbo)})`}`
              : '—',
            { fg: nbo != null && nbo < 0 ? '#B42318' : '#344054' },
          ),
          fRead(
            'Auto-renew',
            c.autoRenew
              ? 'Yes — extends by the same term at expiry unless marked “will not renew”'
              : 'No',
          ),
          fRead(
            'Renewal clause',
            clause ? `${clause.source} · ${clause.value}` : 'Not captured',
          ),
          fRead(
            'Renewal status',
            `${ren}${c.renewNote ? ` · ${c.renewNote}` : ''}`,
          ),
          fRead(
            'Related renewals',
            prev.map((x) => `${x.number} (${x.status})`).join(', ') || 'None',
          ),
          fBtns('', [
            btn(
              'd:Renew',
              'Start renewal',
              'primary',
              !a.manage ||
                ![...LIVE, 'Expired'].includes(c.status) ||
                d.contracts.some(
                  (x) => x.renewalOf === c.id && x.status !== 'Archived',
                ),
            ),
            btn(
              'd:wnr',
              'Mark will not renew',
              'ghost',
              !a.manage || !LIVE.includes(c.status),
            ),
          ]),
        ],
      });
    } else if (tab === 'rel') {
      const agr = await this.ctx.db.fsAgreement.findMany({
        where: { businessId: a.rootId, contractId: c.id },
        select: { id: true, number: true },
      });
      const rel = [
        {
          module: p.module,
          ref: p.name,
          id: `${p.kind}:${p.id}`,
          kind: 'Counterparty',
        },
        ...(
          (c.related as { module: string; ref: string; id: string }[]) ?? []
        ).map((x) => ({ ...x, kind: 'Canonical reference' })),
        ...agr.map((x) => ({
          module: 'Field Service',
          ref: x.number,
          id: x.id,
          kind: 'Service agreement covered',
        })),
        ...d.contracts
          .filter((x) => x.id === c.renewalOf || x.renewalOf === c.id)
          .map((x) => ({
            module: 'Contracts',
            ref: x.number,
            id: x.id,
            kind: x.id === c.renewalOf ? 'Renewal of' : 'Renewed by',
          })),
      ];
      body = card({
        id: 'd-rel',
        table: T(
          ['Module', 'Record', 'Link type'],
          rel.map((x, i) =>
            row(
              `r${i}|${x.module}|${x.id}`,
              [
                cell({ t: x.module, fw: 700 }),
                cell({ t: x.ref, ff: MONO }),
                cell({ t: x.kind }),
              ],
              ['Open'],
              [x.module, x.ref, []],
            ),
          ),
        ),
        info: 'Related records are owned by their modules; this is a link list only.',
      });
    } else if (tab === 'act' || tab === 'audit') {
      const ids = [
        c.id,
        ...sig.map((s) => s.id),
        ...apr.map((x) => x.id),
        ...(c.docId ? [c.docId] : []),
      ];
      const rows = await this.ctx.db.ctAudit.findMany({
        where: { businessId: a.rootId, entityId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      body =
        tab === 'act'
          ? card({
              id: 'd-act',
              table: rows.length
                ? T(
                    ['When', 'Event', 'By'],
                    rows.map((x, i) =>
                      row(
                        `e${i}`,
                        [
                          cell({ t: this.ago(d, x.createdAt) }),
                          cell({
                            t: x.action,
                            fw: 700,
                            s: x.detail.slice(0, 120),
                          }),
                          cell({ t: x.actorName }),
                        ],
                        [],
                        [x.action, this.ago(d, x.createdAt), []],
                      ),
                    ),
                    false,
                  )
                : null,
              empty: rows.length
                ? null
                : { t: 'No activity yet', d: '', acts: [] },
            })
          : card({
              id: 'd-aud',
              table: rows.length
                ? T(
                    ['Action', 'Detail', 'Actor', 'When', 'Correlation'],
                    rows.map((x, i) =>
                      row(
                        `u${i}`,
                        [
                          cell({ t: x.action, fw: 700 }),
                          cell({ t: x.detail, mw: '300px' }),
                          cell({ t: x.actorName }),
                          cell({
                            t: x.createdAt
                              .toISOString()
                              .slice(0, 16)
                              .replace('T', ' '),
                          }),
                          cell({ t: x.correlation, ff: MONO }),
                        ],
                        [],
                        [x.action, x.actorName, []],
                      ),
                    ),
                    false,
                  )
                : null,
              empty: rows.length
                ? null
                : {
                    t: 'No audit entries',
                    d: 'The audit trail is append-only.',
                    acts: [],
                  },
            });
    } else
      body = card({
        id: 'd-ov',
        title: 'Overview',
        fields: [
          fRead('Counterparty', `${p.name} · ${p.module}`),
          fRead(
            'Dates',
            `Start ${this.data.dday(d, c.startOn)} · End ${c.endOn ? this.data.dday(d, c.endOn) : 'open-ended'} · Notice ${c.noticeDays} days`,
          ),
          fRead(
            'Owner / branch',
            `${this.data.name(d, c.ownerId)} · ${this.data.branchName(d, c.branchId)}`,
          ),
          fRead(
            'Referenced value',
            `${this.data.val(d, c.value)}${c.value && a.value ? ' — reference only; Finance owns accounting' : ''}`,
          ),
          fRead(
            'Document',
            doc ? `${doc.number} v${this.data.cur(doc)?.version ?? 1}` : '—',
          ),
          fRead('Summary', this.summary(d, c), {
            h: 'From captured terms only — review the original contract.',
          }),
        ],
        acts: [btn('ext:business-brain', 'Ask Business Brain')],
      });
    return [kpiRow(kp), R('minmax(0,1fr)', [head]), R('minmax(0,1fr)', [body])];
  }

  // ===== 6 Signatures =======================================================

  sigActs(d: Data, s: Sig) {
    const a = d.a;
    const o = ['Open'];
    if (a.manage) {
      if (s.status === 'Prepared') o.push('Send');
      if (SIG_LIVE.includes(s.status)) o.push('Remind', 'Signing link');
      if (
        (SIG_LIVE.includes(s.status) &&
          s.signers.some((x) => x.status === 'Delivery Failed')) ||
        s.status === 'Expired'
      )
        o.push('Resend');
      if (['Prepared', ...SIG_LIVE].includes(s.status)) o.push('Void');
    }
    if (s.status === 'Completed') o.push('Download signed document');
    if (s.status === 'Completed' && a.evidence) o.push('Evidence pack');
    if (s.contractId) o.push('Open contract');
    return o;
  }

  vSignatures(d: Data) {
    const a = d.a;
    const all = d.sigs.filter(
      (s) =>
        !s.contractId ||
        this.data.ctVisible(
          d,
          d.contracts.find((c) => c.id === s.contractId)!,
        ),
    );
    const f = this.F(d, 'sig');
    const q = (f.q ?? '').trim().toLowerCase();
    const cnt = (st: string[]) =>
      all.filter((s) => st.includes(s.status)).length;
    const live = all.filter((s) => SIG_LIVE.includes(s.status));
    const kpis = [
      K(
        's:Prepared',
        'Awaiting Send',
        cnt(['Prepared']),
        'Prepared, not sent',
        null,
        '#98A2B3',
      ),
      K('s:Sent', 'Sent', cnt(['Sent']), 'No one signed yet', null, '#2E90FA'),
      K(
        's:Viewed',
        'Viewed',
        live.filter((s) => s.signers.some((x) => x.status === 'Viewed')).length,
        'Opened, not signed',
        null,
        '#6941C6',
      ),
      K(
        's:Partially Signed',
        'Awaiting Signatures',
        live.length,
        `${live.reduce((s, x) => s + x.signers.filter((y) => y.status !== 'Signed').length, 0)} signers`,
        null,
        '#2E90FA',
      ),
      K(
        's:Completed',
        'Completed',
        cnt(['Completed']),
        'Every signer signed',
        null,
        '#12A150',
      ),
      K('s:Declined', 'Declined', cnt(['Declined']), '', null, '#F04438'),
      K('s:Expired', 'Expired', cnt(['Expired']), '', null, '#F79009'),
      K(
        's:Failed',
        'Failed',
        live.filter((s) =>
          s.signers.some((x) => x.status === 'Delivery Failed'),
        ).length,
        'Email delivery',
        null,
        '#F04438',
      ),
    ];
    if (!all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No signature requests.',
          'Prepare a request from an approved document or contract.',
          [btn('newsig', 'Prepare Signature Request', 'primary', !a.manage)],
        ),
      ];
    const docOf = (id: string) => d.docs.find((x) => x.id === id);
    const L = all
      .filter(
        (s) =>
          (!q ||
            [
              s.number,
              docOf(s.docId)?.title ?? '',
              docOf(s.docId)?.number ?? '',
              d.contracts.find((c) => c.id === s.contractId)?.number ?? '',
              ...s.signers.map((x) => x.name),
            ]
              .join(' ')
              .toLowerCase()
              .includes(q)) &&
          (!f.st ||
            (f.st === 'Failed'
              ? s.signers.some((x) => x.status === 'Delivery Failed') &&
                SIG_LIVE.includes(s.status)
              : f.st === 'Viewed'
                ? SIG_LIVE.includes(s.status) &&
                  s.signers.some((x) => x.status === 'Viewed')
                : s.status === f.st)),
      )
      .sort((x, y) => y.number.localeCompare(x.number));
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'sig',
          acts: [btn('newsig', 'Prepare request', 'primary', !a.manage)],
          filters: {
            search: 'Search request, document, contract or signer',
            q: f.q ?? '',
            sels: [
              sel2('st', 'Status', f.st, [
                ['', 'Any status'],
                'Prepared',
                'Sent',
                'Viewed',
                'Partially Signed',
                'Completed',
                'Declined',
                'Expired',
                'Voided',
                'Failed',
              ]),
            ],
            nOn: nOn(f, ['q']),
            count: `${L.length} requests`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Request #',
                  'Document',
                  ['Contract', '1'],
                  ['Sender', '1'],
                  'Signers',
                  'Progress',
                  'Sent',
                  'Last activity',
                  'Deadline',
                  'Status',
                ]),
                rows: L.map((s) => {
                  const done = s.signers.filter(
                    (x) => x.status === 'Signed',
                  ).length;
                  const last = s.signers
                    .flatMap((x) => [x.sentAt, x.viewedAt, x.signedAt])
                    .filter(Boolean)
                    .sort((x, y) => y!.getTime() - x!.getTime())[0];
                  const dl = this.data.off(d, s.deadline)!;
                  const doc = docOf(s.docId);
                  return row(
                    s.id,
                    [
                      cell({ t: s.number, fw: 800, fg: '#101828' }),
                      cell({
                        t: doc?.title ?? 'Removed document',
                        s: `${doc?.number ?? ''} v${s.docVersion}`,
                      }),
                      cell({
                        t:
                          d.contracts.find((c) => c.id === s.contractId)
                            ?.number ?? '—',
                        opt: '1',
                      }),
                      cell({ t: this.data.name(d, s.senderId), opt: '1' }),
                      cell({
                        t: s.signers.map((x) => x.name).join(', '),
                        s: s.ordering,
                        mw: '200px',
                      }),
                      cell({
                        t: `${done} / ${s.signers.length} signed`,
                        fw: 700,
                        fg: done === s.signers.length ? '#0E8442' : '#344054',
                      }),
                      cell({ t: this.data.dday(d, s.sentAt) }),
                      cell({ t: last ? this.ago(d, last) : '—' }),
                      cell({
                        t: this.data.dday(d, s.deadline),
                        s: this.data.rel(dl),
                        fg:
                          dl < 2 && SIG_LIVE.includes(s.status)
                            ? '#B42318'
                            : '#344054',
                      }),
                      stc(s.status),
                    ],
                    this.sigActs(d, s),
                    [
                      `${s.number} · ${s.status}`,
                      `${done}/${s.signers.length} signed · deadline ${this.data.dday(d, s.deadline)}`,
                      [chipOf(s.status)],
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
                acts: [btn('clear:sig', 'Clear Filters', 'primary')],
              },
          info: `Noxtill eSign is built in: each signer gets a personal link by email${d.cfg.auth.methods.includes('Email + OTP') ? ' (optionally with a one-time code)' : ''}. “Sent” means the email was accepted by the email provider; “Completed” only once every signer has signed. Evidence: timestamps, IP, device and the document’s SHA-256.`,
        }),
      ]),
    ];
  }

  // ===== 7 Approvals ========================================================

  vApprovals(d: Data) {
    const a = d.a;
    const visible = (x: Data['approvals'][number]) => {
      if (x.kind === 'Contract') {
        const c = d.contracts.find((y) => y.id === x.entityId);
        return !c || this.data.ctVisible(d, c);
      }
      if (x.kind === 'Document') {
        const doc = d.docs.find((y) => y.id === x.entityId);
        return !doc || this.data.docVisible(d, doc);
      }
      return true;
    };
    const all = d.approvals.filter(visible);
    const cur = (x: (typeof all)[number]) =>
      (x.steps as unknown as Step[]).find((s) => OPEN_APR.includes(s.status));
    const mine = all.filter(
      (x) => OPEN_APR.includes(x.status) && cur(x)?.userId === a.userId,
    );
    const f = this.F(d, 'apr');
    const over = (x: (typeof all)[number]) =>
      OPEN_APR.includes(x.status) && this.data.off(d, x.dueOn)! < 0;
    const kpis = [
      K(
        'a:mine',
        'Awaiting My Approval',
        mine.length,
        a.name,
        mine.length ? '#B54708' : null,
        '#F79009',
      ),
      K(
        'a:Pending',
        'Pending',
        all.filter((x) => x.status === 'Pending').length,
        '',
        null,
        '#F79009',
      ),
      K('a:over', 'Overdue', all.filter(over).length, '', null, '#F04438'),
      K(
        'a:Approved',
        'Approved Today',
        all.filter(
          (x) =>
            x.status === 'Approved' && dayKey(x.updatedAt, d.tz) === d.today,
        ).length,
        '',
        null,
        '#12A150',
      ),
      K(
        'a:Rejected',
        'Rejected',
        all.filter((x) => x.status === 'Rejected').length,
        '',
        null,
        '#98A2B3',
      ),
      K(
        'a:Escalated',
        'Escalated',
        all.filter((x) => x.status === 'Escalated').length,
        '',
        null,
        '#F04438',
      ),
    ];
    if (!all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No approvals',
          'Approvals appear when a contract, amendment, template or document is submitted.',
          [],
        ),
      ];
    const L = all.filter(
      (x) =>
        (!f.st ||
          (f.st === 'mine'
            ? mine.includes(x)
            : f.st === 'over'
              ? over(x)
              : x.status === f.st)) &&
        (!f.kind || x.kind === f.kind),
    );
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'apr',
          filters: {
            search: null,
            sels: [
              sel2('st', 'Status', f.st, [
                ['', 'Any status'],
                ['mine', 'Awaiting me'],
                ['over', 'Overdue'],
                'Pending',
                'Approved',
                'Rejected',
                'Changes Requested',
                'Escalated',
                'Cancelled',
              ]),
              sel2('kind', 'Record type', f.kind, [
                ['', 'Any record'],
                'Contract',
                'Amendment',
                'Document',
                'Template',
              ]),
            ],
            nOn: nOn(f),
            count: `${L.length} approvals`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Document / contract',
                  'Approval type',
                  'Current step',
                  'Approver',
                  ['Requested by', '1'],
                  'Requested',
                  'Due',
                  'Status',
                ]),
                rows: L.map((x) => {
                  const steps = x.steps as unknown as Step[];
                  const cs = cur(x);
                  const due = this.data.off(d, x.dueOn)!;
                  return row(
                    x.id,
                    [
                      cell({
                        t: this.aprEnt(d, x).t,
                        fw: 800,
                        fg: '#101828',
                        s: `${x.kind} · ${x.number}`,
                      }),
                      cell({ t: x.type, s: x.reason, mw: '240px' }),
                      cell({
                        t: cs
                          ? `${cs.role} (${steps.indexOf(cs) + 1}/${steps.length})`
                          : 'Done',
                      }),
                      cell({ t: cs ? this.data.name(d, cs.userId) : '—' }),
                      cell({ t: this.data.name(d, x.requestedById), opt: '1' }),
                      cell({ t: this.data.dday(d, x.createdAt) }),
                      cell({
                        t: this.data.dday(d, x.dueOn),
                        s: this.data.rel(due),
                        fg: over(x) ? '#B42318' : '#344054',
                      }),
                      stc(x.status),
                    ],
                    [
                      'Open',
                      ...(cs && a.approve && (cs.userId === a.userId || a.owner)
                        ? ['Decide']
                        : []),
                    ],
                    [
                      `${this.aprEnt(d, x).t} · ${x.type}`,
                      `${cs ? this.data.name(d, cs.userId) : x.status} · due ${this.data.dday(d, x.dueOn)}`,
                      [chipOf(x.status)],
                    ],
                  );
                }),
              }
            : null,
          empty: L.length
            ? null
            : {
                t: 'No approvals match these filters.',
                d: '',
                acts: [btn('clear:apr', 'Clear Filters', 'primary')],
              },
          info: `Approvals run inside Contracts, step by step, with approvers from Settings › Approvals (an unset step goes to the Owner). ${d.cfg.approvals.fourEyes ? 'Four-eyes: a requester can never approve their own request — enforced server-side.' : 'Four-eyes control is off.'}`,
        }),
      ]),
    ];
  }

  // ===== 8 Expiries =========================================================

  expActs(d: Data, e: Exp) {
    const o = ['Open renewal'];
    if (d.a.manage) {
      if (
        e.kind === 'Contract' &&
        !['Renewed', 'Renewal Draft', 'Will Not Renew'].includes(e.st)
      )
        o.push('Create renewal draft');
      if (e.repl) o.push('Request replacement');
      if (!['Renewed', 'Will Not Renew', 'Expired'].includes(e.st))
        o.push('Snooze');
      o.push('Create task', 'Notify owner');
      if (
        e.kind === 'Contract' &&
        !['Renewed', 'Will Not Renew'].includes(e.st)
      )
        o.push('Mark will not renew');
    }
    o.push('Open source');
    return o;
  }

  vExpiries(d: Data) {
    const all = this.data
      .expiries(d)
      .filter((e) => this.data.inBranch(d, e.branchId));
    const f = this.F(d, 'exp');
    const q = (f.q ?? '').trim().toLowerCase();
    const within = (n: number) =>
      all.filter((e) => e.exp >= 0 && e.exp <= n).length;
    const kpis = [
      K('e:7', 'Due 7 Days', within(7), '', null, '#F04438'),
      K('e:30', 'Due 30 Days', within(30), '', null, '#F79009'),
      K('e:90', 'Due 90 Days', within(90), '', null, '#98A2B3'),
      K(
        'e:rev',
        'Renewal Review',
        all.filter((e) => e.st === 'Review Required').length,
        '',
        null,
        '#F79009',
      ),
      K(
        'e:auto',
        'Auto-Renew',
        all.filter((e) => e.auto && e.exp >= 0).length,
        'Renews unless notice given',
        null,
        '#6941C6',
      ),
      K(
        'e:notice',
        'Notice Deadline',
        all.filter(
          (e) =>
            e.notice != null &&
            e.notice < 0 &&
            e.exp >= 0 &&
            !['Renewed', 'Will Not Renew', 'Renewal Draft'].includes(e.st),
        ).length,
        'Passed without decision',
        '#B42318',
        '#F04438',
      ),
      K(
        'e:exp',
        'Expired',
        all.filter(
          (e) => e.exp < 0 && !['Renewed', 'Will Not Renew'].includes(e.st),
        ).length,
        '',
        null,
        '#F04438',
      ),
      K(
        'e:repl',
        'Replacement Required',
        all.filter((e) => e.repl && e.exp <= 30).length,
        'Licences & certificates',
        null,
        '#F79009',
      ),
    ];
    const sg = seg(
      [
        ['list', 'List'],
        ['cal', 'Calendar'],
      ],
      d.s.view.expView || 'list',
    );
    if (!all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'Nothing expiring',
          'Expiry dates on contracts, documents and compliance evidence appear here.',
          [],
        ),
      ];
    if (d.s.view.expView === 'cal') {
      const dow = (new Date(`${d.today}T12:00:00Z`).getUTCDay() + 6) % 7;
      const start = -dow - 7;
      const days: {
        d: string;
        bd: string;
        bg: string;
        fw: number;
        fg: string;
        items: { id: string; t: string; bg: string; fg: string }[];
      }[] = [];
      for (let i = 0; i < 70; i++) {
        const n = start + i;
        const items = all
          .filter((e) => e.exp === n || e.notice === n)
          .map((e) => ({
            id: e.id,
            t: `${e.notice === n && e.exp !== n ? 'Notice: ' : ''}${e.title}`,
            bg: e.exp < 0 || (e.notice === n && n < 0) ? '#FEF3F2' : '#FEF6E7',
            fg: e.exp < 0 || (e.notice === n && n < 0) ? '#B42318' : '#B54708',
          }));
        days.push({
          d: new Date(
            `${keyPlus(n, d.tz, d.now)}T12:00:00Z`,
          ).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            timeZone: 'UTC',
          }),
          bd: n === 0 ? '#12A150' : '#E6EAF0',
          bg: n < 0 ? '#FAFBFC' : '#fff',
          fw: n === 0 ? 800 : 600,
          fg: n === 0 ? '#0E8442' : '#475467',
          items,
        });
      }
      return [
        kpiRow(kpis),
        R('minmax(0,1fr)', [
          card({
            id: 'exp-cal',
            seg: sg,
            title: `Expiries & notice deadlines (${d.tz})`,
            cal: {
              aria: 'Expiry calendar',
              head: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              days,
            },
          }),
        ]),
      ];
    }
    const L = all.filter(
      (e) =>
        (!q || `${e.title} ${e.ref} ${e.owner}`.toLowerCase().includes(q)) &&
        (!f.due ||
          (f.due === 'past' ? e.exp < 0 : e.exp >= 0 && e.exp <= +f.due)) &&
        (!f.owner || e.owner === this.data.name(d, f.owner)) &&
        (!f.type || e.kind === f.type) &&
        (!f.st || e.st === f.st) &&
        (!f.auto || (f.auto === 'yes') === e.auto) &&
        (!f.repl || e.repl),
    );
    const dd = (n: number | null) =>
      n == null ? '—' : this.data.dday(d, this.data.dateIn(d, n));
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'exp',
          seg: sg,
          filters: {
            search: 'Search expiring items',
            q: f.q ?? '',
            sels: [
              sel2('due', 'Due window', f.due, [
                ['', 'Any due window'],
                ['7', '7 days'],
                ['30', '30 days'],
                ['90', '90 days'],
                ['past', 'Already expired'],
              ]),
              sel2('type', 'Type', f.type, [
                ['', 'Any type'],
                'Contract',
                'Document',
                'Compliance',
              ]),
              sel2('owner', 'Owner', f.owner, [
                ['', 'Any owner'],
                ...this.owners(d, [
                  ...d.contracts.map((c) => c.ownerId),
                  ...d.docs.map((x) => x.ownerId),
                  ...d.comp.map((x) => x.ownerId),
                ]).filter(([, n]) => all.some((e) => e.owner === n)),
              ]),
              sel2('st', 'Renewal status', f.st, [
                ['', 'Any status'],
                'Not Due',
                'Upcoming',
                'Review Required',
                'Renewal Draft',
                'Renewed',
                'Will Not Renew',
                'Snoozed',
                'Expired',
              ]),
              sel2('auto', 'Auto renew', f.auto, [
                ['', 'Auto-renew: any'],
                ['yes', 'Auto-renews'],
                ['no', 'Manual'],
              ]),
              sel2('repl', 'Replacement', f.repl, [
                ['', 'Any'],
                ['1', 'Replacement needed'],
              ]),
            ],
            nOn: nOn(f, ['q']),
            count: `${L.length} items`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Document / contract',
                  'Type',
                  ['Owner', '1'],
                  'Expiry',
                  ['Renewal window', '1'],
                  'Notice deadline',
                  'Auto renew',
                  'Replacement',
                  'Status',
                ]),
                rows: L.map((e) =>
                  row(
                    e.id,
                    [
                      cell({
                        t: e.title,
                        fw: 800,
                        fg: '#101828',
                        s: `${e.kind} · ${e.ref}`,
                      }),
                      cell({ t: e.type }),
                      cell({ t: e.owner, opt: '1' }),
                      cell({
                        t: dd(e.exp),
                        s: this.data.rel(e.exp),
                        fg:
                          e.exp < 0
                            ? '#B42318'
                            : e.exp <= 30
                              ? '#B54708'
                              : '#344054',
                      }),
                      cell({ t: `${dd(e.exp - 90)} → ${dd(e.exp)}`, opt: '1' }),
                      cell({
                        t: dd(e.notice),
                        s:
                          e.notice != null && e.notice < 0 && e.exp >= 0
                            ? 'Passed'
                            : this.data.rel(e.notice),
                        fg:
                          e.notice != null && e.notice < 0 && e.exp >= 0
                            ? '#B42318'
                            : '#344054',
                        fw: 700,
                      }),
                      cell({ t: e.auto ? 'Yes' : 'No' }),
                      cell({ t: e.repl ? 'Required' : '—' }),
                      stc(e.st),
                    ],
                    this.expActs(d, e),
                    [
                      e.title,
                      `Expires ${dd(e.exp)} · notice ${dd(e.notice)}`,
                      [chipOf(e.st)],
                    ],
                  ),
                ),
              }
            : null,
          empty: L.length
            ? null
            : {
                t: 'Nothing matches these filters.',
                d: '',
                acts: [btn('clear:exp', 'Clear Filters', 'primary')],
              },
          info: `Renewal never edits the old end date — it creates a renewal draft (a new contract) that goes through approval and signature. Auto-renew contracts extend by the same term at expiry unless marked “will not renew”. Reminders at ${d.cfg.contract.renewal.join(', ')} before expiry, in ${d.tz}.`,
        }),
      ]),
    ];
  }

  // ===== 9 Compliance =======================================================

  cmpActs(d: Data, x: Cmp) {
    const a = d.a;
    const st = this.data.cmpSt(d, x);
    const o = ['Open'];
    if (a.compliance && !x.archivedAt) {
      const e = this.data.off(d, x.expiresOn);
      if (st === 'Missing Evidence' || (e != null && e <= 30) || x.docId)
        o.push(x.docId ? 'Upload replacement' : 'Upload evidence');
      if (x.mandatoryAck && x.version) o.push('Request acknowledgement');
      if (x.docId) o.push('Publish');
      o.push('Archive');
    }
    if (a.compliance && x.archivedAt) o.push('Restore');
    if (
      x.mandatoryAck &&
      x.version &&
      !x.archivedAt &&
      this.data.audience(d, x).some((m) => m.id === a.userId) &&
      !x.acks.some(
        (k) =>
          k.userId === a.userId &&
          k.version === x.version &&
          k.status === 'Acknowledged',
      )
    )
      o.push('Acknowledge');
    if (x.docId && a.evidence) o.push('Evidence pack');
    return uniq(o);
  }

  audLabel(d: Data, aud: string) {
    return aud.startsWith('Branch:')
      ? `Branch: ${this.data.branchName(d, aud.slice(7))}`
      : aud;
  }

  vCompliance(d: Data) {
    const a = d.a;
    const all = d.comp;
    const f = this.F(d, 'cmp');
    const st = (x: Cmp) => this.data.cmpSt(d, x);
    const live = all.filter((x) => !x.archivedAt);
    const pend = live.reduce(
      (s, x) =>
        s + (this.data.ackTotals(d, x).tot - this.data.ackTotals(d, x).done),
      0,
    );
    const kpis = [
      K(
        'k:Active',
        'Active Documents',
        live.filter((x) =>
          ['Active', 'Acknowledgement Pending', 'Expiring Soon'].includes(
            st(x),
          ),
        ).length,
        '',
        null,
        '#12A150',
      ),
      K(
        'k:Expiring Soon',
        'Expiring Soon',
        live.filter(
          (x) =>
            x.expiresOn &&
            this.data.off(d, x.expiresOn)! >= 0 &&
            this.data.off(d, x.expiresOn)! <= 30,
        ).length,
        '',
        null,
        '#F79009',
      ),
      K(
        'k:Missing Evidence',
        'Missing Evidence',
        live.filter((x) => st(x) === 'Missing Evidence').length,
        '',
        '#B42318',
        '#F04438',
      ),
      K(
        'k:Acknowledgement Pending',
        'Acknowledgement Pending',
        pend,
        `${live.filter((x) => this.data.ackTotals(d, x).done < this.data.ackTotals(d, x).tot).length} document(s)`,
        null,
        '#F79009',
      ),
      K(
        'k:Expired',
        'Expired',
        live.filter((x) => st(x) === 'Expired').length,
        '',
        null,
        '#F04438',
      ),
      K(
        'k:att',
        'Compliance Attention',
        live.filter((x) =>
          ['Missing Evidence', 'Expired', 'Expiring Soon'].includes(st(x)),
        ).length,
        'Missing, expired or expiring',
        null,
        '#F04438',
      ),
    ];
    if (!all.length)
      return [
        kpiRow(kpis),
        ...emptyRows(
          'No compliance documents',
          'Register licences, certificates, policies and acknowledgements.',
          [btn('cmp-up', 'Upload', 'primary', !a.compliance)],
        ),
      ];
    const L = all.filter(
      (x) =>
        (!f.st || st(x) === f.st) &&
        (!f.type || x.type === f.type) &&
        (f.st === 'Archived' || !x.archivedAt),
    );
    return [
      kpiRow(kpis),
      R('minmax(0,1fr)', [
        card({
          id: 'cmp',
          acts: [btn('cmp-up', 'Upload', 'primary', !a.compliance)],
          filters: {
            search: null,
            sels: [
              sel2('st', 'Status', f.st, [
                ['', 'Any status'],
                'Active',
                'Expiring Soon',
                'Expired',
                'Missing Evidence',
                'Acknowledgement Pending',
                'Archived',
              ]),
              sel2('type', 'Type', f.type, [
                ['', 'Any type'],
                ...uniq(all.map((x) => x.type)),
              ]),
            ],
            nOn: nOn(f),
            count: `${L.length} documents`,
          },
          table: L.length
            ? {
                hasActs: true,
                cols: cols([
                  'Document',
                  'Type',
                  ['Jurisdiction', '1'],
                  ['Owner', '1'],
                  'Version',
                  'Effective',
                  'Expiry',
                  'Audience',
                  'Acknowledgement',
                  'Status',
                ]),
                rows: L.map((x) => {
                  const t = this.data.ackTotals(d, x);
                  const e = this.data.off(d, x.expiresOn);
                  const doc = this.data.doc(d, x.docId);
                  return row(
                    x.id,
                    [
                      cell({
                        t: x.title,
                        fw: 800,
                        fg: '#101828',
                        s: doc?.number ?? 'No evidence file',
                      }),
                      cell({ t: x.type }),
                      cell({ t: x.jurisdiction, opt: '1' }),
                      cell({ t: this.data.name(d, x.ownerId), opt: '1' }),
                      cell({ t: x.version ? `v${x.version}` : '—' }),
                      cell({ t: this.data.dday(d, x.effectiveOn) }),
                      cell({
                        t: this.data.dday(d, x.expiresOn),
                        s: e == null ? '' : this.data.rel(e),
                        fg: e != null && e < 0 ? '#B42318' : '#344054',
                      }),
                      cell({ t: this.audLabel(d, x.audience) }),
                      cell({
                        t: x.mandatoryAck
                          ? `${t.done} / ${t.tot}`
                          : 'Not required',
                        fg:
                          x.mandatoryAck && t.done < t.tot
                            ? '#B54708'
                            : '#344054',
                        fw: 700,
                      }),
                      stc(st(x)),
                    ],
                    this.cmpActs(d, x),
                    [
                      x.title,
                      `${x.type} · ${x.expiresOn ? `expires ${this.data.dday(d, x.expiresOn)}` : 'no expiry'}`,
                      [chipOf(st(x))],
                    ],
                  );
                }),
              }
            : null,
          empty: L.length
            ? null
            : {
                t: 'No documents match these filters.',
                d: '',
                acts: [btn('clear:cmp', 'Clear Filters', 'primary')],
              },
          info: 'Status means “required evidence is present according to your configured policy” — Noxtill never states you are legally compliant. Acknowledgements are tracked for staff (in-app requests).',
        }),
      ]),
    ];
  }

  // ===== 10 Settings ========================================================

  async vSettings(d: Data) {
    const s = await this.ctx.ensure(d.a.rootId);
    const sec = CT_SECS.find((x) => x[0] === d.s.sec) ?? CT_SECS[0];
    const dis = !d.a.settings;
    const T = (l: string, k: string, o: Record<string, unknown> = {}) =>
      fTog(l, `config.${k}`, false, { dis, ...o });
    const N = (l: string, k: string, o: Record<string, unknown> = {}) =>
      fTxt(l, `config.${k}`, '', { type: 'number', dis, ...o });
    const X = (l: string, k: string, o: Record<string, unknown> = {}) =>
      fTxt(l, `config.${k}`, '', { dis, ...o });
    const S = (
      l: string,
      k: string,
      opts: (string | { v: string; t: string })[],
      o: Record<string, unknown> = {},
    ) => fSel(l, `config.${k}`, '', opts, { dis, ...o });
    const C = (
      l: string,
      k: string,
      opts: string[],
      o: Record<string, unknown> = {},
    ) => fChips(l, `config.${k}`, opts, [], { dis, ...o });
    const people = [
      { v: '', t: 'Not set — the Owner decides' },
      ...d.members.map((m) => ({ v: m.id, t: `${m.name} · ${m.label}` })),
    ];
    const email = this.settings.emailHealth();
    const F: Record<string, unknown[]> = {
      numbering: [
        X('Document prefix', 'numbering.docPrefix'),
        X('Contract pattern', 'numbering.ctrPattern'),
        S('Sequence reset', 'numbering.reset', ['Never', 'Yearly']),
        fRead(
          'Next contract number',
          `${await this.ctx.previewContractNumber(d.a.rootId)} (reserved on create, never in the browser)`,
        ),
      ],
      files: [
        C('Allowed file types', 'files.types', FILE_TYPES),
        N('Max file size (MB)', 'files.maxMb'),
        N('Files per upload', 'files.perUpload'),
        T('Extract text for comparison & signing preview', 'files.preview', {
          h: 'PDF and DOCX text is extracted on upload; images and spreadsheets are stored as-is.',
        }),
        fRead(
          'Malware scanning',
          'Not connected — no virus scanner is configured. Files are checked for type and size only.',
          { fg: '#B54708' },
        ),
      ],
      folders: [
        C(
          'Default folders',
          'folders.list',
          uniq([
            ...d.cfg.folders.list,
            'Contracts',
            'Suppliers',
            'Customers',
            'HR',
            'Compliance',
            'Projects',
            'Assets',
            'Finance',
          ]),
        ),
        T('Branch sub-folders', 'folders.branchDefaults', {
          h: 'Documents carry their branch; filtering by branch works in every folder.',
        }),
        T('Module-linked folders', 'folders.moduleFolders'),
      ],
      retention: [
        S('Default retention', 'retention.default', RETENTIONS),
        S(
          'Archive behaviour',
          'retention.archive',
          ['Archive when expired', 'Manual archive only'],
          {
            h: 'Archive when expired: expired, terminated and renewed contracts are archived 30 days after they end.',
          },
        ),
        S('Deletion', 'retention.deletion', [
          'Owner approval after retention ends',
          'Never delete',
        ]),
        fRead(
          'Legal hold',
          `${d.docs.filter((x) => x.legalHold).length} document(s) on hold — place or release a hold from the document’s actions (needs contracts.settings).`,
        ),
      ],
      sensitivity: ['Public', 'Internal', 'Confidential', 'Restricted'].map(
        (k) => X(k, `sensitivity.${k}`),
      ),
      contract: [
        S('Default owner', 'contract.ownerId', [
          { v: '', t: 'Whoever creates the contract' },
          ...d.members.map((m) => ({ v: m.id, t: m.name })),
        ]),
        C('Renewal reminders', 'contract.renewal', [
          '90 days',
          '60 days',
          '30 days',
          '14 days',
          '7 days',
          '1 day',
        ]),
        C('Notice reminders', 'contract.notice', [
          '30 days',
          '14 days',
          '7 days',
          '1 day',
        ]),
        N('“Expiring” window (days)', 'contract.expiringDays', {
          h: 'Active contracts move to Expiring this many days before their end date.',
        }),
        S('Retention', 'contract.retention', RETENTIONS),
      ],
      esign: [
        fRead(
          'Provider',
          'Noxtill eSign (built in) — no third-party account needed',
        ),
        fRead('Email delivery', email.message, {
          fg: email.ok ? '#0E8442' : '#B54708',
        }),
        C('Signature methods', 'esign.methods', ['Typed', 'Drawn']),
        S('Default signing order', 'esign.order', ['Sequential', 'Parallel']),
        S('Reminder cadence', 'esign.reminders', Object.keys(REMIND_DAYS)),
        N('Request expiry (days)', 'esign.expiryDays'),
        fBtns('', [btn('test-prov', 'Check email delivery')]),
      ],
      auth: [
        C('Allowed methods', 'auth.methods', ['Email', 'Email + OTP']),
        N('Require OTP above value', 'auth.otpAbove', {
          h: `Contracts with a referenced value above this need Email + OTP (${d.biz.currency}).`,
        }),
        T('Require OTP for employment contracts', 'auth.otpEmployees'),
        fRead(
          'SMS OTP / ID verification',
          'Not available — Noxtill eSign verifies signers by email and an emailed one-time code.',
        ),
      ],
      approvals: [
        N('Finance approval above', 'approvals.threshold', {
          h: `Contract value (${d.biz.currency}) above which Finance must approve.`,
        }),
        S('Finance approver', 'approvals.financeUserId', people),
        S('HR approver', 'approvals.hrUserId', people),
        T('HR approves employment contracts', 'approvals.employmentHr'),
        S('Legal / compliance approver', 'approvals.legalUserId', people, {
          h: 'Approves documents uploaded with “requires approval”.',
        }),
        S('Authorized signatory', 'approvals.signatoryUserId', people),
        N('Approval due (days)', 'approvals.dueDays'),
        T('Four-eyes (requester can’t approve)', 'approvals.fourEyes', {
          h: 'Enforced server-side.',
        }),
      ],
      notify: Object.entries({
        approval: 'Approval request',
        signature: 'Signature completed',
        reminder: 'Signature reminder',
        expiry: 'Expiry',
        renewal: 'Renewal',
        failed: 'Failed delivery / declined',
        ack: 'Acknowledgement',
      }).map(([k, l]) => T(l, `notify.${k}`)),
    };
    return {
      nav: CT_SECS.map(([k, t]) => ({ k, t })),
      sec: { k: sec[0], t: sec[1], d: sec[2] },
      v: s.version,
      readOnly: dis,
      roText: `Read-only for ${d.a.roleLabel}. People with “contracts.settings” change these settings.`,
      fields: [
        ...(F[sec[0]] ?? []),
        fBtns('', [
          btn('set-validate', 'Validate'),
          btn('set-reset', 'Reset section', 'ghost', dis),
        ]),
      ],
      saved: { config: d.cfg as unknown as Record<string, unknown> },
      liveSecs: [] as string[],
    };
  }

  /** Options the modals need — every option is a real record. */
  options(d: Data) {
    return {
      members: d.members.map((m) => ({
        v: m.id,
        t: m.name,
        label: m.label,
        email: m.email,
      })),
      parties: d.partyList.map((p) => ({
        v: `${p.kind}:${p.id}`,
        t: `${p.name} · ${p.module}`,
        email: p.email,
        module: p.module,
      })),
      links: d.linkList,
      branches: d.group.map((g) => ({ v: g.id, t: g.name })),
      folders: d.cfg.folders.list,
      templates: d.templates
        .filter((t) => t.status !== 'Archived' && this.tplInfo(d, t).pub)
        .map((t) => ({
          v: t.id,
          t: `${t.name} · v${this.tplInfo(d, t).pub!.version}`,
          type: t.type,
          roles: t.roles,
        })),
      docs: this.data
        .docs(d)
        .filter((x) => !x.archivedAt)
        .map((x) => ({
          v: x.id,
          t: `${x.number} · ${x.title}`,
          status: x.status,
          version: this.data.cur(x)?.version ?? 1,
          hasFile: !!this.data.cur(x)?.storageKey,
        })),
      signable: this.data
        .docs(d)
        .filter(
          (x) =>
            !x.archivedAt &&
            this.data.cur(x)?.storageKey &&
            this.data.cur(x)?.state !== 'Signed' &&
            !d.sigs.some(
              (s) =>
                s.docId === x.id &&
                ['Prepared', ...SIG_LIVE].includes(s.status),
            ),
        )
        .map((x) => {
          const c = d.contracts.find((y) => y.docId === x.id);
          return {
            v: x.id,
            t: `${x.title} · v${this.data.cur(x)?.version} · ${x.status}`,
            contract: c
              ? {
                  number: c.number,
                  status: c.status,
                  signer: c.signerDraft,
                  cpRole:
                    c.cpKind === 'supplier'
                      ? 'Supplier'
                      : c.cpKind === 'staff'
                        ? 'Employee'
                        : 'Customer',
                }
              : null,
          };
        }),
      signatory: d.cfg.approvals.signatoryUserId
        ? (d.members.find((m) => m.id === d.cfg.approvals.signatoryUserId) ??
          null)
        : null,
      cfg: {
        types: d.cfg.files.types,
        maxMb: d.cfg.files.maxMb,
        perUpload: d.cfg.files.perUpload,
        threshold: d.cfg.approvals.threshold,
        fourEyes: d.cfg.approvals.fourEyes,
        authMethods: d.cfg.auth.methods,
        order: d.cfg.esign.order,
        reminders: d.cfg.esign.reminders,
        expiryDays: d.cfg.esign.expiryDays,
        retention: d.cfg.contract.retention,
        sensitivity: d.cfg.sensitivity,
        otpAbove: d.cfg.auth.otpAbove,
      },
      roles: SIGNER_ROLES,
      currency: d.biz.currency,
      today: d.today,
      nextNumber: '',
    };
  }
}
