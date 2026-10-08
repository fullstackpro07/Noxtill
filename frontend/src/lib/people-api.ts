import { apiFetch, BASE_URL } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { useBranchContextStore } from "@/store/branch-context-store";
import type { PBtn, PChip, PRowGroup, PSel } from "@/lib/payments-api";

const P = "/people";
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const qs = (q: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "" && v !== false) p.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const enc = encodeURIComponent;

export type PpScope = {
  tab: string;
  branch: string;
  dept: string;
  f: Record<string, Record<string, string>>;
  page: Record<string, number>;
  view: Record<string, string>;
  run: string;
};

export interface PpHead {
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
  banner: { t: string; d: string } | null;
}

export interface PpScreen {
  head: PpHead;
  rows?: PRowGroup[];
  screenLabel?: string;
  gate?: { t: string; d: string };
}

export type PpItem = { a: string; c: string; b: string; d: string };
export interface PpDrawer {
  kicker: string;
  title: string;
  badges: PChip[];
  sections: { h: string; warn?: string | null; text?: string; kv?: { k: string; v: string }[]; bullets?: string[]; items?: PpItem[] }[];
  hasActs: boolean;
  acts: PBtn[];
  ref?: Record<string, unknown> | null;
}

type Opt = { v: string; t: string };
export type PpRights = Record<
  "owner" | "recruit" | "jobApprove" | "interview" | "offerApprove" | "comp" | "salary" | "onboard" | "leaveApprove" | "leaveReason" | "payroll" | "payApprove" | "payout" | "benefits" | "perf" | "perfPrivate" | "training" | "offboard" | "exitReason" | "export" | "pii" | "audit" | "settings",
  boolean
>;
export interface PpOptions {
  me: { uid: string; name: string; inStaff: boolean };
  rights: PpRights;
  scope: "org" | "team" | "self";
  today: string;
  tz: string;
  currency: string;
  period: string;
  members: (Opt & { dept: string; mgr: string | null })[];
  team: Opt[];
  branches: Opt[];
  depts: string[];
  jobs: (Opt & { st: string; mgr: string | null })[];
  cands: (Opt & { stage: string })[];
  courses: (Opt & { roles: string[] })[];
  runs: (Opt & { period: string; final: boolean; lines: { v: string; t: string; payout: string; net: number | null }[] })[];
  cycles: (Opt & { st: string })[];
  rules: (Opt & { method: string })[];
  leaveTypes: { v: string; t: string; bal: number | null; ent: number | null }[];
  lists: { stages: string[]; sources: string[]; empTypes: string[]; workModes: string[]; rounds: string[]; exitTypes: string[]; ruleTypes: string[]; taxTreatments: string[]; courseTypes: string[]; basis: string[]; taxStatus: string[] };
  competencies: string[];
  ratings: string[];
  tasksProject: boolean;
  careers: { slug: string } | null;
  taxTable: boolean;
}

export interface PpProfile {
  uid: string;
  name: string;
  version: number;
  can: { employment: boolean; pay: boolean; bank: boolean; tax: boolean };
  department: string;
  title: string;
  employmentType: string;
  managerUserId: string;
  payBasis: string | null;
  monthlySalary: number | null;
  hourlyRate: number | null;
  startDate: string;
  probationEnd: string;
  contractEnd: string;
  status: string;
  inPayroll: boolean;
  bankName: string | null;
  bankMask: string | null;
  bankTitle: string | null;
  taxStatus: string | null;
  taxMask: string | null;
}

export interface PpSettings {
  version: number;
  config: {
    payroll: { payGroup: string; workingDays: number; standardHours: number; overtimeWarnHours: number; advanceWarnAmount: number | null; separationOfDuties: boolean; costCenter: string; payDay: number; paidFromCode: string | null; departments: string[] };
    tax: { tables: { key: string; version: number; effectiveFrom: string; nonFilerMultiplier: number; source: string }[]; activeKey: string | null };
    leave: { yearStartMonth: number };
    recruiting: { offerApproverUserId: string | null; jobApprovalRequired: boolean; competencies: string[]; hideFeedbackUntilSubmitted: boolean; careersEnabled: boolean; careersIntro: string; retentionMonths: number };
    tasks: { projectId: string | null };
    performance: { ratings: string[] };
  };
  text: { slabs: string; leave: string; onb: string; ofb: string };
  projects: Opt[];
  accounts: Opt[];
  canEdit: boolean;
}

function headers() {
  const token = useAuthStore.getState().accessToken;
  const branch = useBranchContextStore.getState().selectedBranchId;
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { "X-Branch": branch } : {}) };
}

/** Multipart POST through the same auth/branch headers as apiFetch. */
async function upload<T>(path: string, data: unknown, file?: File | null): Promise<T> {
  const fd = new FormData();
  fd.append("data", JSON.stringify(data));
  if (file) fd.append("file", file);
  const r = await fetch(`${BASE_URL}${path}`, { method: "POST", headers: headers(), body: fd });
  const text = await r.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!r.ok) throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? `Request failed (${r.status})`);
  return body as T;
}

/** Authenticated file download — keeps auth off the URL. */
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
type Link = { url: string; name?: string | null };
const sq = (s: Partial<PpScope>) => qs(s as Record<string, unknown>);
const post = <T = Ok>(path: string, body?: unknown) => apiFetch<T>(`${P}${path}`, json("POST", body ?? {}));

export const ppApi = {
  screen: (s: PpScope) => apiFetch<PpScreen>(`${P}/screen${sq(s)}`),
  drawer: (kind: string, id: string, s: PpScope) => apiFetch<PpDrawer>(`${P}/drawer/${kind}/${enc(id || "_")}${sq(s)}`),
  options: () => apiFetch<PpOptions>(`${P}/options`),
  exportFile: (what: string, format: string, pii: string, s: PpScope) => download(`${P}/export${qs({ ...s, what, format, pii })}`, `people.${format}`),
  profile: (uid: string) => apiFetch<PpProfile>(`${P}/profile/${enc(uid)}`),
  saveProfile: (uid: string, b: Ok) => post<{ version: number; changed: string[] }>(`/profile/${enc(uid)}`, b),
  // recruitment
  createJob: (b: Ok) => post<{ id: string; number: string }>("/jobs", b),
  editJob: (id: string, b: Ok) => post<{ reapprove: boolean }>(`/jobs/${enc(id)}`, b),
  jobAct: (id: string, act: string, reason = "") => post<{ status: string; number?: string }>(`/jobs/${enc(id)}/act`, { act, reason }),
  createCand: (b: Ok, file?: File | null) => upload<{ id: string; number: string }>(`${P}/candidates`, b, file),
  stage: (id: string, to: string, reason = "", expectedVersion?: number) => post(`/candidates/${enc(id)}/stage`, { to, reason, expectedVersion }),
  reject: (id: string, reason: string, note: string, message: boolean) => post<{ sent: { ok: boolean; error: string | null } | null }>(`/candidates/${enc(id)}/reject`, { reason, note, message }),
  message: (id: string, kind: "message" | "document", text: string) => post(`/candidates/${enc(id)}/message`, { kind, text }),
  resume: (id: string, file: File) => upload<{ number: string }>(`${P}/candidates/${enc(id)}/resume`, {}, file),
  resumeLink: (id: string) => apiFetch<Link>(`${P}/candidates/${enc(id)}/resume`),
  hireCheck: (id: string) => apiFetch<{ name: string; offer: { number: string; version: number; startDate: string; type: string; frequency: string } | null; match: { name: string; email: string | null; linked: boolean; active: boolean } | null }>(`${P}/candidates/${enc(id)}/hire`),
  hire: (id: string, how: string) => post<{ userId: string; tempPassword?: string }>(`/candidates/${enc(id)}/hire`, { how }),
  schedule: (b: Ok, id?: string) => post<{ id: string; number: string; sent: { ok: boolean; error: string | null } }>(id ? `/interviews/${enc(id)}` : "/interviews", b),
  intAct: (id: string, act: string, reason = "") => post(`/interviews/${enc(id)}/act`, { act, reason }),
  score: (id: string, b: Ok) => post<{ ver: number }>(`/interviews/${enc(id)}/score`, b),
  createOffer: (b: Ok) => post<{ id: string; number: string; over: boolean }>("/offers", b),
  reviseOffer: (id: string, b: Ok) => post<{ status: string; version: number; reap: boolean }>(`/offers/${enc(id)}`, b),
  offerAct: (id: string, act: string, reason = "") => post<{ status: string; doc?: string; request?: string; failed?: boolean; changed?: boolean }>(`/offers/${enc(id)}/act`, { act, reason }),
  offerDoc: (id: string) => apiFetch<Link>(`${P}/offers/${enc(id)}/document`),
  // onboarding
  onbStart: (id: string) => post<{ status: string; tasks: number; note?: string }>(`/onboarding/${enc(id)}/start`),
  onbTasks: (id: string) => post<{ created: number }>(`/onboarding/${enc(id)}/tasks`),
  onbItem: (id: string, idx: number, override: string) => post<{ status: string }>(`/onboarding/${enc(id)}/item`, { idx, override }),
  onbEdit: (id: string, b: Ok) => post(`/onboarding/${enc(id)}/edit`, b),
  onbDocs: (id: string, text: string) => post(`/onboarding/${enc(id)}/docs`, { text }),
  // leave
  leave: (b: Ok, file?: File | null) => upload<{ number: string; status: string }>(`${P}/leave`, b, file),
  leaveAct: (id: string, act: string, reason = "", expectedStatus?: string) => post<{ status: string }>(`/leave/${enc(id)}/act`, { act, reason, expectedStatus }),
  leaveAtt: (id: string) => apiFetch<Link>(`${P}/leave/${enc(id)}/attachment`),
  // payroll
  startRun: (period?: string) => post<{ id: string; number: string; existing: boolean }>("/runs", { period }),
  correction: (runId: string, ids: string[]) => post<{ id: string; number: string }>("/runs/correction", { runId, ids }),
  runAct: (id: string, act: string, b: Ok = {}) => post<Ok & { status?: string; why?: string; journal?: string | null; url?: string; batch?: string }>(`/runs/${enc(id)}/act`, { act, ...b }),
  runExc: (id: string, idx: number, how: string) => post(`/runs/${enc(id)}/exception`, { idx, how }),
  bankFile: (id: string) => apiFetch<Link>(`${P}/runs/${enc(id)}/bank-file`),
  fix: (kind: string, ids: string[]) => post<{ notified: number }>("/readiness/fix", { kind, ids }),
  deliver: (runId: string, uid: string) => post<{ status: string }>(`/payslips/${enc(runId)}/${enc(uid)}/deliver`),
  deliverAll: () => post<{ delivered: number; failed: number }>("/payslips/deliver-all"),
  slipPdf: (runId: string, uid: string) => apiFetch<Link>(`${P}/payslips/${enc(runId)}/${enc(uid)}/pdf`),
  // benefits
  createRule: (b: Ok) => post<{ id: string; number: string }>("/rules", b),
  ruleImpact: (id: string, b: Ok) => post<{ lines: string[] }>(`/rules/${enc(id)}/impact`, b),
  ruleChange: (id: string, b: Ok) => post<{ ver: number }>(`/rules/${enc(id)}/change`, b),
  ruleEnd: (id: string, to: string) => post(`/rules/${enc(id)}/end`, { to }),
  ruleAssign: (id: string, ids: string[], on: boolean) => post<{ assigned: number }>(`/rules/${enc(id)}/assign`, { ids, on }),
  ruleDept: (id: string, dept: string) => post<{ assigned: number }>(`/rules/${enc(id)}/assign-dept`, { dept }),
  // performance
  cycle: (b: Ok) => post<{ number: string }>("/cycles", b),
  cycleAct: (id: string, act: string, ids: string[] = []) => post<{ added?: number }>(`/cycles/${enc(id)}/act`, { act, ids }),
  reviewAct: (id: string, act: string, b: Ok = {}) => post<{ status?: string; task?: string }>(`/reviews/${enc(id)}/act`, { act, ...b }),
  // training
  course: (b: Ok) => post<{ number: string }>("/courses", b),
  assignTr: (b: Ok) => post<{ assigned: number; skipped: number }>("/training/assign", b),
  trAct: (id: string, b: Ok, file?: File | null) => upload<{ ok: boolean }>(`${P}/training/${enc(id)}/act`, b, file),
  cert: (id: string) => apiFetch<Link>(`${P}/training/${enc(id)}/certificate`),
  // offboarding
  ofbStart: (b: Ok) => post<{ number: string }>("/offboarding", b),
  ofbAct: (id: string, act: string, b: Ok = {}) => post<Ok>(`/offboarding/${enc(id)}/act`, { act, ...b }),
  // settings
  settings: () => apiFetch<PpSettings>(`${P}/settings`),
  saveSettings: (section: string, values: Ok, expectedVersion?: number) => post<{ version: number; changed: string[] }>("/settings", { section, values, expectedVersion }),
};

/** Public careers page (no staff auth). */
export const careersApi = {
  page: async (slug: string) => {
    const r = await fetch(`${BASE_URL}/public/careers/${enc(slug)}`);
    const t = await r.text();
    const b = t ? (JSON.parse(t) as unknown) : null;
    if (!r.ok) throw new Error((b as { error?: { message?: string } } | null)?.error?.message ?? "Careers page unavailable");
    return b as { business: string; intro: string; currency: string; jobs: { id: string; slug: string; title: string; department: string; location: string; address: string | null; workMode: string; employmentType: string; description: string; pay: { min: number | null; max: number | null } | null; postedAt: string | null }[] };
  },
  apply: async (slug: string, data: Record<string, unknown>, file?: File | null) => {
    const fd = new FormData();
    fd.append("data", JSON.stringify(data));
    if (file) fd.append("file", file);
    const r = await fetch(`${BASE_URL}/public/careers/${enc(slug)}/apply`, { method: "POST", body: fd });
    const t = await r.text();
    const b = t ? (JSON.parse(t) as unknown) : null;
    if (!r.ok) throw new Error((b as { error?: { message?: string } } | null)?.error?.message ?? `Application failed (${r.status})`);
    return b as { ok: boolean; reference: string };
  },
};
