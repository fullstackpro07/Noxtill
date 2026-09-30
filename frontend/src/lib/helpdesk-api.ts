import { apiFetch, BASE_URL } from "./api-client";
import { useAuthStore } from "@/store/auth-store";
import { useBranchContextStore } from "@/store/branch-context-store";

export type SlaKey = "Breached" | "At Risk" | "Healthy" | "Paused" | "Met" | "Missed" | "None";

export interface SlaState {
  k: SlaKey;
  t: string;
  sub: string;
  fg: string;
  bg: string;
  policyId: string | null;
  policyName: string | null;
  fr: number | null;
  res: number | null;
  phase: string | null;
  dueAt: string | null;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  remaining: number | null;
}

export interface TRow {
  id: string;
  number: string;
  subject: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  segment: string | null;
  branchId: string;
  branchName: string;
  channel: string;
  conversationId: string | null;
  category: string;
  subcategory: string | null;
  priority: string;
  status: string;
  open: boolean;
  agentUserId: string | null;
  agentName: string;
  queueId: string | null;
  queueName: string;
  tags: string[];
  followers: string[];
  escalated: boolean;
  reopenCount: number;
  mergedInto: string | null;
  createdAt: string;
  updatedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  frMins: number | null;
  resMins: number | null;
  lastKind: string | null;
  sla: SlaState;
}

export interface HdConfig {
  general: { defaultQueue: string; defaultPriority: string; numberFormat: string; defaultBranch: string; autoClose: string; reopen: string };
  statuses: string[];
  customStatuses: string[];
  priorities: string[];
  categories: string[];
  assignment: { method: string; respectCapacity: boolean; skipAway: boolean; reassignOnLeave: boolean };
  hours: { tz: string; days: string[]; open: string; close: string; holidays: string };
  sla: { warn: number; pauseWaiting: boolean; pauseInternal: boolean };
  notify: Record<string, string[]>;
  comms: { signature: string; ack: boolean; ackText: string; lang: string };
  csat: { enabled: boolean; delay: string; scale: string; comment: boolean; channels: string[]; followUp: string };
  perms: Record<string, number[]>;
  retention: { closed: string; attachments: string; notes: string; purge: string };
  advanced: { ticketMerge: boolean; split: boolean; collision: boolean; apiAccess: string };
  kbCategories: string[];
}

export interface Agent {
  id: string;
  name: string;
  title: string;
  role: "Owner" | "Manager" | "Agent";
  skills: string[];
  cap: number;
  status: "Online" | "Away" | "Offline";
  homeBusinessId: string;
  open: number;
  urgent: number;
  risk: number;
}

export interface Queue {
  id: string;
  name: string;
  desc: string;
  active: boolean;
  sys: string | null;
  members: string[];
  categories: string[];
  branchId: string | null;
  branchName: string;
  priorityRule: string;
  method: string;
  stats: { open: number; risk: number; oldestMins: number | null; waitMins: number | null; frMins: number | null };
  tickets: TRow[];
}

export interface Policy {
  id: string;
  name: string;
  applies: string;
  scope: string;
  priority: string;
  fr: number;
  res: number;
  hours: string;
  pause: string[];
  warn: number;
  active: boolean;
  order: number;
}

export interface Rule {
  id: string;
  name: string;
  trigger: string;
  ageHours: number | null;
  action: string;
  targetType: string;
  target: string;
  targetName: string;
  active: boolean;
}

export interface Workspace {
  syncedAt: string;
  me: { userId: string; name: string; role: "Owner" | "Manager" | "Agent"; ri: number; caps: Record<string, boolean>; isAgent: boolean };
  settings: { version: number; config: HdConfig; nextNumber: string };
  branches: Array<{ id: string; name: string }>;
  agents: Agent[];
  queues: Queue[];
  policies: Policy[];
  rules: Rule[];
  channels: Array<{ ch: string; desc: string; status: string; via: string }>;
  chanList: string[];
  allChannels: string[];
  breached: number;
  tags: string[];
  usage: { status: Record<string, { open: number; all: number }>; category: Record<string, number>; priorityOpen: Record<string, number> };
  composer: { replies: Array<{ id: string; name: string; shortcut: string }>; macros: Array<{ id: string; name: string }>; articles: Array<{ id: string; title: string; visibility: string }> };
  via: Record<string, string>;
}

export interface TicketList {
  rows: TRow[];
  total: number;
  base: number;
  page: number;
  pages: number;
  pageSize: number;
  tags: string[];
  customers: Array<{ id: string; name: string }>;
}

export interface Overview {
  empty: boolean;
  kpis: { open: number; fresh: number; unassigned: number; urgent: number; wcust: number; wteam: number; risk: number; breach: number; frt: number | null; res: number | null; csat: number | null; csatN: number };
  trend: { labels: string[]; created: number[]; resolved: number[] };
  byPriority: Array<[string, number]>;
  byChannel: Array<[string, number]>;
  segments: Record<string, { count: number; rows: TRow[] }>;
}

export interface Msg {
  id: string;
  kind: "cust" | "reply" | "note" | "sys";
  by: string;
  body: string;
  at: string;
  from: string | null;
  meta: string | null;
  failed: boolean;
  attachments: Array<{ i: number; name: string; type: string; size: number }>;
}

export interface Detail {
  ticket: TRow & { description: string | null; mergedFrom: string[]; portalUrl: string; conversationLabel: string | null };
  route: { via: string; ok: boolean; why: string | null };
  csat: { status: string; rating: number | null; sendAt: string; failReason: string | null } | null;
  messages: Msg[];
  links: Array<{ id: string; type: string; label: string; refId: string }>;
  audit: Array<{ what: string; by: string; at: string; detail: string }>;
  customer: null | {
    id: string;
    name: string;
    email: string | null;
    phone: string;
    since: string;
    segment: string;
    openTickets: number;
    previousTickets: number;
    credit: string;
    prev: Array<{ number: string; subject: string; status: string }>;
    orders: Array<{ a: string; b: string; c: string }>;
    bookings: Array<{ a: string; b: string; c: string }>;
  };
  followers: string[];
  reopenAllowed: boolean;
}

export interface SlaView {
  kpis: { compliance: number | null; risk: number; breach: number; frt: number | null; res: number | null; escMonth: number; escFailed: number };
  log: Array<{ id: string; ticket: string; trigger: string; rule: string | null; target: string; at: string; result: string; status: string; retryable: boolean }>;
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  category: string;
  summary: string;
  body: string;
  tags: string[];
  visibility: string;
  related: string[];
  status: "Draft" | "Published" | "Archived";
  author: string;
  version: number;
  updatedAt: string;
  updatedDays: number;
  reviewedAt: string | null;
  stale: boolean;
  views: number;
  votes: number;
  helpful: number | null;
  linked: number;
  feedback: Array<{ text: string; helpful: boolean; source: string; at: string }>;
  versions: Array<{ v: number; by: string; at: string; note: string }>;
}

export interface Library {
  canEdit: boolean;
  replies: Array<{ id: string; name: string; shortcut: string; body: string; visibility: string; team: string; usage: number; by: string; mine: boolean; canEdit: boolean }>;
  macros: Array<{ id: string; name: string; conditions: string; actions: string[][]; status: string; usage: number }>;
}

export interface CsatView {
  windowDays: number;
  kpis: { score: number | null; responses: number; positive: number; neutral: number; negative: number; rate: number | null; sent: number; scheduled: number; failed: number };
  trend: Array<{ label: string; pct: number | null; n: number }>;
  byAgent: Array<[string, number, number]>;
  byCategory: Array<[string, number, number]>;
  byChannel: Array<[string, number, number]>;
  responses: Array<{ number: string; customer: string; rating: number; raw: number | null; scale: string; comment: string; agentId: string | null; agent: string; category: string; channel: string; at: string; followUp: string | null }>;
  settings: HdConfig["csat"];
}

export interface Analytics {
  weekly: boolean;
  kpis: { created: number; resolved: number; frt: number | null; res: number | null; compliance: number | null; bad: number; reopenRate: number | null; reopened: number; backlog: number; csat: number | null; csatN: number };
  series: Array<{ label: string; created: number; resolved: number; frt: number; res: number; sla: number | null }>;
  byCategory: Array<[string, number]>;
  byChannel: Array<[string, number]>;
  byPriority: Array<[string, number]>;
  agents: Array<{ id: string; name: string; title: string; assigned: number; resolved: number; frH: number | null; resH: number | null; sla: number | null; reopen: number | null; csat: number | null }>;
  bands: Array<[string, number]>;
  byQueue: Array<[string, number]>;
  slaRisk: Array<[string, number]>;
  oldest: TRow[];
  count: number;
}

const qs = (o: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};
const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });
const H = "/helpdesk";

export const hdApi = {
  workspace: (branch?: string) => apiFetch<Workspace>(`${H}/workspace${qs({ branch })}`),
  overview: (range: string, branch?: string) => apiFetch<Overview>(`${H}/overview${qs({ range, branch })}`),
  tickets: (f: Record<string, unknown>) => apiFetch<TicketList>(`${H}/tickets${qs(f)}`),
  detail: (number: string) => apiFetch<Detail>(`${H}/tickets/${encodeURIComponent(number)}`),
  sla: (branch?: string) => apiFetch<SlaView>(`${H}/sla${qs({ branch })}`),
  knowledge: () => apiFetch<{ articles: Article[]; categories: string[]; canPublish: boolean }>(`${H}/knowledge`),
  library: () => apiFetch<Library>(`${H}/library`),
  csat: (branch?: string) => apiFetch<CsatView>(`${H}/csat${qs({ branch })}`),
  analytics: (f: Record<string, unknown>) => apiFetch<Analytics>(`${H}/analytics${qs(f)}`),
  customers: (q: string) => apiFetch<Array<{ id: string; name: string; sub: string }>>(`${H}/customers${qs({ q })}`),
  refresh: () => apiFetch<Record<string, number>>(`${H}/refresh`, json("POST")),
  requestAccess: () => apiFetch<{ notified: number }>(`${H}/access-request`, json("POST")),

  createTicket: (fd: FormData) => apiFetch<{ number: string }>(`${H}/tickets`, { method: "POST", body: fd }),
  fromConversation: (conversationId: string) => apiFetch<{ number: string }>(`${H}/tickets/from-conversation`, json("POST", { conversationId })),
  setField: (n: string, field: string, value: string) => apiFetch(`${H}/tickets/${n}`, json("PATCH", { field, value })),
  bulk: (numbers: string[], action: string, value?: string, note?: string) => apiFetch<{ done: number; skipped: Array<{ number: string; why: string }> }>(`${H}/tickets/bulk`, json("POST", { numbers, action, value, note })),
  merge: (target: string, sources: string[]) => apiFetch<{ number: string }>(`${H}/tickets/merge`, json("POST", { target, sources })),
  reopen: (n: string) => apiFetch(`${H}/tickets/${n}/reopen`, json("POST")),
  remove: (n: string) => apiFetch(`${H}/tickets/${n}`, json("DELETE")),
  addTag: (n: string, tag: string) => apiFetch(`${H}/tickets/${n}/tags`, json("POST", { tag })),
  removeTag: (n: string, tag: string) => apiFetch(`${H}/tickets/${n}/tags/${encodeURIComponent(tag)}`, json("DELETE")),
  followers: (n: string, userIds: string[]) => apiFetch(`${H}/tickets/${n}/followers`, json("PUT", { userIds })),
  escalate: (n: string, body: Record<string, unknown>) => apiFetch(`${H}/tickets/${n}/escalate`, json("POST", body)),
  split: (n: string, body: Record<string, unknown>) => apiFetch<{ number: string }>(`${H}/tickets/${n}/split`, json("POST", body)),
  link: (n: string, type: string, ref: string) => apiFetch(`${H}/tickets/${n}/links`, json("POST", { type, ref })),
  unlink: (n: string, id: string) => apiFetch(`${H}/tickets/${n}/links/${id}`, json("DELETE")),
  reply: (n: string, fd: FormData) => apiFetch<{ ok: boolean; delivery: string; note?: string }>(`${H}/tickets/${n}/messages`, { method: "POST", body: fd }),
  retry: (n: string, id: string) => apiFetch<{ ok: boolean; note: string }>(`${H}/tickets/${n}/messages/${id}/retry`, json("POST")),
  attachment: (n: string, id: string, i: number) => apiFetch<{ url: string; name: string }>(`${H}/tickets/${n}/messages/${id}/attachments/${i}`),
  apply: (n: string, ref: string, mode: string) => apiFetch<{ text: string; articleId?: string; done: string[]; skipped: string[] }>(`${H}/tickets/${n}/apply`, json("POST", { ref, mode })),

  assignMany: (numbers: string[], agentId: string) => apiFetch<{ done: number; skipped: Array<{ number: string; why: string }> }>(`${H}/assignments/assign`, json("POST", { numbers, agentId })),
  rebalance: (apply: boolean) => apiFetch<{ plan: Array<{ number: string; from: string; to: string }>; applied: boolean }>(`${H}/assignments/rebalance`, json("POST", { apply })),
  saveQueue: (id: string | null, body: Record<string, unknown>) => apiFetch(id ? `${H}/queues/${id}` : `${H}/queues`, json(id ? "PATCH" : "POST", body)),
  queueActive: (id: string, active: boolean, moveTo?: string) => apiFetch(`${H}/queues/${id}/active`, json("POST", { active, moveTo })),
  saveAgent: (userId: string, skills: string[], capacity: number) => apiFetch(`${H}/agents/${userId}`, json("PUT", { skills, capacity })),

  savePolicy: (id: string | null, body: Record<string, unknown>) => apiFetch(id ? `${H}/sla/policies/${id}` : `${H}/sla/policies`, json(id ? "PATCH" : "POST", body)),
  policyAction: (id: string, action: "enable" | "disable" | "duplicate") => apiFetch(`${H}/sla/policies/${id}/${action}`, json("POST")),
  saveRule: (id: string | null, body: Record<string, unknown>) => apiFetch(id ? `${H}/sla/rules/${id}` : `${H}/sla/rules`, json(id ? "PATCH" : "POST", body)),
  ruleActive: (id: string, active: boolean) => apiFetch(`${H}/sla/rules/${id}/active`, json("POST", { active })),
  retryEscalation: (id: string) => apiFetch<{ ok: boolean; result: string }>(`${H}/sla/escalations/${id}/retry`, json("POST")),

  saveArticle: (id: string | null, body: Record<string, unknown>) => apiFetch<{ id: string; status: string }>(id ? `${H}/knowledge/${id}` : `${H}/knowledge`, json(id ? "PATCH" : "POST", body)),
  articleAction: (id: string, action: string) => apiFetch(`${H}/knowledge/${id}/action`, json("POST", { action })),
  kbCategory: (name: string) => apiFetch(`${H}/knowledge/categories`, json("POST", { name })),
  articleView: (id: string) => apiFetch(`${H}/knowledge/${id}/view`, json("POST")),

  saveReply: (id: string | null, body: Record<string, unknown>) => apiFetch(id ? `${H}/replies/${id}` : `${H}/replies`, json(id ? "PATCH" : "POST", body)),
  duplicateReply: (id: string) => apiFetch(`${H}/replies/${id}/duplicate`, json("POST")),
  deleteReply: (id: string) => apiFetch(`${H}/replies/${id}`, json("DELETE")),
  saveMacro: (id: string | null, body: Record<string, unknown>) => apiFetch(id ? `${H}/macros/${id}` : `${H}/macros`, json(id ? "PATCH" : "POST", body)),
  macroStatus: (id: string, status: "Active" | "Disabled") => apiFetch(`${H}/macros/${id}/status`, json("POST", { status })),
  deleteMacro: (id: string) => apiFetch(`${H}/macros/${id}`, json("DELETE")),

  csatSettings: (body: Record<string, unknown>) => apiFetch(`${H}/csat/settings`, json("PATCH", body)),
  followUp: (n: string, note: string, ownerId: string) => apiFetch(`${H}/csat/${n}/follow-up`, json("POST", { note, ownerId })),
  followUpState: (n: string, state: "Open" | "Done") => apiFetch(`${H}/csat/${n}/follow-up/state`, json("POST", { state })),
  saveSettings: (version: number, config: HdConfig) => apiFetch<{ version: number; changed: string[] }>(`${H}/settings`, json("PATCH", { version, config })),
};

/** Downloads a server-generated export (CSV / real .xlsx) with auth + branch headers. */
export async function hdDownload(path: string, fallbackName: string): Promise<number> {
  const token = useAuthStore.getState().accessToken;
  const branch = useBranchContextStore.getState().selectedBranchId;
  const res = await fetch(`${BASE_URL}${H}${path}`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(branch ? { "X-Branch": branch } : {}) } });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) msg = j.message;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? fallbackName;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return Number(res.headers.get("X-Row-Count") ?? 0);
}

export const hdQs = qs;
