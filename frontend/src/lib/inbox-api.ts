import { apiFetch } from "./api-client";

export type Tone = "green" | "red" | "amber" | "blue" | "neutral";

export interface InboxChannelRail {
  key: string;
  n: string;
  icon: string;
  init: string;
  unread: number;
  warn: string;
  hasConversations: boolean;
}

export interface InboxPersonLite {
  userId: string;
  name: string;
  roleLabel: string;
}

export interface InboxOverview {
  channels: InboxChannelRail[];
  totalUnread: number;
  attentionCount: number;
  people: InboxPersonLite[];
  tags: string[];
  canManage: boolean;
  me: { userId: string; name: string; roleLabel: string };
}

export type ConversationView = "open" | "unassigned" | "assigned" | "waiting" | "unread" | "snoozed" | "closed" | "mine" | "starred";
export type ConversationSort = "newest" | "oldest" | "waiting" | "money";

export interface ConversationRow {
  id: string;
  name: string;
  init: string;
  channel: string;
  msg: string;
  lastMessageAt: string;
  awaitingReplySince: string | null;
  waitingMin: number | null;
  owner: string;
  assigneeUserId: string | null;
  unread: number;
  prio: "" | "Money" | "Needs you";
  status: string;
  starred: boolean;
  pinned: boolean;
  tags: string[];
  stake: number;
}

export interface ConversationList {
  items: ConversationRow[];
  counts: Record<string, number>;
  money: { currency: string };
}

export interface ContextCard {
  t: string;
  d: string;
  tone: Tone;
}

export interface ContextAction {
  label: string;
  kind: "order" | "customer360" | "credit" | "customer" | "bookings" | "create-customer" | "close" | "link";
  ref?: string;
  href?: string;
}

export interface ThreadItem {
  id: string;
  kind: "in" | "out" | "note" | "event";
  text: string;
  who: string | null;
  at: string;
  delivery: string | null;
  error: string | null;
  source: string | null;
}

export interface ConversationDetail {
  id: string;
  name: string;
  init: string;
  channel: string;
  handle: string;
  conversationStatus: string;
  snoozedUntil: string | null;
  owner: string;
  assigneeUserId: string | null;
  starred: boolean;
  tags: string[];
  customerId: string | null;
  status: string;
  since: string;
  stats: { orders: string; spent: string; owes: string; owesPositive: boolean; bookings: string };
  context: ContextCard[];
  actions: ContextAction[];
  actionsHidden: boolean;
  contactRows: { l: string; v: string }[];
  convInfo: { l: string; v: string }[];
  notes: { id: string; t: string; who: string; when: string }[];
  notesTarget: "customer" | "none";
  systemCard: { text: string; sub: string } | null;
  thread: ThreadItem[];
  draft: { id: string; text: string; sources: string[]; needsDecision: boolean; warning: string | null; createdAt: string } | null;
  draftSkipped: string | null;
  cannotSend: string | null;
  whatsappWindowOpen: boolean | null;
  canManage: boolean;
  canDecide: boolean;
  summaryAvailable: boolean;
  awaitingReplySince: string | null;
  aiAutoDraft: boolean;
}

export interface Customer360 {
  customer: null | {
    id: string;
    name: string;
    init: string;
    status: string;
    since: string;
    phone: string;
    email: string;
    loc: string;
    tags: string[];
    stats: { l: string; v: string }[];
    orders: { id: string; no: string; d: string; v: string; s: string; tone: Tone }[];
    bookings: { id: string; t: string; d: string; s: string; tone: Tone }[];
    credit: { out: string; over: string; last: string };
    review: { rating: string; when: string; text: string } | null;
    notes: { id: string; t: string; who: string; when: string }[];
  };
  name?: string;
  init?: string;
  status?: string;
  since?: string;
  handle?: string;
  channel?: string;
}

export interface TimelineEvent {
  d: string;
  t: string;
  kind: string;
  title: string;
  detail: string;
  who: string;
  link: { label: string; kind: string; ref?: string; href?: string } | null;
}

export interface TeamView {
  kpis: { l: string; v: string; sub: string; tone: Tone }[];
  unassigned: { id: string; n: string; ch: string; age: string; why: string; sug: { userId: string; text: string } | null }[];
  rows: { userId: string; n: string; r: string; init: string; open: number; waiting: number; over: number; resp: string; respLate: boolean; load: number }[];
  teams: string[];
  people: (InboxPersonLite & { open: number })[];
  conversations: { id: string; name: string; channel: string; assigneeUserId: string | null }[];
}

export interface AttentionView {
  items: { id: string; init: string; name: string; tag: string; age: string; what: string; why: string; red: boolean; assigneeUserId: string | null }[];
  sla: { n: string; target: string; actual: string; st: "Holding" | "Slipping" | "Broken" | "No data" }[];
  targets: { firstReplyTargetMin: number; emailReplyTargetMin: number; moneyReplyTargetMin: number; unassignedTargetMin: number };
  clockNote: string;
}

export interface AnalyticsView {
  kpis: { l: string; v: string; sub: string; tone: Tone }[];
  channels: { n: string; v: string; w: string; level: "good" | "warn" | "bad" }[];
  targetText: string;
  hours: { l: string; v: number; h: string; level: number }[];
  hoursNote: string | null;
  topics: { n: string; v: string; w: string; untagged: boolean }[];
  topicsTotal: number;
}

export interface ChannelCard {
  key: string;
  n: string;
  icon: string;
  init: string;
  handle: string;
  st: string;
  note: string;
  vol: string;
  resp: string;
  respLate: boolean;
  cta: string | null;
  href: string | null;
}

export interface AiAssistView {
  drafts: { id: string; conversationId: string; init: string; name: string; channel: string; when: string; text: string; src: string; needsDecision: boolean; warn: string | null }[];
  skippedCount: number;
  unavailableCount: number;
  settings: { tone: string; language: string; aiAutoDraft: boolean; aiFactsOnly: boolean; aiNextAction: boolean; aiSummarise: boolean };
  stats: { l: string; v: string; tone: Tone }[];
}

export interface AiActionsView {
  actions: { key: string; t: string; d: string; mode: string; locked: boolean; setting: string | null; on?: boolean; link?: string; icon: string }[];
  log: { id: string; when: string; t: string; conversationId: string | null; state: string; who: string }[];
}

export interface SavedRepliesView {
  folders: { k: string; n: number }[];
  replies: { id: string; t: string; cat: string; slug: string; used: number; last: string; text: string; fillsIn: string }[];
}

export interface RuleRow {
  id: string;
  t: string;
  trigger: "keyword" | "unanswered" | "out_of_hours";
  keywords: string[];
  minutes: number | null;
  tag: string | null;
  pinToTop: boolean;
  assigneeUserId: string | null;
  flag: boolean;
  message: string | null;
  when: string;
  then: string;
  st: "On" | "Paused";
  runs: string;
  approval: string;
}

export interface AutomationsView {
  rules: RuleRow[];
  stats: { v: string; l: string; tone: Tone }[];
  people: { userId: string; name: string }[];
}

export interface InboxSettingsView {
  hours: { d: string; t: string; closed: boolean }[];
  hoursSource: "inbox" | "business" | "none";
  rawHours: Record<string, [string, string][]>;
  timezone: string;
  assignMode: string;
  assignModes: { key: string; t: string; d: string }[];
  perms: { t: string; who: string }[];
  toggles: { key: string; l: string; d: string; on: boolean; locked: boolean }[];
  awayMessage: string | null;
  retention: string;
  canManage: boolean;
}

export interface RuleInput {
  name: string;
  trigger?: "keyword" | "unanswered" | "out_of_hours";
  keywords?: string[];
  minutes?: number;
  tag?: string | null;
  pinToTop?: boolean;
  assigneeUserId?: string | null;
  flag?: boolean;
  message?: string | null;
}

const post = <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });

export const fetchInboxOverview = () => apiFetch<InboxOverview>("/inbox/overview");

export function fetchConversations(params: { view?: ConversationView; channel?: string; q?: string; sort?: ConversationSort; tag?: string; assignee?: string }) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) qs.set(k, v);
  });
  return apiFetch<ConversationList>(`/inbox/conversations?${qs.toString()}`);
}

export const fetchConversation = (id: string) => apiFetch<ConversationDetail>(`/inbox/conversations/${id}`);
export const markConversationRead = (id: string) => post<{ ok: boolean }>(`/inbox/conversations/${id}/read`);
export const markAllRead = () => post<{ updated: number }>("/inbox/conversations/read-all");
export const replyToConversation = (id: string, text: string, savedReplyId?: string) => post<ConversationDetail>(`/inbox/conversations/${id}/reply`, { text, savedReplyId });
export const addInternalNote = (id: string, text: string) => post<ConversationDetail>(`/inbox/conversations/${id}/note`, { text });
export const assignConversation = (id: string, userId: string | null, reason?: string) => post<ConversationDetail>(`/inbox/conversations/${id}/assign`, { userId, reason });
export const snoozeConversation = (id: string, minutes: number) => post<ConversationDetail>(`/inbox/conversations/${id}/snooze`, { minutes });
export const closeConversation = (id: string) => post<ConversationDetail>(`/inbox/conversations/${id}/close`);
export const reopenConversation = (id: string) => post<ConversationDetail>(`/inbox/conversations/${id}/reopen`);
export const starConversation = (id: string, starred: boolean) => patch<{ starred: boolean }>(`/inbox/conversations/${id}/star`, { starred });
export const setConversationTags = (id: string, tags: string[]) => apiFetch<{ tags: string[] }>(`/inbox/conversations/${id}/tags`, { method: "PUT", body: JSON.stringify({ tags }) });
export const createCustomerFromConversation = (id: string, body: { name?: string; phone?: string; email?: string }) => post<ConversationDetail>(`/inbox/conversations/${id}/customer`, body);
export const addCustomerNote = (id: string, text: string) => post<ConversationDetail>(`/inbox/conversations/${id}/customer-note`, { text });
export const fetchCustomer360 = (id: string) => apiFetch<Customer360>(`/inbox/conversations/${id}/customer360`);
export const fetchTimeline = (id: string, filter: string) => apiFetch<{ name: string; linked: boolean; events: TimelineEvent[] }>(`/inbox/conversations/${id}/timeline?filter=${encodeURIComponent(filter)}`);
export const requestDraft = (id: string) => post<ConversationDetail>(`/inbox/conversations/${id}/draft`);
export const translateReply = (id: string, text: string) => post<{ text: string; target: string }>(`/inbox/conversations/${id}/translate`, { text });
export const fetchSummary = (id: string) => apiFetch<{ summary: string | null }>(`/inbox/conversations/${id}/summary`);
export const sendDraft = (draftId: string, text?: string) => post<{ conversationId: string }>(`/inbox/drafts/${draftId}/send`, text === undefined ? {} : { text });
export const discardDraft = (draftId: string) => post<{ conversationId: string }>(`/inbox/drafts/${draftId}/discard`);
export const composeMessage = (body: { channel: "whatsapp" | "sms" | "email"; customerId?: string; phone?: string; email?: string; name?: string; text: string }) =>
  post<{ id: string }>("/inbox/conversations", body);

export const fetchTeam = () => apiFetch<TeamView>("/inbox/team");
export const fetchAttention = () => apiFetch<AttentionView>("/inbox/attention");
export const fetchInboxAnalytics = () => apiFetch<AnalyticsView>("/inbox/analytics");
export const fetchInboxChannels = () => apiFetch<{ cards: ChannelCard[] }>("/inbox/channels");
export const fetchAiAssist = () => apiFetch<AiAssistView>("/inbox/ai-assist");
export const fetchAiActions = () => apiFetch<AiActionsView>("/inbox/ai-actions");

export function fetchSavedReplies(folder?: string, q?: string) {
  const qs = new URLSearchParams();
  if (folder) qs.set("folder", folder);
  if (q) qs.set("q", q);
  return apiFetch<SavedRepliesView>(`/inbox/replies?${qs.toString()}`);
}
export const createSavedReply = (body: { title: string; folder: string; slug: string; body: string }) => post<{ id: string }>("/inbox/replies", body);
export const updateSavedReply = (id: string, body: Partial<{ title: string; folder: string; slug: string; body: string }>) => patch<{ id: string }>(`/inbox/replies/${id}`, body);
export const duplicateSavedReply = (id: string) => post<{ id: string }>(`/inbox/replies/${id}/duplicate`);
export const deleteSavedReply = (id: string) => apiFetch<{ ok: boolean }>(`/inbox/replies/${id}`, { method: "DELETE" });
export const createReplyFolder = (name: string) => post<{ name: string }>("/inbox/reply-folders", { name });
export const fillSavedReply = (id: string, conversationId: string) => post<{ id: string; text: string; unfilled: string[] }>(`/inbox/replies/${id}/fill`, { conversationId });

export const fetchAutomations = () => apiFetch<AutomationsView>("/inbox/rules");
export const createRule = (body: RuleInput) => post<{ id: string }>("/inbox/rules", body);
export const updateRule = (id: string, body: Partial<RuleInput>) => patch<{ id: string }>(`/inbox/rules/${id}`, body);
export const toggleRule = (id: string) => post<{ id: string }>(`/inbox/rules/${id}/toggle`);
export const deleteRule = (id: string) => apiFetch<{ ok: boolean }>(`/inbox/rules/${id}`, { method: "DELETE" });
export const fetchRuleHistory = (id: string) => apiFetch<{ name: string; runs: { when: string; t: string; conversationId: string | null }[] }>(`/inbox/rules/${id}/history`);

export const fetchInboxSettings = () => apiFetch<InboxSettingsView>("/inbox/settings");
export const updateInboxSettings = (body: Record<string, unknown>) => patch<InboxSettingsView>("/inbox/settings", body);
export const setAwayMessage = (on: boolean, message?: string) => post<InboxSettingsView>("/inbox/settings/away", { on, message });
