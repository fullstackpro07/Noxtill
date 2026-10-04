import { apiFetch, BASE_URL } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { useBranchContextStore } from "@/store/branch-context-store";
import type { PBtn, PChip, PField, PRowGroup, PSel } from "@/lib/payments-api";

const P = "/assets-maintenance";
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const qs = (q: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export type AmScope = {
  tab: string;
  branch: string;
  period: string;
  f: Record<string, Record<string, string>>;
  page: Record<string, number>;
  seg: Record<string, string>;
  cur: string;
  sec: string;
  sort: string;
  arch: boolean;
  techAll: boolean;
};

export interface AmHead {
  title: string;
  sub: string;
  icon: string;
  roleLabel: string;
  tabs: { k: string; label: string; path: string; badge: string | null }[];
  hdrActs: PBtn[];
  sels: PSel[];
  more: { v: string; t: string }[];
  loadedAt: string;
}

export interface AmSettingsView {
  nav: { k: string; t: string }[];
  sec: { k: string; t: string; d: string };
  v: number;
  readOnly: boolean;
  roText: string;
  fields: PField[];
  saved: { config: Record<string, unknown>; perms: Record<string, string[]> };
  liveSecs: string[];
}

export interface AmScreen {
  head: AmHead;
  rows?: PRowGroup[];
  screenLabel?: string;
  settings?: AmSettingsView;
}

export type AmItem = { a: string; c: string; b: string; d: string; id?: string };
export interface AmDrawer {
  kicker: string;
  title: string;
  badges: PChip[];
  tabs?: { k: string; t: string; on: boolean }[];
  sections: { h: string; warn?: string | null; text?: string; kv?: { k: string; v: string }[]; bullets?: string[]; items?: AmItem[] }[];
  hasActs: boolean;
  acts: PBtn[];
  ctxId?: string;
  follow?: string;
  checkable?: boolean;
  returnable?: boolean;
  linkable?: boolean;
}

export interface AmOptions {
  me: { id: string; name: string; role: string };
  rights: Record<"create" | "edit" | "transfer" | "retire" | "request" | "approve" | "start" | "complete" | "pm" | "cost" | "export" | "reading" | "settings", boolean>;
  cfg: {
    numbering: { prefix: string; pad: number; manual: boolean; unique: string[] };
    statuses: { allowed: string[] };
    meters: string[];
    mtypes: string[];
    priorities: string[];
    dreasons: string[];
    wtypes: string[];
    issueTypes: string[];
    pm: { lead: number; auto: boolean; reminder: string; tolerance: string };
  };
  nextNumber: string;
  branches: { id: string; name: string }[];
  assets: { id: string; number: string; name: string; status: string; meterType: string | null; meterUnit: string | null; branchId: string | null; condition: string; criticality: string; teamId: string | null; live: boolean }[];
  categories: { id: string; name: string; parentId: string | null; status: string; criticality: string; templateId: string | null; warrantyType: string | null; code: string; lifeYears: number | null; description: string | null }[];
  locations: { id: string; name: string; code: string; type: string; parentId: string | null; branchId: string; status: string; path: string }[];
  teams: { id: string; name: string; members: string[] }[];
  people: { id: string; name: string; role: string }[];
  suppliers: { id: string; name: string }[];
  templates: { id: string; name: string; checklist: string[] }[];
  fields: { id: string; name: string; type: string; options: string[]; categoryIds: string[] }[];
  products: { id: string; name: string; stock: number }[];
  customers: { id: string; name: string }[];
  finAssets: { id: string; number: string; name: string }[];
  finBills: { id: string; label: string }[];
}

export interface AmAssetFull {
  id: string;
  number: string;
  version: number;
  [k: string]: unknown;
}

export interface ImportPreview {
  rows: { row: number; data: Record<string, string>; status: string; why: string }[];
  summary: { total: number; ready: number; held: number; failed: number; blank: number; mapped: string[]; ignored: string[] };
}

const sq = (s: Partial<AmScope> & Record<string, unknown>) => qs(s as Record<string, unknown>);

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

export const amApi = {
  screen: (s: AmScope) => apiFetch<AmScreen>(`${P}/screen${sq(s)}`),
  drawer: (kind: string, id: string, s: AmScope, wtab?: string) => apiFetch<AmDrawer>(`${P}/drawer/${kind}/${encodeURIComponent(id || "_")}${sq({ ...s, wtab })}`),
  options: () => apiFetch<AmOptions>(`${P}/options`),
  lookup: (code: string) => apiFetch<{ id: string; number: string; name: string }>(`${P}/lookup${qs({ code })}`),

  getAsset: (id: string) => apiFetch<Record<string, unknown> & { id: string; number: string; version: number; name: string; status: string }>(`${P}/assets/${id}`),
  woBrief: (id: string) =>
    apiFetch<{ id: string; number: string; status: string; priority: string; type: string; supplier: boolean; asset: { id: string; number: string; name: string; condition: string; status: string; meterType: string | null; meterUnit: string | null }; openDowntime: boolean; parts: { id: string; productId: string; planned: number; issued: number; returned: number }[] }>(`${P}/work-orders/${id}/brief`),
  getPlan: (id: string) => apiFetch<Record<string, unknown> & { id: string; name: string; assetId: string; trigger: string; interval: number; unit: string; nextDueOn: string; nextDueMeter: number | null; meterInterval: number | null; who: string; autoCreate: boolean; leadDays: number; templateId: string | null; tolerance: string }>(`${P}/pm-plans/${id}`),
  createAsset: (b: Record<string, unknown>) => apiFetch<AmAssetFull>(`${P}/assets`, json("POST", b)),
  updateAsset: (id: string, b: Record<string, unknown>) => apiFetch<AmAssetFull>(`${P}/assets/${id}`, json("PATCH", b)),
  status: (id: string, to: string, reason: string) => apiFetch(`${P}/assets/${id}/status`, json("POST", { to, reason })),
  transfer: (id: string, b: Record<string, unknown>) => apiFetch(`${P}/assets/${id}/transfer`, json("POST", b)),
  retire: (id: string, b: Record<string, unknown>) => apiFetch<{ plansClosed: number; requestsCancelled: number }>(`${P}/assets/${id}/retire`, json("POST", b)),
  archive: (id: string, reason: string) => apiFetch(`${P}/assets/${id}/archive`, json("POST", { reason })),
  bulk: (b: Record<string, unknown>) => apiFetch<{ applied: number; skipped: string[] }>(`${P}/assets-bulk`, json("POST", b)),
  uploadDoc: (id: string, file: File, type: string) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", type);
    return upload<{ id: string; name: string }>(`${P}/assets/${id}/docs`, fd);
  },
  docUrl: (id: string) => apiFetch<{ url: string; name: string }>(`${P}/docs/${id}/url`),
  docDel: (id: string) => apiFetch(`${P}/docs/${id}`, json("DELETE")),

  reading: (b: Record<string, unknown>) => apiFetch<{ dueByMeter: string[] }>(`${P}/readings`, json("POST", b)),
  correct: (id: string, value: number, reason: string) => apiFetch(`${P}/readings/${id}/correct`, json("POST", { value, reason })),
  request: (b: Record<string, unknown>) => apiFetch<{ id: string; number: string }>(`${P}/requests`, json("POST", b)),
  reqAction: (id: string, b: Record<string, unknown>) => apiFetch(`${P}/requests/${id}/action`, json("POST", b)),
  convert: (id: string, b: Record<string, unknown>) => apiFetch<{ wo: { number: string }; draft: boolean }>(`${P}/requests/${id}/convert`, json("POST", b)),
  downtime: (b: Record<string, unknown>) => apiFetch(`${P}/downtime`, json("POST", b)),
  downEnd: (id: string) => apiFetch(`${P}/downtime/${id}/end`, json("POST", {})),
  inspect: (b: Record<string, unknown>) => apiFetch(`${P}/inspections`, json("POST", b)),
  service: (b: Record<string, unknown>) => apiFetch(`${P}/services`, json("POST", b)),

  createWo: (b: Record<string, unknown>) => apiFetch<{ wo: { number: string }; draft: boolean; above: boolean; estimate: number }>(`${P}/work-orders`, json("POST", b)),
  move: (id: string, action: string, reason?: string) => apiFetch<{ number: string; status: string }>(`${P}/work-orders/${id}/move`, json("POST", { action, reason })),
  assign: (id: string, who: string) => apiFetch(`${P}/work-orders/${id}/assign`, json("POST", { who })),
  schedule: (id: string, b: Record<string, unknown>) => apiFetch(`${P}/work-orders/${id}/schedule`, json("POST", b)),
  priority: (id: string, priority: string, reason?: string) => apiFetch(`${P}/work-orders/${id}/priority`, json("POST", { priority, reason })),
  check: (id: string, item: string) => apiFetch(`${P}/work-orders/${id}/checklist/${item}`, json("POST", {})),
  addPart: (id: string, productId: string, qty: number) => apiFetch(`${P}/work-orders/${id}/parts`, json("POST", { productId, qty })),
  issue: (id: string) => apiFetch<{ issued: string[]; short: string[] }>(`${P}/work-orders/${id}/parts/issue`, json("POST", {})),
  returnPart: (id: string, part: string, qty: number) => apiFetch(`${P}/work-orders/${id}/parts/${part}/return`, json("POST", { qty })),
  labor: (id: string, b: Record<string, unknown>) => apiFetch<{ rated: boolean }>(`${P}/work-orders/${id}/labor`, json("POST", b)),
  cost: (id: string, b: Record<string, unknown>) => apiFetch(`${P}/work-orders/${id}/costs`, json("POST", b)),
  billLink: (costId: string, finBillId: string | null) => apiFetch(`${P}/costs/${costId}/bill`, json("POST", { finBillId })),
  complete: (id: string, b: Record<string, unknown>) => apiFetch<{ rolled: boolean; downtimeEnded: boolean }>(`${P}/work-orders/${id}/complete`, json("POST", b)),

  createPlan: (b: Record<string, unknown>) => apiFetch(`${P}/pm-plans`, json("POST", b)),
  updatePlan: (id: string, b: Record<string, unknown>) => apiFetch(`${P}/pm-plans/${id}`, json("PATCH", b)),
  generate: (id: string) => apiFetch<{ number: string }>(`${P}/pm-plans/${id}/generate`, json("POST", {})),
  reschedule: (id: string, date: string, reason: string) => apiFetch(`${P}/pm-plans/${id}/reschedule`, json("POST", { date, reason })),
  planStatus: (id: string, act: string) => apiFetch(`${P}/pm-plans/${id}/status`, json("POST", { act })),
  evaluate: () => apiFetch<{ made: string[]; skipped: string[]; notDue: number }>(`${P}/pm-evaluate`, json("POST", {})),

  saveCategory: (id: string | null, b: Record<string, unknown>) => apiFetch(id ? `${P}/categories/${id}` : `${P}/categories`, json(id ? "PATCH" : "POST", b)),
  catAction: (id: string, act: string, to?: string) => apiFetch(`${P}/categories/${id}/action`, json("POST", { act, to })),
  saveLocation: (id: string | null, b: Record<string, unknown>) => apiFetch(id ? `${P}/locations/${id}` : `${P}/locations`, json(id ? "PATCH" : "POST", b)),
  locAction: (id: string, act: string, to?: string) => apiFetch<{ moved?: number }>(`${P}/locations/${id}/action`, json("POST", { act, to })),
  saveTeam: (id: string | null, b: Record<string, unknown>) => apiFetch(id ? `${P}/teams/${id}` : `${P}/teams`, json(id ? "PATCH" : "POST", b)),
  delTeam: (id: string) => apiFetch(`${P}/teams/${id}`, json("DELETE")),
  saveTemplate: (id: string | null, b: Record<string, unknown>) => apiFetch(id ? `${P}/templates/${id}` : `${P}/templates`, json(id ? "PATCH" : "POST", b)),
  delTemplate: (id: string) => apiFetch(`${P}/templates/${id}`, json("DELETE")),
  addField: (b: Record<string, unknown>) => apiFetch(`${P}/fields`, json("POST", b)),
  delField: (id: string) => apiFetch(`${P}/fields/${id}`, json("DELETE")),

  saveSettings: (b: Record<string, unknown>) => apiFetch<{ version: number; changed: string[] }>(`${P}/settings`, json("PATCH", b)),
  saveView: (name: string, filters: Record<string, unknown>) => apiFetch<{ id: string }>(`${P}/views`, json("POST", { name, filters })),
  getView: (id: string) => apiFetch<{ id: string; name: string; filters: Record<string, string> }>(`${P}/views/${id}`),
  dismiss: (key: string) => apiFetch(`${P}/insights/${encodeURIComponent(key)}/dismiss`, json("POST", {})),
  importPreview: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return upload<ImportPreview>(`${P}/import/preview`, fd);
  },
  importCommit: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return upload<{ created: string[]; held: unknown[]; failed: string[] }>(`${P}/import/commit`, fd);
  },
};

/** Downloads an export with the session's auth and branch headers. */
export async function amDownload(s: AmScope, what: string, format: string): Promise<string> {
  const token = useAuthStore.getState().accessToken;
  const branch = useBranchContextStore.getState().selectedBranchId;
  const res = await fetch(`${BASE_URL}${P}/export${sq({ ...s, what, format })}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { "X-Branch": branch } : {}) } });
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
