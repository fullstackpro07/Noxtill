import { Injectable } from '@nestjs/common';
import type { CtExpiryState, Prisma } from '@prisma/client';
import { Fmt } from '../payments/pay-vm';
import { dayKey, keyPlus } from '../field-service/fs-time';
import { CtActor, CtContextService, Party, num } from './ct-context.service';
import { CtConfig } from './ct.constants';

export interface CtScope {
  tab: string;
  branch: string;
  f: Record<string, Record<string, string>>;
  page: Record<string, number>;
  /** docView, docCols, ctCols, dTab, expView */
  view: Record<string, string>;
  /** Current contract id (detail screen). */
  cur: string;
  sec: string;
}

export function parseCtScope(q: Record<string, unknown>): CtScope {
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
  return {
    tab: str(q.tab, 'overview'),
    branch: str(q.branch, ''),
    f: j(q.f) as Record<string, Record<string, string>>,
    page: j(q.page) as Record<string, number>,
    view: j(q.view) as Record<string, string>,
    cur: str(q.cur, ''),
    sec: str(q.sec, 'numbering'),
  };
}

const docInclude = {
  versions: { orderBy: { version: 'asc' } },
} satisfies Prisma.CtDocumentInclude;
const tplInclude = {
  versions: { orderBy: { version: 'asc' } },
} satisfies Prisma.CtTemplateInclude;
const ctInclude = {
  terms: { orderBy: { createdAt: 'asc' } },
  obls: { orderBy: { dueOn: 'asc' } },
  amends: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CtContractInclude;
const sigInclude = {
  signers: { orderBy: { seq: 'asc' } },
} satisfies Prisma.CtSignRequestInclude;
const cmpInclude = { acks: true } satisfies Prisma.CtComplianceInclude;

export type Doc = Prisma.CtDocumentGetPayload<{ include: typeof docInclude }>;
export type Tpl = Prisma.CtTemplateGetPayload<{ include: typeof tplInclude }>;
export type Ctr = Prisma.CtContractGetPayload<{ include: typeof ctInclude }>;
export type Sig = Prisma.CtSignRequestGetPayload<{
  include: typeof sigInclude;
}>;
export type Cmp = Prisma.CtComplianceGetPayload<{ include: typeof cmpInclude }>;
export type Obl = Ctr['obls'][number];
export type Apr = Prisma.CtApprovalGetPayload<object>;
export type Step = {
  role: string;
  userId: string | null;
  status: string;
  at: string | null;
  comment?: string | null;
};

export interface Exp {
  id: string;
  kind: 'Contract' | 'Document' | 'Compliance';
  ref: string;
  refId: string;
  title: string;
  type: string;
  owner: string;
  exp: number;
  notice: number | null;
  auto: boolean;
  repl: boolean;
  st: string;
  branchId: string | null;
}

export interface Data {
  a: CtActor;
  s: CtScope;
  cfg: CtConfig;
  fmt: Fmt;
  tz: string;
  now: Date;
  today: string;
  biz: {
    id: string;
    name: string;
    currency: string;
    timezone: string;
    address: string | null;
  };
  group: { id: string; name: string; parentId: string | null }[];
  names: Map<string, string>;
  members: Awaited<ReturnType<CtContextService['members']>>;
  parties: Map<string, Party>;
  partyList: Party[];
  docs: Doc[];
  templates: Tpl[];
  contracts: Ctr[];
  sigs: Sig[];
  approvals: Apr[];
  comp: Cmp[];
  states: Map<string, CtExpiryState>;
  /** `${module}|${id}` → live label of a linked record. */
  links: Map<string, string>;
  linkList: { module: string; id: string; label: string }[];
}

@Injectable()
export class CtDataService {
  constructor(private readonly ctx: CtContextService) {}

  private get db() {
    return this.ctx.db;
  }

  async load(a: CtActor, s: CtScope): Promise<Data> {
    const rootId = a.rootId;
    const where = { businessId: rootId };
    const [
      cfg,
      biz,
      group,
      members,
      partyList,
      docs,
      templates,
      contracts,
      sigs,
      approvals,
      comp,
      states,
      linkList,
    ] = await Promise.all([
      this.ctx.config(rootId),
      this.ctx.business(rootId),
      this.ctx.branches(rootId),
      this.ctx.members(rootId),
      this.ctx.parties(rootId),
      this.db.ctDocument.findMany({
        where,
        include: docInclude,
        orderBy: { updatedAt: 'desc' },
      }),
      this.db.ctTemplate.findMany({
        where,
        include: tplInclude,
        orderBy: { number: 'asc' },
      }),
      this.db.ctContract.findMany({
        where,
        include: ctInclude,
        orderBy: { number: 'desc' },
      }),
      this.db.ctSignRequest.findMany({
        where,
        include: sigInclude,
        orderBy: { number: 'desc' },
      }),
      this.db.ctApproval.findMany({ where, orderBy: { number: 'desc' } }),
      this.db.ctCompliance.findMany({
        where,
        include: cmpInclude,
        orderBy: { number: 'asc' },
      }),
      this.db.ctExpiryState.findMany({ where }),
      this.ctx.linkTargets(rootId),
    ]);
    const tz = biz.timezone || 'UTC';
    const now = new Date();
    return {
      a,
      s,
      cfg,
      fmt: new Fmt(biz.currency || 'PKR', tz),
      tz,
      now,
      today: dayKey(now, tz),
      biz: { ...biz, timezone: tz },
      group,
      names: new Map(members.map((m) => [m.id, m.name])),
      members,
      parties: new Map(partyList.map((p) => [`${p.kind}:${p.id}`, p])),
      partyList,
      docs,
      templates,
      contracts,
      sigs,
      approvals,
      comp,
      states: new Map(states.map((x) => [x.key, x])),
      links: new Map(linkList.map((x) => [`${x.module}|${x.id}`, x.label])),
      linkList,
    };
  }

  // ── lookups & dates ─────────────────────────────────────────────────────

  name(d: Data, id: string | null | undefined) {
    return id ? (d.names.get(id) ?? 'Former staff') : '—';
  }
  party(d: Data, kind: string, id: string): Party {
    return (
      d.parties.get(`${kind}:${id}`) ?? {
        kind: kind as Party['kind'],
        id,
        name: 'Removed record',
        module:
          kind === 'customer'
            ? 'Customers CRM'
            : kind === 'supplier'
              ? 'Suppliers'
              : 'People & Payroll',
        type: '—',
        email: null,
        phone: null,
        address: null,
        businessId: null,
      }
    );
  }
  linkName(d: Data, module: string | null, id: string | null) {
    if (!module) return '—';
    if (!id) return 'No record';
    return d.links.get(`${module}|${id}`) ?? 'Removed record';
  }
  branchName(d: Data, id: string | null | undefined) {
    return (id && d.group.find((g) => g.id === id)?.name) || '—';
  }
  /** Whole business days from today to a date (null-safe). */
  off(d: Data, x: Date | null | undefined): number | null {
    if (!x) return null;
    return Math.round(
      (Date.parse(x.toISOString().slice(0, 10)) - Date.parse(d.today)) /
        86400000,
    );
  }
  dday(d: Data, x: Date | null | undefined) {
    if (!x) return '—';
    return new Date(
      `${x.toISOString().slice(0, 10)}T12:00:00Z`,
    ).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }
  rel(n: number | null) {
    if (n == null) return '—';
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    return n > 0 ? `in ${n}d` : `${Math.abs(n)}d ago`;
  }
  dateIn(d: Data, days: number) {
    return new Date(`${keyPlus(days, d.tz, d.now)}T00:00:00Z`);
  }
  money(d: Data, v: number | null | undefined) {
    return v == null ? '—' : d.fmt.money(v);
  }
  val(d: Data, v: Prisma.Decimal | number | null | undefined) {
    return d.a.value ? this.money(d, v == null ? null : num(v)) : '🔒';
  }
  cur(doc: Doc) {
    return doc.versions[doc.versions.length - 1];
  }
  sizeKb(doc: Doc) {
    return doc.versions.reduce((x, v) => x + v.size, 0) / 1024;
  }

  // ── visibility ─────────────────────────────────────────────────────────

  inBranch(d: Data, branchId: string | null) {
    if (d.a.branches && branchId && !d.a.branches.includes(branchId))
      return false;
    if (d.s.branch && branchId !== d.s.branch) return false;
    return true;
  }
  docVisible(d: Data, x: Doc) {
    if (x.sensitivity === 'Restricted' && !d.a.restricted) return false;
    if (!this.inBranch(d, x.branchId)) return false;
    if (
      !d.a.documents &&
      !d.a.manage &&
      x.ownerId !== d.a.userId &&
      !['Public', 'Internal'].includes(x.sensitivity)
    ) {
      const shared =
        Array.isArray(x.shares) && (x.shares as string[]).includes(d.a.userId);
      if (!shared) return false;
    }
    return true;
  }
  ctVisible(d: Data, c: Ctr) {
    if (!d.a.contracts) return false;
    if (c.restricted && !d.a.restricted) return false;
    return this.inBranch(d, c.branchId);
  }
  docs(d: Data) {
    return d.docs.filter((x) => this.docVisible(d, x));
  }
  cts(d: Data) {
    return d.contracts.filter((c) => this.ctVisible(d, c));
  }
  doc(d: Data, id: string | null | undefined) {
    return id ? d.docs.find((x) => x.id === id || x.number === id) : undefined;
  }
  ct(d: Data, id: string | null | undefined) {
    return id
      ? d.contracts.find((x) => x.id === id || x.number === id)
      : undefined;
  }

  // ── derived states ─────────────────────────────────────────────────────

  noticeBy(c: { endOn: Date | null; noticeDays: number }) {
    return c.endOn
      ? new Date(c.endOn.getTime() - c.noticeDays * 86400000)
      : null;
  }
  oblSt(d: Data, o: Obl) {
    if (['Completed', 'Waived', 'Cancelled'].includes(o.status))
      return o.status;
    const n = this.off(d, o.dueOn)!;
    return n < 0 ? 'Overdue' : n <= 7 ? 'Due Soon' : 'Upcoming';
  }
  renSt(d: Data, c: Ctr) {
    const live = c.snoozedUntil && this.off(d, c.snoozedUntil)! >= 0;
    if (c.renewState && (c.renewState !== 'Snoozed' || live))
      return c.renewState;
    if (c.status === 'Renewed') return 'Renewed';
    if (
      d.contracts.some(
        (x) => x.renewalOf === c.id && !['Archived'].includes(x.status),
      )
    )
      return 'Renewal Draft';
    if (!c.endOn) return 'Not Due';
    const e = this.off(d, c.endOn)!;
    if (e < 0 || c.status === 'Expired') return 'Expired';
    if (c.status === 'Renewal Review') return 'Review Required';
    return e <= 90 ? 'Upcoming' : 'Not Due';
  }
  /** Transparent rule: At Risk = notice deadline passed with no decision, or an obligation overdue > 30 days; Attention = expiring within the window, unconfirmed terms or any overdue obligation. */
  risk(d: Data, c: Ctr) {
    if (!['Active', 'Expiring', 'Renewal Review'].includes(c.status))
      return c.status === 'Expired' ? 'Attention' : 'Normal';
    const nb = this.off(d, this.noticeBy(c));
    const decided = ['Renewed', 'Will Not Renew', 'Renewal Draft'].includes(
      this.renSt(d, c),
    );
    const od = c.obls.filter((o) => this.oblSt(d, o) === 'Overdue');
    if (
      (nb != null && nb < 0 && !decided) ||
      od.some((o) => this.off(d, o.dueOn)! < -30)
    )
      return 'At Risk';
    const e = this.off(d, c.endOn);
    if (
      (e != null && e <= d.cfg.contract.expiringDays) ||
      c.terms.some((t) => t.status === 'Needs Review') ||
      od.length
    )
      return 'Attention';
    return 'Normal';
  }
  cmpSt(d: Data, x: Cmp) {
    if (x.archivedAt) return 'Archived';
    if (!x.docId) return 'Missing Evidence';
    const e = this.off(d, x.expiresOn);
    if (e != null && e < 0) return 'Expired';
    if (e != null && e <= 30) return 'Expiring Soon';
    if (x.mandatoryAck && this.ackTotals(d, x).done < this.ackTotals(d, x).tot)
      return 'Acknowledgement Pending';
    return 'Active';
  }
  /** Audience members (staff) for a compliance record, and how many acknowledged the current version. */
  audience(d: Data, x: Cmp) {
    if (x.audience === 'All staff') return d.members;
    if (x.audience.startsWith('Branch:')) {
      const b = x.audience.slice(7);
      return d.members.filter((m) => m.businessId === b);
    }
    return [];
  }
  ackTotals(d: Data, x: Cmp) {
    if (!x.mandatoryAck) return { tot: 0, done: 0 };
    const aud = this.audience(d, x);
    const done = x.acks.filter(
      (k) =>
        k.version === x.version &&
        k.status === 'Acknowledged' &&
        aud.some((m) => m.id === k.userId),
    ).length;
    return { tot: aud.length, done };
  }
  sigActive(s: Sig) {
    return ['Sent', 'Partially Signed'].includes(s.status);
  }

  expiries(d: Data): Exp[] {
    const out: Exp[] = [];
    for (const c of this.cts(d)) {
      if (!c.endOn || ['Archived', 'Draft'].includes(c.status)) continue;
      const nb = this.noticeBy(c);
      out.push({
        id: `c:${c.id}`,
        kind: 'Contract',
        ref: c.number,
        refId: c.id,
        title: c.title,
        type: c.type,
        owner: this.name(d, c.ownerId),
        exp: this.off(d, c.endOn)!,
        notice: this.off(d, nb),
        auto: c.autoRenew,
        repl: false,
        st: this.renSt(d, c),
        branchId: c.branchId,
      });
    }
    for (const x of this.docs(d)) {
      if (
        !x.expiresOn ||
        x.archivedAt ||
        d.contracts.some((c) => c.docId === x.id)
      )
        continue;
      const e = this.off(d, x.expiresOn)!;
      const stt = d.states.get(`d:${x.id}`);
      const snoozed =
        stt?.state === 'Snoozed' &&
        stt.snoozedUntil &&
        this.off(d, stt.snoozedUntil)! >= 0;
      out.push({
        id: `d:${x.id}`,
        kind: 'Document',
        ref: x.number,
        refId: x.id,
        title: x.title,
        type: x.type,
        owner: this.name(d, x.ownerId),
        exp: e,
        notice: e - 30,
        auto: false,
        repl: ['License', 'Certificate', 'Insurance Proof'].includes(x.type),
        st:
          stt && (stt.state !== 'Snoozed' || snoozed)
            ? stt.state
            : e < 0
              ? 'Expired'
              : e <= 30
                ? 'Review Required'
                : e <= 90
                  ? 'Upcoming'
                  : 'Not Due',
        branchId: x.branchId,
      });
    }
    for (const x of d.comp) {
      if (x.docId || !x.expiresOn || x.archivedAt) continue;
      const e = this.off(d, x.expiresOn)!;
      const stt = d.states.get(`k:${x.id}`);
      out.push({
        id: `k:${x.id}`,
        kind: 'Compliance',
        ref: x.number,
        refId: x.id,
        title: x.title,
        type: x.type,
        owner: this.name(d, x.ownerId),
        exp: e,
        notice: e - 30,
        auto: false,
        repl: true,
        st: stt?.state ?? (e < 0 ? 'Expired' : 'Upcoming'),
        branchId: null,
      });
    }
    return out.sort((x, y) => x.exp - y.exp);
  }
}
