import { apiFetch, BASE_URL } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { useBranchContextStore } from "@/store/branch-context-store";
import type { PBtn, PChip, PField, PRowGroup, PSel } from "@/lib/payments-api";

const P = "/contracts";
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const qs = (q: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const enc = encodeURIComponent;

export type CtScope = {
  tab: string;
  branch: string;
  f: Record<string, Record<string, string>>;
  page: Record<string, number>;
  view: Record<string, string>;
  cur: string;
  sec: string;
};

export interface CtHead {
  title: string;
  sub: string;
  icon: string;
  roleLabel: string;
  tabs: { k: string; label: string; path: string; badge: string | null }[];
  hdrActs: PBtn[];
  sels: PSel[];
  more: { v: string; t: string }[];
  loadedAt: string;
  me: string;
}

export interface CtSettingsView {
  nav: { k: string; t: string }[];
  sec: { k: string; t: string; d: string };
  v: number;
  readOnly: boolean;
  roText: string;
  fields: PField[];
  saved: { config: Record<string, unknown> };
  liveSecs: string[];
}

export interface CtScreen {
  head: CtHead;
  rows?: PRowGroup[];
  screenLabel?: string;
  settings?: CtSettingsView;
  gate?: { t: string; d: string };
}

export type CtItem = { a: string; c: string; b: string; d: string };
export interface CtDrawer {
  kicker: string;
  title: string;
  badges: PChip[];
  sections: { h: string; warn?: string | null; text?: string; kv?: { k: string; v: string }[]; bullets?: string[]; items?: CtItem[] }[];
  hasActs: boolean;
  acts: PBtn[];
  ref?: Record<string, unknown>;
}

type Opt = { v: string; t: string };
export interface CtOptions {
  members: (Opt & { label: string; email: string | null })[];
  parties: (Opt & { email: string | null; module: string })[];
  links: { module: string; id: string; label: string }[];
  branches: Opt[];
  folders: string[];
  templates: (Opt & { type: string; roles: unknown })[];
  docs: (Opt & { status: string; version: number; hasFile: boolean })[];
  signable: (Opt & { contract: { number: string; status: string; signer: { name?: string; email?: string; order?: string; auth?: string } | null; cpRole: string } | null })[];
  signatory: { id: string; name: string; email: string | null } | null;
  cfg: { types: string[]; maxMb: number; perUpload: number; threshold: number; fourEyes: boolean; authMethods: string[]; order: string; reminders: string; expiryDays: number; retention: string; sensitivity: Record<string, string>; otpAbove: number };
  roles: string[];
  currency: string;
  today: string;
  nextNumber: string;
  projects: Opt[];
  rights: Record<"upload" | "documents" | "delete" | "manage" | "approve" | "terminate" | "evidence" | "compliance" | "value" | "restricted" | "export" | "settings" | "contracts" | "owner", boolean>;
}

function headers() {
  const token = useAuthStore.getState().accessToken;
  const branch = useBranchContextStore.getState().selectedBranchId;
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { "X-Branch": branch } : {}) };
}

/** Multipart POST through the same auth/branch headers as apiFetch. */
async function upload<T>(path: string, data: unknown, files: [string, File | null | undefined][] = []): Promise<T> {
  const fd = new FormData();
  fd.append("data", JSON.stringify(data));
  for (const [k, f] of files) if (f) fd.append(k, f);
  const r = await fetch(`${BASE_URL}${path}`, { method: "POST", headers: headers(), body: fd });
  const text = await r.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!r.ok) throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? `Upload failed (${r.status})`);
  return body as T;
}

/** Authenticated file download (export / evidence pack) — keeps auth off the URL. */
async function download(path: string, fallback: string) {
  const r = await fetch(`${BASE_URL}${path}`, { headers: headers() });
  if (!r.ok) {
    const t = await r.text();
    let m = `Download failed (${r.status})`;
    try {
      m = (JSON.parse(t) as { error?: { message?: string } }).error?.message ?? m;
    } catch {
      /* not JSON */
    }
    throw new Error(m);
  }
  const blob = await r.blob();
  const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? fallback;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return Number(r.headers.get("X-Row-Count") ?? 0);
}

type Ok = Record<string, unknown>;
const sq = (s: Partial<CtScope>) => qs(s as Record<string, unknown>);

export const ctApi = {
  screen: (s: CtScope) => apiFetch<CtScreen>(`${P}/screen${sq(s)}`),
  drawer: (kind: string, id: string, s: CtScope) => apiFetch<CtDrawer>(`${P}/drawer/${kind}/${enc(id || "_")}${sq(s)}`),
  options: () => apiFetch<CtOptions>(`${P}/options`),
  exportFile: (what: string, format: string, s: CtScope, ids: string[] = []) => download(`${P}/export${qs({ ...s, what, format, ids: ids.join(",") })}`, `contracts.${format}`),
  evidence: (kind: "sig" | "cmp", id: string) => download(`${P}/evidence/${kind}/${enc(id)}`, "evidence.json"),

  // documents
  duplicate: (title: string, type: string) => apiFetch<{ hit: { id: string; number: string; title: string; sameFile: boolean } | null }>(`${P}/documents/duplicate${qs({ title, type })}`),
  uploadDocs: (data: Ok, files: File[]) => upload<{ id: string; number: string; title: string; status: string }[]>(`${P}/documents`, data, files.map((f) => ["files", f] as [string, File])),
  newVersion: (id: string, note: string, file: File | null) => upload<{ version: number }>(`${P}/documents/${enc(id)}/version`, { note }, [["file", file]]),
  move: (ids: string[], folder: string) => apiFetch<Ok>(`${P}/documents/move`, json("POST", { ids, folder })),
  tag: (ids: string[], tags: string) => apiFetch<Ok>(`${P}/documents/tag`, json("POST", { ids, tags })),
  share: (id: string, userIds: string[], perm: string) => apiFetch<Ok>(`${P}/documents/${enc(id)}/share`, json("POST", { userIds, perm })),
  archiveDoc: (id: string, reason: string) => apiFetch<Ok>(`${P}/documents/${enc(id)}/archive`, json("POST", { reason })),
  restoreDoc: (id: string) => apiFetch<Ok>(`${P}/documents/${enc(id)}/restore`, json("POST", {})),
  deleteDoc: (id: string, reason: string) => apiFetch<Ok>(`${P}/documents/${enc(id)}/delete`, json("POST", { reason })),
  hold: (id: string, reason: string | null) => apiFetch<Ok>(`${P}/documents/${enc(id)}/hold`, json("POST", { reason })),
  downloadDoc: (id: string, v?: number) => apiFetch<{ url: string; name: string | null }>(`${P}/documents/${enc(id)}/download${v ? `?v=${v}` : ""}`),
  folder: (name: string) => apiFetch<Ok>(`${P}/folders`, json("POST", { name })),
  requestDoc: (party: string, what: string, due: string) => apiFetch<{ to: string }>(`${P}/documents/request`, json("POST", { party, what, due })),

  // templates
  saveTemplate: (id: string | null, b: Ok) => apiFetch<{ id: string; number: string; version: number }>(id ? `${P}/templates/${enc(id)}` : `${P}/templates`, json("POST", b)),
  dupTemplate: (id: string) => apiFetch<{ number: string }>(`${P}/templates/${enc(id)}/duplicate`, json("POST", {})),
  publish: (id: string) => apiFetch<{ status: string; approval?: string }>(`${P}/templates/${enc(id)}/publish`, json("POST", {})),
  archiveTemplate: (id: string) => apiFetch<Ok>(`${P}/templates/${enc(id)}/archive`, json("POST", {})),

  // contracts
  preview: (b: Ok) => apiFetch<{ text: string; open: string[]; number: string }>(`${P}/preview`, json("POST", b)),
  create: (b: Ok, file: File | null) => upload<{ id: string; number: string; docNumber: string; status: string }>(`${P}/all`, b, [["file", file]]),
  edit: (id: string, b: Ok) => apiFetch<{ version: number; note: string }>(`${P}/all/${enc(id)}/edit`, json("POST", b)),
  submit: (id: string, note: string) => apiFetch<{ approval: string; steps: number; status: string }>(`${P}/all/${enc(id)}/submit`, json("POST", { note })),
  archive: (id: string, reason: string) => apiFetch<Ok>(`${P}/all/${enc(id)}/archive`, json("POST", { reason })),
  terminate: (id: string, b: { eff: string; reason: string; typed: string }) => apiFetch<Ok>(`${P}/all/${enc(id)}/terminate`, json("POST", b)),
  renew: (id: string, end: string, changes: string) => apiFetch<{ number: string }>(`${P}/all/${enc(id)}/renew`, json("POST", { end, changes })),
  wnr: (id: string, reason: string, notify: boolean) => apiFetch<{ sent: boolean }>(`${P}/all/${enc(id)}/wnr`, json("POST", { reason, notify })),
  snooze: (b: { key: string; until: string; reason: string; ok: boolean }) => apiFetch<Ok>(`${P}/expiries/snooze`, json("POST", b)),
  message: (b: { kind: "notify" | "replace"; key: string; msg: string }) => apiFetch<{ to: string }>(`${P}/expiries/message`, json("POST", b)),
  term: (id: string, b: Ok, termId?: string) => apiFetch<Ok>(`${P}/all/${enc(id)}/terms${termId ? `/${termId}` : ""}`, json("POST", b)),
  obligation: (id: string, b: Ok) => apiFetch<Ok>(`${P}/all/${enc(id)}/obligations`, json("POST", b)),
  oblDone: (id: string, oblId: string, b: Ok) => apiFetch<{ next: string }>(`${P}/all/${enc(id)}/obligations/${oblId}/done`, json("POST", b)),
  task: (b: Ok) => apiFetch<{ number: string }>(`${P}/tasks`, json("POST", b)),
  amend: (id: string, b: Ok) => apiFetch<{ number: string; docNumber: string }>(`${P}/all/${enc(id)}/amendments`, json("POST", b)),
  submitAmend: (id: string, amendId: string, note: string) => apiFetch<{ approval: string }>(`${P}/all/${enc(id)}/amendments/${amendId}/submit`, json("POST", { note })),
  bulkOwner: (ids: string[], ownerId: string) => apiFetch<{ n: number }>(`${P}/bulk/owner`, json("POST", { ids, ownerId })),
  bulkReview: (ids: string[], note: string) => apiFetch<{ n: number }>(`${P}/bulk/review`, json("POST", { ids, note })),

  // approvals
  decide: (id: string, b: { dec: string; comment: string; toUserId: string | null }) => apiFetch<{ status: string; message: string }>(`${P}/approvals/${enc(id)}/decide`, json("POST", b)),

  // signatures
  prepare: (b: Ok) => apiFetch<{ number: string; status: string; message?: string }>(`${P}/signatures`, json("POST", b)),
  send: (id: string) => apiFetch<{ message: string }>(`${P}/signatures/${enc(id)}/send`, json("POST", {})),
  remind: (id: string) => apiFetch<{ to: string[] }>(`${P}/signatures/${enc(id)}/remind`, json("POST", {})),
  link: (id: string, signerId: string) => apiFetch<{ url: string; note: string }>(`${P}/signatures/${enc(id)}/link`, json("POST", { signerId })),
  void: (id: string, reason: string) => apiFetch<Ok>(`${P}/signatures/${enc(id)}/void`, json("POST", { reason })),
  signedDoc: (id: string) => apiFetch<{ url: string; name: string | null }>(`${P}/signatures/${enc(id)}/signed`),

  // compliance
  newCompliance: (b: Ok, file: File | null) => upload<{ number: string; doc: string | null }>(`${P}/compliance`, b, [["file", file]]),
  cmpUpload: (id: string, b: Ok, file: File | null) => upload<{ version: number }>(`${P}/compliance/${enc(id)}/upload`, b, [["file", file]]),
  cmpPublish: (id: string) => apiFetch<{ requested: number }>(`${P}/compliance/${enc(id)}/publish`, json("POST", {})),
  cmpRequestAck: (id: string, scope: string, msg: string) => apiFetch<{ n: number }>(`${P}/compliance/${enc(id)}/request-ack`, json("POST", { scope, msg })),
  cmpAck: (id: string) => apiFetch<Ok>(`${P}/compliance/${enc(id)}/ack`, json("POST", {})),
  cmpArchive: (id: string, reason: string) => apiFetch<Ok>(`${P}/compliance/${enc(id)}/archive`, json("POST", { reason })),
  cmpRestore: (id: string) => apiFetch<Ok>(`${P}/compliance/${enc(id)}/restore`, json("POST", {})),

  // settings
  saveSettings: (b: { expectedVersion: number; config: Record<string, unknown> }) => apiFetch<{ version: number; changed: string[] }>(`${P}/settings`, json("POST", b)),
  validateSettings: (config: Record<string, unknown>) => apiFetch<{ ok: boolean }>(`${P}/settings/validate`, json("POST", { config })),
  emailHealth: () => apiFetch<{ ok: boolean; message: string }>(`${P}/settings/email-health`),
};

// ── public signing page (no staff auth) ─────────────────────────────────
export interface SignView {
  business: string;
  request: string;
  title: string;
  version: number;
  sha256: string | null;
  text: string | null;
  file: { url: string; name: string | null; mime: string | null } | null;
  signer: { name: string; role: string; email: string; status: string; signedAt: string | null };
  others: { name: string; role: string; status: string }[];
  fields: string[];
  methods: string[];
  otp: boolean;
  deadline: string;
  blocked: string | null;
}
async function pub<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE_URL}/public/sign/${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  const b = text ? (JSON.parse(text) as unknown) : null;
  if (!r.ok) throw new Error((b as { error?: { message?: string } } | null)?.error?.message ?? `Request failed (${r.status})`);
  return b as T;
}
export const signApi = {
  view: (t: string) => pub<SignView>(enc(t)),
  otp: (t: string) => pub<{ sent: boolean }>(`${enc(t)}/otp`, {}),
  sign: (t: string, b: { sigType: string; sigData: string; otp?: string; agree: boolean }) => pub<{ signed: boolean; completed: boolean }>(`${enc(t)}/sign`, b),
  decline: (t: string, reason: string) => pub<{ declined: boolean }>(`${enc(t)}/decline`, { reason }),
};
