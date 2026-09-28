import { apiFetch } from "./api-client";

export type FindingKind = "Critical" | "Attention" | "Opportunity" | "Improving";
export type Topic = "profit" | "revenue" | "repeat" | "credit" | "margin";
export type Compare = "week" | "yesterday" | "month" | "custom";

export interface Scope {
  branch?: string;
  compare?: Compare;
  from?: string;
  to?: string;
}

export interface Evidence {
  t: string;
  d: string;
  link?: { label: string; href: string };
}

export interface FindingCard {
  key: string;
  kind: FindingKind;
  t: string;
  d: string;
  src: string;
  impact: string;
  conf: "High" | "Medium" | "Low";
  confWhy: string;
  what: string;
  why: string;
  evidence: Evidence[];
  modules: string[];
  rec: string;
  recWhy: string;
  limit: string;
  who: string;
  urgency: string;
  watching: boolean;
  diagnose: Topic | null;
  link: { label: string; href: string } | null;
  action: { type: string; label: string; blockedReason: string | null; prepared: boolean } | null;
}

export interface Signal {
  key: string;
  n: string;
  v: string;
  ch: string;
  why: string;
  tone: "good" | "bad" | "neutral";
  rows: { l: string; v: string }[];
  definition: string;
}

export interface BrainAction {
  id: string;
  type: string;
  typeLabel: string;
  findingKey: string | null;
  title: string;
  detail: string;
  body: string | null;
  recipients: number | null;
  status: "prepared" | "approved" | "done" | "failed" | "blocked" | "cancelled";
  blockedReason: string | null;
  result: string | null;
  perm: string;
  canApprove: boolean;
  preparedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  executedAt: string | null;
  createdAt: string;
}

export interface TrustRow {
  n: string;
  st: string;
  level: string;
  why: string;
}

export interface CommandView {
  scope: { label: string; compare: string };
  state: { label: string; at: string; window: string; summary: string; basis: string; counts: { critical: number; attention: number; opportunity: number; improving: number } };
  trust: TrustRow[];
  attention: FindingCard[];
  brief: { k: string; head: string; lines: string[] }[];
  prepared: BrainAction[];
  preparedCount: number;
  signals: Signal[];
  positives: { t: string; d: string }[];
  badges: { command: number; decisions: number; actions: number };
  readAt: string;
}

export interface SituationView {
  scope: { label: string; compare: string };
  chain: { n: string; ch: string; d: string; src: string; tone: "good" | "bad" | "neutral"; level: number }[];
  changes: { kind: string; t: string; d: string; tone: "bad" | "warn" | "good" | "neutral" }[];
  events: { t: string; title: string; d: string; src: string; sev: "Critical" | "Important" | "Opportunity" | "Positive"; rel: string; link: { label: string; href: string } | null }[];
  totalRecords: number;
}

export interface CauseView {
  topic: Topic;
  question: string;
  period: string;
  branches: string;
  compare: string;
  multiBranch: boolean;
  missingCosts: number;
  empty: boolean;
  headline: string;
  body: string;
  tree: { n: string; d: string; v: string; tone: "bad" | "warn" | "good" | "neutral"; level: number; link?: { label: string; href: string } }[];
  reading: null | {
    mainLabel: string;
    main: { t: string; d: string };
    contrib: { t: string; share: string }[];
    alts: { t: string; d: string }[];
    caveat: string;
    conf: string;
  };
  steps: { n: string; r: string; done: boolean }[];
}

export interface WatchRow {
  id: string;
  n: string;
  metric: string;
  rule: string;
  st: "Triggered" | "Watching" | "No reading";
  now: string;
  triggeredAt: string | null;
}

export interface OpportunityView {
  opportunities: FindingCard[];
  risks: FindingCard[];
  resolved: { key: string; t: string; d: string; kind: string; closed: string }[];
  watches: WatchRow[];
  historyDays: number;
}

export interface OutlookView {
  cash: { dailyRevenue: string; dailyExpense: string; expensesRecorded: number; net30: string; netPositive: boolean; shortfalls: string[]; points: { d: string; v: number }[]; basis: string };
  obligations: { n: string; amount: string; due: string }[];
  runouts: { n: string; stock: number; perDay: number; date: string; days: number }[];
  bookings: { next7: number; last7: number };
  soonOverdue: { n: string; balance: string; inDays: number; customerId: string }[];
  quotesExpiring: { n: string; total: string; until: string }[];
}

export interface DecisionsView {
  pending: FindingCard[];
  log: { id: string; t: string; decision: string; reason: string | null; who: string; when: string; findingKey: string | null }[];
}

export interface MemoryView {
  rules: { key: string; label: string; unit: string; d: string; value: number | null }[];
  discountLimit: number | null;
  dismissed: { key: string; t: string; reason: string | null; who: string | null; when: string }[];
  watching: { key: string; t: string; who: string | null; when: string }[];
  canEdit: boolean;
}

export interface HistoryView {
  readings: { id: string; day: string; label: string; summary: string; counts: Record<string, number>; findings: { kind: string; t: string; isNew: boolean }[]; cleared: string[] }[];
  questions: { id: string; kind: string; q: string; a: string; source: string; when: string }[];
}

export interface GovernanceView {
  sources: TrustRow[];
  gaps: { t: string; d: string; level: string; items: string[]; link: { label: string; href: string } | null }[];
  approvals: { type: string; label: string; who: string; prepared: number; done: number; failed: number }[];
  ai: { t: string; d: string; ai: boolean }[];
}

export interface AskAnswer {
  id: string;
  question: string;
  answer: string;
  source: string;
  topic: string | null;
  askedAt: string;
  note: string;
}

function qs(s: Scope & { topic?: string; q?: string }) {
  const p = new URLSearchParams();
  Object.entries(s as Record<string, string | undefined>).forEach(([k, v]) => v && p.set(k, v));
  const str = p.toString();
  return str ? `?${str}` : "";
}

const post = <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });

export const fetchBrainScope = () => apiFetch<{ own: string; branches: { id: string; name: string; isRoot: boolean }[] }>("/brain/scope");
export const fetchCommand = (s: Scope) => apiFetch<CommandView>(`/brain/command${qs(s)}`);
export const fetchSituation = (s: Scope) => apiFetch<SituationView>(`/brain/situation${qs(s)}`);
export const fetchCause = (s: Scope & { topic?: Topic; q?: string }) => apiFetch<CauseView>(`/brain/cause${qs(s)}`);
export const askBrain = (question: string, branch?: string) => post<AskAnswer>("/brain/ask", { question, branch });
export const fetchOpportunity = (s: Scope) => apiFetch<OpportunityView>(`/brain/opportunity${qs(s)}`);
export const fetchOutlook = (s: Scope) => apiFetch<OutlookView>(`/brain/outlook${qs(s)}`);
export const fetchDecisions = (s: Scope) => apiFetch<DecisionsView>(`/brain/decisions${qs(s)}`);
export const fetchActions = () => apiFetch<BrainAction[]>("/brain/actions");
export const prepareAction = (findingKey: string, branch?: string) => post<{ id: string; existing: boolean }>("/brain/actions/prepare", { findingKey, branch });
export const editAction = (id: string, body: string) => apiFetch<{ ok: boolean }>(`/brain/actions/${id}`, { method: "PATCH", body: JSON.stringify({ body }) });
export const approveAction = (id: string) => post<{ ok: boolean }>(`/brain/actions/${id}/approve`);
export const runAction = (id: string) => post<{ result: string }>(`/brain/actions/${id}/run`);
export const cancelAction = (id: string) => post<{ ok: boolean }>(`/brain/actions/${id}/cancel`);
export const watchFinding = (key: string, title: string, branch?: string) => post<{ ok: boolean; rule: boolean }>(`/brain/findings/${encodeURIComponent(key)}/watch`, { title, branch });
export const dismissFinding = (key: string, title: string, reason?: string) => post<{ ok: boolean }>(`/brain/findings/${encodeURIComponent(key)}/dismiss`, { title, reason });
export const restoreFinding = (key: string) => post<{ ok: boolean }>(`/brain/findings/${encodeURIComponent(key)}/restore`);
export const fetchWatchOptions = (q?: string) =>
  apiFetch<{ metrics: { key: string; label: string; unit: string; needsSubject: string | null }[]; products: { id: string; name: string; stockQty: number }[]; customers: { id: string; name: string }[]; branches: { id: string; name: string }[] }>(`/brain/watch-options${q ? `?q=${encodeURIComponent(q)}` : ""}`);
export const createWatch = (body: { metric: string; subjectId?: string; op: "lt" | "gt" | "outside"; threshold: number; threshold2?: number; label?: string }) => post<{ id: string }>("/brain/watches", body);
export const removeWatch = (id: string) => apiFetch<{ ok: boolean }>(`/brain/watches/${id}`, { method: "DELETE" });
export const fetchMemory = () => apiFetch<MemoryView>("/brain/memory");
export const setBrainRule = (key: string, value: number) => apiFetch<MemoryView>("/brain/memory/rules", { method: "PATCH", body: JSON.stringify({ key, value }) });
export const fetchHistory = () => apiFetch<HistoryView>("/brain/history");
export const fetchGovernance = (s: Scope) => apiFetch<GovernanceView>(`/brain/governance${qs(s)}`);
