import { apiFetch } from "@/lib/api-client";

export type HubTone = "green" | "amber" | "red" | "blue" | "purple" | "neutral";
export type HubScope = "Business" | "Branch" | "User" | "Team";
export type HubRisk = "Low" | "Medium" | "High";

export type HubControl =
  | { type: "toggle"; on: boolean }
  | { type: "select"; current: string; options: { value: string; label: string }[] }
  | { type: "text"; current: string; placeholder?: string; maxLength?: number }
  | { type: "number"; current: number | null; min?: number; max?: number; step?: number; unit?: string; nullable?: boolean; emptyLabel?: string }
  | { type: "time"; current: string | null; nullable?: boolean }
  | { type: "action"; label: string; actionKey: string; tone?: "red" | "neutral"; confirm?: string; client?: "play-sound" | "download-diagnostics" };

export type HubDraft = string | number | boolean;

/** The value a control currently holds, as the editor shows it. A cleared optional value reads as "". */
export function controlValue(c: HubControl | null): HubDraft {
  if (!c || c.type === "action") return "";
  if (c.type === "toggle") return c.on;
  return c.current ?? "";
}

/** What to send for an edited value: an emptied optional number or time clears the limit (null). */
export function submitValue(c: HubControl | null, v: HubDraft): HubDraft | null {
  if (c && (c.type === "number" || c.type === "time") && c.nullable && v === "") return null;
  return v;
}

export interface HubRow {
  key: string;
  label: string;
  description: string;
  /** The value exactly as it should read on the row's chip. */
  value: string;
  valueTone: HubTone;
  scope: HubScope;
  risk: HubRisk;
  /** What changing it affects — shown before a high-impact change is applied. */
  impact: string | null;
  /** Inherited / overridden / effective explanation, when a branch override exists. */
  effective: string | null;
  control: HubControl | null;
  /** False when the row is read-only for this user, with `locked` saying why. */
  editable: boolean;
  locked: string | null;
  /** Opens the module or page that owns this setting. */
  link: { label: string; href: string } | null;
  /** True when a Noxtill default exists, so "Reset to default" is real. */
  resettable: boolean;
  defaultLabel: string | null;
  /** True when this row is pinned by the current user. */
  pinned: boolean;
}

export interface HubGroup {
  title: string;
  hint: string | null;
  badge: string | null;
  badgeTone: HubTone;
  footer: string | null;
  rows: HubRow[];
}

export interface HubHealthItem {
  key: string;
  risk: string;
  tone: "amber" | "red";
  title: string;
  action: string;
  category: string;
}

export interface HubCategory {
  key: string;
  label: string;
  icon: string;
  group: string;
  badge: string | null;
}

export interface HubCategoryDetail {
  key: string;
  title: string;
  icon: string;
  description: string;
  affects: string[];
  affectsNote: string;
  help: string[];
  notice: { text: string; icon: "info" | "shield-check"; action: { label: string; href: string } | null } | null;
  actions: { label: string; icon: string; primary: boolean; href: string | null; kind: "reset" | "history" | "link" | "export" }[];
  groups: HubGroup[];
  health: HubHealthItem[];
  /** Extra structured content some categories render instead of, or beside, plain rows. */
  matrix: NotificationMatrix | null;
}

export interface NotificationMatrix {
  channels: { key: string; label: string; available: boolean; reason: string | null }[];
  rows: {
    event: string;
    label: string;
    /** Fixed per event, set on the notification when it is created. */
    priority: "low" | "normal" | "high";
    cells: { channel: string; on: boolean; blocked: boolean }[];
    locked: boolean;
  }[];
}

export interface HubHome {
  health: { label: string; icon: string; status: string; meta: string; tone: HubTone; category: string }[];
  quickActions: { label: string; icon: string; category: string }[];
  recentChanges: { change: string; meta: string; category: string }[];
  pinned: { label: string; meta: string; icon: string; pin: "Pinned" | "Frequent"; category: string; rowKey: string }[];
}

export interface HubHealth {
  status: string;
  tone: "amber" | "green";
  items: HubHealthItem[];
  rows: { label: string; value: string }[];
}

export interface HubHistoryEntry {
  id: string;
  change: string;
  meta: string;
  restorable: boolean;
  current: boolean;
}

export interface HubSearchResult {
  category: string;
  categoryLabel: string;
  rowKey: string;
  label: string;
  description: string;
}

export interface HubAnswer {
  title: string;
  answer: string;
  rows: { label: string; value: string; tone?: "neg" | "pos" }[];
  bullets: string[];
  note: string;
  action: { label: string; href: string } | null;
}

export function fetchHubCategories(): Promise<HubCategory[]> {
  return apiFetch<HubCategory[]>("/settings/hub/categories");
}

export function fetchHubCategory(key: string): Promise<HubCategoryDetail> {
  return apiFetch<HubCategoryDetail>(`/settings/hub/categories/${key}`);
}

export function fetchHubHome(): Promise<HubHome> {
  return apiFetch<HubHome>("/settings/hub/home");
}

export function fetchHubHealth(): Promise<HubHealth> {
  return apiFetch<HubHealth>("/settings/hub/health");
}

export function fetchHubHistory(category: string, rowKey: string): Promise<HubHistoryEntry[]> {
  return apiFetch<HubHistoryEntry[]>(`/settings/hub/rows/${category}/${rowKey}/history`);
}

export function searchHub(q: string): Promise<HubSearchResult[]> {
  return apiFetch<HubSearchResult[]>(`/settings/hub/search?q=${encodeURIComponent(q)}`);
}

export interface HubChange {
  category: string;
  rowKey: string;
  value: string | number | boolean | null;
  reason?: string;
}

export function saveHubChanges(changes: HubChange[]): Promise<{ saved: number }> {
  return apiFetch("/settings/hub/changes", { method: "PUT", body: JSON.stringify({ changes }) });
}

export function resetHubRow(category: string, rowKey: string): Promise<{ ok: true }> {
  return apiFetch(`/settings/hub/rows/${category}/${rowKey}/reset`, { method: "POST" });
}

export function resetHubCategory(category: string): Promise<{ reset: number }> {
  return apiFetch(`/settings/hub/categories/${category}/reset`, { method: "POST" });
}

export function restoreHubHistory(category: string, rowKey: string, entryId: string): Promise<{ ok: true }> {
  return apiFetch(`/settings/hub/rows/${category}/${rowKey}/restore/${entryId}`, { method: "POST" });
}

export function runHubAction(actionKey: string): Promise<{ message: string; url?: string }> {
  return apiFetch(`/settings/hub/actions/${actionKey}`, { method: "POST" });
}

export function pinHubRow(category: string, rowKey: string): Promise<{ pinned: boolean }> {
  return apiFetch(`/settings/hub/pins/${category}/${rowKey}`, { method: "PUT" });
}

export function askHub(key: string): Promise<HubAnswer> {
  return apiFetch(`/settings/hub/ask/${key}`, { method: "POST" });
}

export function toggleHubMatrix(event: string, channel: string, on: boolean): Promise<{ ok: true }> {
  return apiFetch("/settings/hub/notifications/matrix", { method: "PUT", body: JSON.stringify({ event, channel, on }) });
}

export interface HubCategoryHistoryEntry {
  id: string;
  rowKey: string | null;
  change: string;
  meta: string;
}

export function fetchHubCategoryHistory(category: string): Promise<HubCategoryHistoryEntry[]> {
  return apiFetch<HubCategoryHistoryEntry[]>(`/settings/hub/categories/${category}/history`);
}

export function trackHubOpen(category: string, rowKey: string): Promise<{ ok: true }> {
  return apiFetch(`/settings/hub/rows/${category}/${rowKey}/opened`, { method: "POST" });
}

/** Support file with system facts only (no customer data). Downloaded by the browser, never sent anywhere. */
export function fetchHubDiagnostics(): Promise<Record<string, unknown>> {
  return apiFetch<Record<string, unknown>>("/settings/hub/diagnostics");
}
