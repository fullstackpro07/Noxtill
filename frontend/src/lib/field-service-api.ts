import { apiFetch, BASE_URL } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { useBranchContextStore } from "@/store/branch-context-store";
import type { PBtn, PChip, PField, PRowGroup, PSel } from "@/lib/payments-api";

const P = "/field-service";
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const qs = (q: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export type FsScope = {
  tab: string;
  zone: string;
  f: Record<string, Record<string, string>>;
  page: Record<string, number>;
  view: Record<string, string>;
  cur: string;
  sec: string;
  dDay: number;
  techView: string;
};

export interface FsHead {
  title: string;
  sub: string;
  icon: string;
  roleLabel: string;
  tabs: { k: string; label: string; path: string; badge: string | null }[];
  hdrActs: PBtn[];
  sels: PSel[];
  more: { v: string; t: string }[];
  lock: string | null;
  loadedAt: string;
  me: string;
  techOnly: boolean;
}

export interface FsSettingsView {
  nav: { k: string; t: string }[];
  sec: { k: string; t: string; d: string };
  v: number;
  readOnly: boolean;
  roText: string;
  fields: PField[];
  saved: { config: Record<string, unknown> };
  liveSecs: string[];
}

export interface FsScreen {
  head: FsHead;
  rows?: PRowGroup[];
  screenLabel?: string;
  settings?: FsSettingsView;
  gate?: { t: string; d: string };
}

export type FsItem = { a: string; c: string; b: string; d: string; id?: string };
export interface FsDrawer {
  kicker: string;
  title: string;
  badges: PChip[];
  sections: { h: string; warn?: string | null; text?: string; kv?: { k: string; v: string }[]; bullets?: string[]; items?: FsItem[] }[];
  hasActs: boolean;
  acts: PBtn[];
  decidable?: boolean;
  ref?: Record<string, unknown> & { parts?: { id: string; productId: string; name: string; left: number }[] };
}

export interface FsOptions {
  me: { id: string; name: string; role: string; techOnly: boolean };
  rights: Record<"request" | "workorder" | "dispatch" | "execute" | "parts" | "approve" | "plan" | "agreement" | "money" | "pii" | "export" | "settings", boolean>;
  cfg: { priorities: string[]; territories: string[]; skills: string[]; certs: string[]; sla: Record<string, number[]>; labor: { overlap: boolean; manualReason: boolean; roundMin: number; overtimeAfter: number }; offline: { enabled: boolean; maxHours: number }; proof: { signature: boolean; afterPhoto: boolean; resolution: boolean }; breakMin: number; version: number; warrantyEvidence: string };
  next: { wo: string; sr: string };
  services: { id: string; code: string; name: string; skill: string; cert: string | null; durMin: number; priority: string; proof: string; parts: string[]; laborProductId: string | null; templateId: string | null; active: boolean }[];
  templates: { id: string; code: string; name: string; version: number; status: string; serviceTypeId: string | null }[];
  techs: { id: string; name: string; skills: string[]; certs: string[]; territories: string[]; shiftStart: number; shiftEnd: number; tracking: boolean; active: boolean }[];
  people: { id: string; name: string; role: string }[];
  sites: { id: string; customerId: string; label: string; address: string; zone: string; access: string | null; safety: string | null }[];
  equipment: { id: string; number: string; name: string; serial: string | null; customerId: string | null; meterType: string | null; categoryId: string | null; siteId: string | null }[];
  customers: { id: string; name: string; phone: string | null }[];
  products: { id: string; name: string; sku: string | null; stock: number }[];
  serviceProducts: { id: string; name: string }[];
  contracts: { id: string; number: string; title: string; status: string; customerId: string }[];
  suppliers: { id: string; name: string }[];
  wos: { id: string; number: string; customerId: string; techUserId: string | null; status: string; version: number }[];
}

type Msg = { ok?: boolean; msg?: string; approval?: boolean };

/** Multipart upload through the same auth/branch headers as apiFetch. */
async function upload<T>(path: string, fd: FormData): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const branch = useBranchContextStore.getState().selectedBranchId;
  const r = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { "X-Branch": branch } : {}) },
    body: fd,
  });
  const text = await r.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!r.ok) {
    const e = (body as { error?: { message?: string } } | null)?.error?.message ?? `Upload failed (${r.status})`;
    throw new Error(e);
  }
  return body as T;
}

const sq = (s: Partial<FsScope> & Record<string, unknown>) => qs(s as Record<string, unknown>);
const wo = (id: string) => `${P}/work-orders/${encodeURIComponent(id)}`;

export const fsApi = {
  screen: (s: FsScope) => apiFetch<FsScreen>(`${P}/screen${sq(s)}`),
  drawer: (kind: string, id: string, s: FsScope) => apiFetch<FsDrawer>(`${P}/drawer/${kind}/${encodeURIComponent(id || "_")}${sq(s)}`),
  options: () => apiFetch<FsOptions>(`${P}/options`),
  fileUrl: (id: string) => apiFetch<{ url: string; name: string }>(`${P}/files/${id}`),

  // requests
  createRequest: (data: Record<string, unknown>, photo: File | null) => {
    const fd = new FormData();
    fd.set("data", JSON.stringify(data));
    if (photo) fd.append("photos", photo);
    return upload<{ id?: string; number?: string; dup?: string }>(`${P}/requests`, fd);
  },
  triage: (id: string, b: Record<string, unknown>) => apiFetch<Msg & { next?: string | null }>(`${P}/requests/${id}/triage`, json("POST", b)),
  convert: (id: string, b: Record<string, unknown>) => apiFetch<Msg & { id: string; number: string }>(`${P}/requests/${id}/convert`, json("POST", b)),
  moreInfo: (id: string, text: string) => apiFetch<Msg>(`${P}/requests/${id}/more-info`, json("POST", { text })),
  rejectReq: (id: string, b: { reason: string; cust?: string }) => apiFetch<Msg>(`${P}/requests/${id}/reject`, json("POST", b)),
  fromAssets: (kind: "req" | "wo", id: string) => apiFetch<{ id: string; number: string; msg: string }>(`${P}/from-assets/${kind}/${id}`, json("POST", {})),
  helpdesk: (id: string, reason?: string) => apiFetch<Msg>(`${P}/requests/${id}/helpdesk`, json("POST", { reason })),

  // work orders
  createWo: (b: Record<string, unknown>) => apiFetch<{ id: string; number: string; status: string }>(`${P}/work-orders`, json("POST", b)),
  bulk: (b: Record<string, unknown>) => apiFetch<{ done: string[]; skip: string[] }>(`${P}/work-orders/bulk`, json("POST", b)),
  approve: (id: string) => apiFetch<Msg>(`${wo(id)}/approve`, json("POST", {})),
  submit: (id: string) => apiFetch<Msg>(`${wo(id)}/submit`, json("POST", {})),
  suggest: (id: string, day: number, h?: number) => apiFetch<{ h: number; version: number; tech: string | null; list: { id: string; name: string; score: number; blocks: string[]; warns: string[] }[] }>(`${wo(id)}/suggest${qs({ day, h })}`),
  preview: (id: string, b: { tech: string; day: number; h: number }) => apiFetch<{ e: { blocks: string[]; warns: string[]; score: number; tr: number | null; from: string | null; comps: [string, number, number][] }; name: string; start: string; end: string; version: number }>(`${wo(id)}/preview`, json("POST", b)),
  assign: (id: string, b: Record<string, unknown>) => apiFetch<Msg & { notice?: string; warns?: string[] }>(`${wo(id)}/assign`, json("POST", b)),
  schedule: (id: string, b: Record<string, unknown>) => apiFetch<Msg & { label?: string; notice?: string }>(`${wo(id)}/schedule`, json("POST", b)),
  priority: (id: string, b: Record<string, unknown>) => apiFetch<Msg>(`${wo(id)}/priority`, json("POST", b)),
  cancel: (id: string, reason: string) => apiFetch<Msg>(`${wo(id)}/cancel`, json("POST", { reason })),
  dispatch: (id: string) => apiFetch<Msg & { notice?: string; tech?: string }>(`${wo(id)}/dispatch`, json("POST", {})),
  tech: (id: string, b: Record<string, unknown>) => apiFetch<Msg>(`${wo(id)}/tech`, json("POST", b)),
  checklist: (id: string, b: Record<string, unknown>) => apiFetch<Msg>(`${wo(id)}/checklist`, json("POST", b)),
  sign: (id: string, b: Record<string, unknown>) => apiFetch<Msg>(`${wo(id)}/sign`, json("POST", b)),
  note: (id: string, b: Record<string, unknown>) => apiFetch<Msg>(`${wo(id)}/note`, json("POST", b)),
  help: (id: string) => apiFetch<Msg>(`${wo(id)}/help`, json("POST", {})),
  photo: (id: string, stage: string, file: File) => {
    const fd = new FormData();
    fd.set("stage", stage);
    fd.set("file", file);
    return upload<Msg>(`${wo(id)}/photos`, fd);
  },
  complete: (id: string, b: Record<string, unknown>) => apiFetch<Msg>(`${wo(id)}/complete`, json("POST", b)),
  close: (id: string) => apiFetch<Msg>(`${wo(id)}/close`, json("POST", {})),
  reopen: (id: string, reason: string) => apiFetch<Msg>(`${wo(id)}/reopen`, json("POST", { reason })),
  quote: (id: string) => apiFetch<Msg>(`${wo(id)}/quote`, json("POST", {})),
  invoice: (id: string) => apiFetch<Msg>(`${wo(id)}/invoice`, json("POST", {})),
  payLink: (id: string) => apiFetch<Msg>(`${wo(id)}/pay-link`, json("POST", {})),
  saveReport: (id: string, html: string) => apiFetch<Msg>(`${wo(id)}/report`, json("POST", { html })),
  sendReport: (id: string, summary: string) => apiFetch<Msg>(`${wo(id)}/report/send`, json("POST", { summary })),
  notify: (id: string) => apiFetch<Msg>(`${wo(id)}/notify`, json("POST", {})),

  // parts
  addPart: (id: string, b: { productId: string; qty: number }) => apiFetch<Msg>(`${wo(id)}/parts`, json("POST", b)),
  partAct: (id: string, partId: string, act: "reserve" | "issue") => apiFetch<Msg>(`${wo(id)}/parts/${partId}/${act}`, json("POST", {})),
  usePart: (id: string, partId: string, b: Record<string, unknown>) => apiFetch<Msg>(`${wo(id)}/parts/${partId}/use`, json("POST", b)),
  returnPart: (id: string, partId: string, b: Record<string, unknown>) => apiFetch<Msg>(`${wo(id)}/parts/${partId}/return`, json("POST", b)),
  procure: (id: string, partId: string, supplierId: string) => apiFetch<Msg>(`${wo(id)}/parts/${partId}/procure`, json("POST", { supplierId })),

  // labor
  addLabor: (b: Record<string, unknown>) => apiFetch<Msg>(`${P}/labor`, json("POST", b)),
  editLabor: (id: string, b: Record<string, unknown>) => apiFetch<Msg>(`${P}/labor/${id}`, json("PATCH", b)),
  laborAct: (id: string, act: string, reason?: string) => apiFetch<Msg>(`${P}/labor/${id}/act`, json("POST", { act, reason })),

  // plans, templates, inspections
  savePlan: (id: string | null, b: Record<string, unknown>) => apiFetch<Msg>(id ? `${P}/plans/${id}` : `${P}/plans`, json(id ? "PATCH" : "POST", b)),
  planStatus: (id: string, active: boolean) => apiFetch<Msg>(`${P}/plans/${id}/status`, json("POST", { active })),
  generate: (id: string) => apiFetch<Msg & { dup?: boolean }>(`${P}/plans/${id}/generate`, json("POST", {})),
  addTemplate: (b: Record<string, unknown>) => apiFetch<Msg>(`${P}/templates`, json("POST", b)),
  templateAct: (id: string, act: string) => apiFetch<Msg>(`${P}/templates/${id}/act`, json("POST", { act })),
  approveIns: (id: string) => apiFetch<Msg>(`${P}/inspections/${id}/approve`, json("POST", {})),

  // agreements & warranty
  saveAgreement: (id: string | null, b: Record<string, unknown>) => apiFetch<Msg>(id ? `${P}/agreements/${id}` : `${P}/agreements`, json(id ? "PATCH" : "POST", b)),
  agreementStatus: (id: string, suspend: boolean, reason: string) => apiFetch<Msg>(`${P}/agreements/${id}/status`, json("POST", { suspend, reason })),
  openCase: (b: Record<string, unknown>) => apiFetch<Msg & { number?: string }>(`${P}/warranty`, json("POST", b)),
  wrn: (id: string, act: "validate" | "request-evidence" | "close") => apiFetch<Msg>(`${P}/warranty/${id}/${act}`, json("POST", {})),
  evidence: (id: string, file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    return upload<Msg>(`${P}/warranty/${id}/evidence`, fd);
  },
  approveWrn: (id: string, reason: string) => apiFetch<Msg>(`${P}/warranty/${id}/approve`, json("POST", { reason })),
  rejectWrn: (id: string, b: Record<string, unknown>) => apiFetch<Msg>(`${P}/warranty/${id}/reject`, json("POST", b)),

  // approvals, lock, settings, records
  decide: (id: string, approve: boolean, reason?: string) => apiFetch<Msg>(`${P}/approvals/${id}`, json("POST", { approve, reason })),
  lock: (on: boolean) => apiFetch<Msg>(`${P}/dispatch/lock`, json("POST", { on })),
  saveSettings: (b: { expectedVersion: number; config: Record<string, unknown>; reason?: string }) => apiFetch<{ version: number; changed: string[] }>(`${P}/settings`, json("POST", b)),
  diff: (config: Record<string, unknown>) => apiFetch<{ changes: string[]; needsReason: boolean }>(`${P}/settings/diff`, json("POST", { config })),
  saveSvc: (id: string | null, b: Record<string, unknown>) => apiFetch<Msg>(id ? `${P}/service-types/${id}` : `${P}/service-types`, json(id ? "PATCH" : "POST", b)),
  svcActive: (id: string, active: boolean) => apiFetch<Msg>(`${P}/service-types/${id}/active`, json("POST", { active })),
  saveTech: (b: Record<string, unknown>) => apiFetch<Msg>(`${P}/technicians`, json("POST", b)),
  techStatus: (userId: string, status: string) => apiFetch<Msg>(`${P}/technicians/${userId}/status`, json("POST", { status })),
  messageTech: (userId: string, text: string) => apiFetch<Msg>(`${P}/technicians/${userId}/message`, json("POST", { text })),
  saveSite: (id: string | null, b: Record<string, unknown>) => apiFetch<Msg>(id ? `${P}/sites/${id}` : `${P}/sites`, json(id ? "PATCH" : "POST", b)),
  equipmentSite: (assetId: string, siteId: string) => apiFetch<Msg>(`${P}/equipment/${assetId}/site`, json("POST", { siteId })),
};

/** Download an export through the authenticated fetch (keeps auth headers off the URL). */
export async function fsDownload(what: string, format: string, s: FsScope, ids: string[] = []) {
  const token = useAuthStore.getState().accessToken;
  const branch = useBranchContextStore.getState().selectedBranchId;
  const r = await fetch(`${BASE_URL}${P}/export${sq({ ...s, what, format, ids: ids.join(",") })}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { "X-Branch": branch } : {}) },
  });
  if (!r.ok) {
    const t = await r.text();
    let m = `Export failed (${r.status})`;
    try {
      m = (JSON.parse(t) as { error?: { message?: string } }).error?.message ?? m;
    } catch {
      /* not JSON */
    }
    throw new Error(m);
  }
  const blob = await r.blob();
  const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? `field-service.${format}`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return Number(r.headers.get("X-Row-Count") ?? 0);
}
