import { apiFetch, BASE_URL } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { useBranchContextStore } from "@/store/branch-context-store";

const P = "/payments";
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const qs = (q: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") p.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

// ── view-model shapes (match the design renderer) ───────────────────────────
export type PBtn = { k: string; t: string; bg: string; fg: string; bd: string; dis: boolean; why: string };
export type PCell = { t: string; s: string; bt: string; bfg: string; bbg: string; fw: number; fg: string; ff: string; mw: string; opt: string };
export type PChip = { t: string; fg: string; bg: string };
export type PRow = { id: string; bg: string; acts: string[]; cells: PCell[]; cardT: string; cardS: string; cardB: PChip[]; selLabel: string; actLabel: string };
export type PCol = { t: string; opt: string };
export type PKpi = { k: string; l: string; v: string; sub: string; fg: string; dot: string; aria: string };
export type PSel = { k: string; l: string; v: string; opts: { v: string; t: string }[]; bd: string; bg?: string };
export type PSeg = { k: string; t: string; n: string; on: boolean; bg: string; fg: string; bd: string };
export type PBar = { l: string; v: string; w: string; c: string; aria: string };
export type PField = {
  l: string; key: string; h: string; v: string; cols: string; isSelect: boolean; isText: boolean; isArea: boolean; isToggle: boolean; isChips: boolean; isRead: boolean;
  btns: PBtn[] | null; warn: string | null; warnFg: string; dis: boolean; req: boolean; type: string; ph: string; rows: number; ff: string; fg: string;
  opts?: { v: string; t: string }[]; on?: boolean; tBg?: string; tX?: string; tL?: string; chips?: { v: string; t: string; on: boolean; mark: string; bg: string; fg: string; bd: string }[];
};
export type PCard = {
  card: true; id: string; title: string; sub: string; acts: PBtn[]; seg: PSeg[] | null;
  filters: { search: string | null; q?: string; sels: PSel[]; nOn: number | null; count: string } | null;
  bulk: { n?: number; acts: PBtn[] } | null; table: { sel?: boolean; allOn?: boolean; hasActs: boolean; cols: PCol[]; rows: PRow[] } | null;
  bars: PBar[] | null;
  trend: { legend: { t: string; c: string }[]; note: string; aria: string; cols: { l: string; tip: string; bars: { h: string; c: string }[] }[] } | null;
  qcards: { id: string; t: string; d: string; badge: string; bbg: string; bfg: string; bg: string; aria: string; stats: { l: string; v: string; fg: string }[] }[] | null;
  empty: { t: string; d: string; acts: PBtn[] } | null;
  pager: { t: string; noPrev: boolean; noNext: boolean } | null;
  info: string | null;
  cal: { aria: string; head: string[]; days: { d: string; bd: string; bg: string; fw: number; fg: string; items: { id: string; t: string; bg: string; fg: string }[] }[] } | null;
  kpis: null;
  fields?: PField[] | null;
};
export type PBlock = PCard | { kpis: PKpi[]; card: false };
export type PRowGroup = { cols: string; blocks: PBlock[]; collapse: string };

export interface PayScreen {
  hdr: { title: string; sub: string; icon: string };
  envB: { t: string; bg: string; fg: string; bd: string };
  testBand: boolean;
  hdrSels: PSel[];
  hdrActs: PBtn[];
  tabs: { k: string; label: string; path: string; cur: string | null; fw: number; fg: string; bar: string; badge: string | number | null }[];
  fresh: { label: string; bg: string; bd: string; fg: string; dot: string };
  banner: { t: string; d: string; bg: string; bd: string; fg: string; acts: { k: string; t: string }[] } | null;
  roleLabel: string;
  screenLabel: string;
  isSettings: boolean;
  generic: boolean;
  rows: PRowGroup[];
  se: {
    nav: { k: string; t: string; cur: string | null; bg: string; fg: string; fw: number; dirty: boolean }[];
    sec: { k: string; t: string; d: string };
    v: number;
    readOnly: boolean;
    roText: string;
    fields: PField[];
    policy: Record<string, Record<string, unknown>>;
  } | null;
}

export interface PayDrawer {
  kicker: string;
  title: string;
  badges: PChip[];
  sections: { h: string; warn?: string | null; text?: string; kv?: { k: string; v: string }[]; bullets?: string[]; items?: { a: string; c: string; b: string; d: string }[] }[];
  hasActs: boolean;
  acts: PBtn[];
}

export interface PayBoot {
  actor: { name: string; role: string; roleLabel: string; request: boolean; recover: boolean; refund: boolean; dispute: boolean; recon: boolean; approve: boolean; admin: boolean; fees: boolean; pii: boolean; export: boolean; raw: boolean };
  business: { name: string; currency: string; country: string | null; timezone: string };
  branches: { id: string; name: string; currency: string; country: string | null }[];
  members: { id: string; name: string; role: string }[];
  connections: { provider: string; env: string; status: string; writeEnabled: boolean; country: string | null; currency: string | null }[];
  policy: { liveConfirm: boolean; partialPayments: boolean; minRequest: number; maxRequest: number; requestExpiryDays: number; approvalAbove: number; submitApprovalAbove: number };
}

export type Scope = { tab: string; env: string; branch: string; prov: string; cur: string; period: string; view: Record<string, string>; f: Record<string, Record<string, string>>; page: Record<string, number>; sec: string };
const sq = (s: Partial<Scope>) => qs(s as Record<string, unknown>);

export const payApi = {
  boot: () => apiFetch<PayBoot>(`${P}/boot`),
  screen: (s: Scope) => apiFetch<PayScreen>(`${P}/screen${sq(s)}`),
  drawer: (kind: string, id: string, s: Scope) => apiFetch<PayDrawer>(`${P}/drawer/${kind}/${encodeURIComponent(id || "_")}${sq(s)}`),
  refresh: () => apiFetch<{ errors: string[] }>(`${P}/refresh`, json("POST", {})),
  customers: (q: string) => apiFetch<{ id: string; name: string; tags: string[]; hasPhone: boolean; hasEmail: boolean }[]>(`${P}/customers${qs({ q })}`),

  txRefresh: (id: string) => apiFetch<{ status: string; changed: boolean; note: string }>(`${P}/tx/${id}/refresh`, json("POST", {})),
  capture: (id: string, amount: number | null, liveConfirm: boolean) => apiFetch<{ ok: boolean; note: string; status?: string }>(`${P}/tx/${id}/capture`, json("POST", { amount: amount ?? undefined, liveConfirm })),
  receipt: (id: string) => apiFetch<{ channel: string }>(`${P}/tx/${id}/receipt`, json("POST", {})),

  linkOptions: (customer: string) => apiFetch<Record<string, { id: string; ref: string; amount: number | null }[]>>(`${P}/requests/link-options${qs({ customer })}`),
  reqMethods: (env: string, currency: string) => apiFetch<{ method: string; provider: string }[]>(`${P}/requests/methods${qs({ env, currency })}`),
  createRequest: (b: Record<string, unknown>) => apiFetch<{ id: string; number: string; status: string; url: string }>(`${P}/requests`, json("POST", b)),
  reqLink: (id: string) => apiFetch<{ url: string; status: string }>(`${P}/requests/${id}/link`),
  reqDuplicate: (id: string) => apiFetch<Record<string, unknown>>(`${P}/requests/${id}/duplicate`),
  sendRequest: (id: string, channel: string) => apiFetch<{ channel: string }>(`${P}/requests/${id}/send`, json("POST", { channel })),
  expireRequest: (id: string, reason?: string) => apiFetch(`${P}/requests/${id}/expire`, json("POST", { reason })),
  recordPayment: (id: string, b: { amount: number; method: string; reference?: string; note?: string }) => apiFetch<{ number: string }>(`${P}/requests/${id}/record`, json("POST", b)),

  rcvDraft: (id: string, method: boolean) => apiFetch<{ text: string; source: string }>(`${P}/recovery/${id}/draft${qs({ method: method ? "1" : "0" })}`),
  rcvRetry: (id: string, liveConfirm: boolean) => apiFetch<{ paid: boolean }>(`${P}/recovery/${id}/retry`, json("POST", { liveConfirm })),
  rcvNotify: (id: string, b: { channel?: string; text?: string; method?: boolean }) => apiFetch<{ channel: string }>(`${P}/recovery/${id}/notify`, json("POST", b)),
  rcvOp: (id: string, op: string, reason?: string) => apiFetch(`${P}/recovery/${id}/${op}`, json("POST", { reason })),

  rfExecute: (id: string, amount: number | null, liveConfirm: boolean) => apiFetch<{ status: string; number: string; failure: string | null }>(`${P}/refunds/${id}/execute`, json("POST", { amount: amount ?? undefined, liveConfirm })),
  rfApprove: (id: string, liveConfirm: boolean) => apiFetch<{ status: string; number: string; failure: string | null }>(`${P}/refunds/${id}/approve`, json("POST", { liveConfirm })),
  rfRefresh: (id: string) => apiFetch<{ status: string }>(`${P}/refunds/${id}/refresh`, json("POST", {})),
  rfOutside: (id: string, reason: string) => apiFetch<{ status: string }>(`${P}/refunds/${id}/outside`, json("POST", { reason })),

  dspCandidates: (id: string) => apiFetch<{ available: { key: string; label: string }[]; missing: string[]; response: string; missingRequired: string[] }>(`${P}/disputes/${id}/candidates`),
  dspEvidence: (id: string, keys: string[]) => apiFetch<{ added: number }>(`${P}/disputes/${id}/evidence`, json("POST", { keys })),
  dspDraft: (id: string) => apiFetch<{ text: string; source: string }>(`${P}/disputes/${id}/draft`, json("POST", {})),
  dspSubmit: (id: string, response: string, acceptWeaker: boolean, liveConfirm: boolean) => apiFetch<{ status: string }>(`${P}/disputes/${id}/submit`, json("POST", { response, acceptWeaker, liveConfirm })),
  dspApprove: (id: string, liveConfirm: boolean) => apiFetch<{ status: string }>(`${P}/disputes/${id}/approve`, json("POST", { liveConfirm })),
  dspAccept: (id: string, reason: string, liveConfirm: boolean) => apiFetch(`${P}/disputes/${id}/accept`, json("POST", { reason, liveConfirm })),
  dspAssign: (id: string, userId: string) => apiFetch(`${P}/disputes/${id}/assign`, json("POST", { userId })),

  mandate: (id: string, op: string, b: { reason?: string; liveConfirm?: boolean } = {}) => apiFetch<{ ok?: boolean; paid?: boolean; channel?: string }>(`${P}/mandates/${id}/${op}`, json("POST", b)),

  setMethod: (method: string, b: Record<string, unknown>) => apiFetch(`${P}/routing/methods/${encodeURIComponent(method)}`, json("POST", b)),
  getRule: (id: string) => apiFetch<{ id: string; name: string; level: string; priority: number; method: string; primary: string; fallback: string | null; conditions: Record<string, unknown>; version: number }>(`${P}/routing/rules/${id}`),
  saveRule: (id: string | null, b: Record<string, unknown>) => apiFetch(id ? `${P}/routing/rules/${id}` : `${P}/routing/rules`, json(id ? "PUT" : "POST", b)),
  ruleAction: (id: string, action: string) => apiFetch(`${P}/routing/rules/${id}/action`, json("POST", { action })),
  routeTest: (b: Record<string, unknown>) => apiFetch<{ err?: string; why: string; chosen?: string; pri?: string; fb?: string | null; rule?: { name: string; v: number } | null; steps?: string[]; feeRate?: number | null; settle?: string }>(`${P}/routing/test`, json("POST", b)),
  impact: (b: Record<string, unknown>) => apiFetch<{ n: number; v: number; share: number; high: boolean }>(`${P}/routing/impact`, json("POST", b)),

  reconAuto: () => apiFetch<{ created: number }>(`${P}/recon/auto`, json("POST", {})),
  reconCands: (id: string) => apiFetch<{ id: string; number: string; amount: number; currency: string; at: string; conf: string }[]>(`${P}/recon/${id}/candidates`),
  reconOp: (id: string, op: string, b: Record<string, unknown>) => apiFetch(`${P}/recon/${id}/${op}`, json("POST", b)),

  saveSettings: (version: number, patch: Record<string, Record<string, unknown>>, reason?: string) => apiFetch<{ version: number; pending: boolean; changed: string[] }>(`${P}/settings`, json("PUT", { version, patch, reason })),
  testPolicy: (scenario: string, draft: Record<string, Record<string, unknown>>) => apiFetch<{ result: string }>(`${P}/settings/test`, json("POST", { scenario, draft })),

  decide: (id: string, approve: boolean, comment?: string) => apiFetch<{ ok?: boolean; status?: string }>(`${P}/approvals/${id}`, json("POST", { approve, comment })),
  saveView: (name: string, filters: Record<string, unknown>) => apiFetch<{ id: string }>(`${P}/views`, json("POST", { name, filters })),
  getView: (id: string) => apiFetch<{ id: string; name: string; filters: Record<string, string> }>(`${P}/views/${id}`),
};

/** Downloads an export with the session's auth headers. */
export async function payDownload(q: Record<string, unknown>): Promise<string> {
  const token = useAuthStore.getState().accessToken;
  const branch = useBranchContextStore.getState().selectedBranchId;
  const res = await fetch(`${BASE_URL}${P}/export${qs(q)}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { "X-Branch": branch } : {}) } });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) msg = j.error.message;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "export";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return name;
}

// ── public pay page (no auth) ───────────────────────────────────────────────
export interface PublicPay {
  business: { name: string; phone: string | null; address: string | null; logo: string | null };
  test: boolean;
  status: string;
  amountType: string;
  amountDue: number | null;
  minAmount: number;
  allowPartial: boolean;
  currency: string;
  description: string;
  reference: string | null;
  dueOn: string | null;
  expiresAt: string;
  methods: string[];
  canPayOnline: boolean;
  manualMethods: string[];
  note: string | null;
  paid: number;
}
export const payPublicApi = {
  view: (token: string) => apiFetch<PublicPay>(`/public/pay/${encodeURIComponent(token)}`, {}, { skipAuth: true }),
  viewed: (token: string) => apiFetch(`/public/pay/${encodeURIComponent(token)}/viewed`, json("POST", {}), { skipAuth: true }),
  checkout: (token: string, amount?: number) => apiFetch<{ url: string }>(`/public/pay/${encodeURIComponent(token)}/checkout`, json("POST", { amount }), { skipAuth: true }),
};
