import { apiFetch } from "@/lib/api-client";

export type PhoneCallStatus = "in_progress" | "completed" | "missed" | "transferred";
export type PhoneCallOutcome = "none" | "booking" | "message" | "transfer" | "custom";

/** The fixed taxonomy the AI files a caller's question under (see backend voice-analysis.ts). */
export type TopicKey =
  | "booking_availability"
  | "opening_hours"
  | "location"
  | "product_price_stock"
  | "service_pricing"
  | "order_status"
  | "credit_balance"
  | "refund_returns"
  | "complaint"
  | "other";

export const TOPIC_LABELS: Record<TopicKey, string> = {
  booking_availability: "Booking availability",
  opening_hours: "Opening hours",
  location: "Location and directions",
  product_price_stock: "Product price and stock",
  service_pricing: "Service price and duration",
  order_status: "Order status",
  credit_balance: "Credit balance",
  refund_returns: "Refund and returns",
  complaint: "Complaint",
  other: "Something else",
};

export type Confidence = "high" | "medium" | "low";
export type Sentiment = "positive" | "neutral" | "negative" | "frustrated";

/** What the AI itself reported about ONE turn it answered — every field null when the model returned nothing usable. */
export interface TurnAnalysis {
  intent: string;
  confidence: Confidence | null;
  sentiment: Sentiment | null;
  topic: TopicKey | null;
  /** true: answered from a record; false: had to say it doesn't have that; null: not a factual question / not stated. */
  answered: boolean | null;
  /** The record blocks put in front of the AI on this turn (not proof the reply used them). */
  sources: string[];
  routedBy?: string;
}

export interface CallTurn {
  speaker: "caller" | "assistant";
  text: string;
  at: string;
  recordingKey?: string;
  analysis?: TurnAnalysis;
}

export interface CallQuestion {
  topic: TopicKey;
  text: string;
  answered: boolean | null;
  at: string;
}

/** A call's per-turn readings rolled up server-side. */
export interface CallAnalysis {
  confidence: Confidence | null;
  lowConfidenceTurns: number;
  sentiment: Sentiment | null;
  topic: TopicKey | null;
  questions: CallQuestion[];
  declinedCount: number;
}

export interface PhoneCallAppointment {
  id: string;
  startsAt: string;
  status: string;
}

export interface PhoneCall {
  id: string;
  businessId: string;
  callSid: string;
  fromNumber: string;
  status: PhoneCallStatus;
  outcome: PhoneCallOutcome;
  customIntentName: string | null;
  transcript: CallTurn[];
  recordingKey: string | null;
  appointmentId: string | null;
  appointment: PhoneCallAppointment | null;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  /** Live Calls listen/take-over fix — set once a staff member has been bridged live onto this call. */
  joinedAt: string | null;
  joinedByUserId: string | null;
}

/**
 * Real live-call bridging (Live Calls listen/take-over fix) — dials the requesting staff member's
 * own phone and joins them into a real Twilio conference alongside the live caller. "Listen" joins
 * muted (hear only); "take over" joins unmuted (fully live, two-way). Either way, this replaces the
 * AI's turn-based handling of the call — a human is now on it.
 */
export function listenToCall(callId: string): Promise<PhoneCall> {
  return apiFetch<PhoneCall>(`/voice/calls/${callId}/listen`, { method: "POST" });
}

export function takeOverCall(callId: string): Promise<PhoneCall> {
  return apiFetch<PhoneCall>(`/voice/calls/${callId}/take-over`, { method: "POST" });
}

/** Real call log, most recent first (last 200). */
export function fetchCalls(): Promise<PhoneCall[]> {
  return apiFetch<PhoneCall[]>("/voice/calls");
}

export function fetchMissedCalls(): Promise<PhoneCall[]> {
  return apiFetch<PhoneCall[]>("/voice/missed-calls");
}

export interface VoiceAnalytics {
  totalCalls: number;
  byOutcome: Record<PhoneCallOutcome, number>;
  byStatus: Record<PhoneCallStatus, number>;
  averageDurationSeconds: number;
}

export function fetchVoiceAnalytics(): Promise<VoiceAnalytics> {
  return apiFetch<VoiceAnalytics>("/voice/analytics");
}

/** Real signed S3 URL (24h TTL) for playback — url is null when the call has no recording. */
export function fetchRecordingUrl(callId: string): Promise<{ url: string | null }> {
  return apiFetch<{ url: string | null }>(`/voice/calls/${callId}/recording-url`);
}

export interface ProvisionedPhoneNumber {
  id: string;
  businessId: string;
  twilioSid: string;
  phoneNumber: string;
  provisionedAt: string;
  createdAt: string;
}

export function provisionVoiceNumber(): Promise<ProvisionedPhoneNumber> {
  return apiFetch<ProvisionedPhoneNumber>("/voice/provision-number", { method: "POST" });
}

/**
 * null when no number has been provisioned yet. The backend returns a bare Prisma `null` here,
 * which Express sends as an empty body — `apiFetch` reads that as `undefined` (its convention for
 * "no body"), not `null`, and React Query rejects `undefined` from a query function. Normalize it
 * here rather than in every caller.
 */
export async function fetchVoiceNumber(): Promise<ProvisionedPhoneNumber | null> {
  const result = await apiFetch<ProvisionedPhoneNumber | null>("/voice/number");
  return result ?? null;
}

/* ───────────── AI Phone workspace (enriched, proven-facts-only) ───────────── */

/** Who dealt with a call, derived only from what the call record proves (never guessed). */
export type HandledBy = "none" | "human_joined" | "ai_to_human" | "ai";

export interface EnrichedCallAppointment {
  id: string;
  /** Human-readable booking number (BK-1042); null only for a booking written before numbering existed. */
  bookingNo: number | null;
  startsAt: string;
  endsAt: string;
  status: "requested" | "booked" | "confirmed" | "completed" | "no_show" | "cancelled";
  depositPaid: number;
  serviceName: string;
  staffName: string | null;
  customerName: string;
  customerId: string;
}

export interface EnrichedCall {
  id: string;
  callSid: string;
  fromNumber: string;
  status: PhoneCallStatus;
  outcome: PhoneCallOutcome;
  customIntentName: string | null;
  handledBy: HandledBy;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  /** The call's date on the BUSINESS's own clock (YYYY-MM-DD) — every "today" figure keys off this. */
  localDay: string;
  localHour: number;
  /** Null when the business has no working hours configured — never a guess. */
  afterHours: boolean | null;
  hasRecording: boolean;
  /** Set when staff deleted the recording and transcript (the call log itself is kept). */
  recordingDeletedAt: string | null;
  transcript: CallTurn[];
  /** Per-turn AI readings rolled up: worst confidence/sentiment seen, questions asked and declined. */
  analysis: CallAnalysis;
  /** Only what the caller actually said — never guessed; null when they never offered it. */
  callerName: string | null;
  callerEmail: string | null;
  /** A saved customer whose phone number equals the caller's number. */
  customer: { id: string; name: string } | null;
  /** Earlier calls from the same number. */
  previousCalls: number;
  resolvedAt: string | null;
  callbackRequestedAt: string | null;
  joinedAt: string | null;
  joinedByUserId: string | null;
  joinedByName: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  summary: string | null;
  summaryGeneratedAt: string | null;
  /** The custom routing rule that decided this call (kept by name so it explains itself after an edit). */
  routedRuleId: string | null;
  routedRuleName: string | null;
  /** What Twilio itself reported charging for the call; null until Twilio has priced it. */
  providerCost: number | null;
  providerCostUnit: string | null;
  providerCostCheckedAt: string | null;
  noteCount: number;
  appointment: EnrichedCallAppointment | null;
}

export interface VoiceInsights {
  windowDays: number;
  timezone: string;
  today: string;
  workingHoursConfigured: boolean;
  businessName: string | null;
  number: { id: string; phoneNumber: string; provisionedAt: string } | null;
  /** A business transfer number (Settings) or the server-wide one — without either, a "transfer" falls back to taking a message. */
  transferConfigured: boolean;
  limits: { maxCallTurns: number; retentionDays: number; disclosure: string };
  calls: EnrichedCall[];
}

export function fetchVoiceInsights(days = 30): Promise<VoiceInsights> {
  return apiFetch<VoiceInsights>(`/voice/insights?days=${days}`);
}

export interface CallContext {
  customer: {
    id: string;
    name: string;
    email: string | null;
    since: string;
    visitCount: number;
    lifetimeSpend: number;
    lastVisitAt: string | null;
    upcomingAppointments: number;
  } | null;
  previousCalls: { id: string; startedAt: string; status: PhoneCallStatus; outcome: PhoneCallOutcome }[];
  previousCallsTotal: number;
  notes: { id: string; body: string; createdAt: string; authorName: string | null }[];
  /** The append-only audit trail for this call: who did what, and when. */
  audit: { id: string; action: string; actorName: string | null; at: string }[];
}

export function fetchCallContext(callId: string): Promise<CallContext> {
  return apiFetch<CallContext>(`/voice/calls/${callId}/context`);
}

/** Give a call's follow-up an owner (a staff `BusinessUser.id`), or pass null to clear it. */
export function assignCall(callId: string, userId: string | null): Promise<{ id: string; assignedToUserId: string | null }> {
  return apiFetch(`/voice/calls/${callId}/assign`, { method: "POST", body: JSON.stringify({ userId }) });
}

/** Generates (and caches) a summary written from the transcript alone. Fails — leaving no summary — if the AI provider isn't available. */
export function summariseCall(callId: string): Promise<{ id: string; summary: string; summaryGeneratedAt: string }> {
  return apiFetch(`/voice/calls/${callId}/summary`, { method: "POST" });
}

/* ───────────── AI Phone, full: live-call controls, notes, recordings ───────────── */

/** Transfers a call that is genuinely still live to a person (the business's transfer number, or the one given). */
export function transferLiveCall(callId: string, toNumber?: string): Promise<{ id: string; outcome: "transfer" }> {
  return apiFetch(`/voice/calls/${callId}/transfer`, { method: "POST", body: JSON.stringify(toNumber ? { toNumber } : {}) });
}

/** Ends a call that is genuinely still live (a real telephony-provider action, not a local flag). */
export function endLiveCall(callId: string): Promise<{ id: string; ending: boolean }> {
  return apiFetch(`/voice/calls/${callId}/end`, { method: "POST" });
}

export function addCallNote(callId: string, body: string): Promise<{ id: string; body: string; createdAt: string }> {
  return apiFetch(`/voice/calls/${callId}/notes`, { method: "POST", body: JSON.stringify({ body }) });
}

/** Permanently deletes the recording audio and transcript text of one call; the call log entry stays. */
export function deleteCallRecording(callId: string): Promise<{ id: string; recordingDeletedAt: string }> {
  return apiFetch(`/voice/calls/${callId}/delete-recording`, { method: "POST" });
}

/* ───────────── Routing rules ───────────── */

export type RoutingTrigger = "keyword" | "topic" | "sentiment" | "low_confidence" | "after_hours";
export type RoutingAction = "ai" | "take_message" | "transfer";

export interface RoutingRule {
  id: string;
  position: number;
  name: string;
  triggerKind: RoutingTrigger;
  matchValue: string | null;
  action: RoutingAction;
  transferNumber: string | null;
  active: boolean;
}

export interface RoutingRuleInput {
  name: string;
  triggerKind: RoutingTrigger;
  matchValue?: string | null;
  action: "take_message" | "transfer";
  transferNumber?: string | null;
}

export function fetchRoutingRules(): Promise<RoutingRule[]> {
  return apiFetch<RoutingRule[]>("/voice/routing-rules");
}
export function createRoutingRule(input: RoutingRuleInput): Promise<RoutingRule> {
  return apiFetch<RoutingRule>("/voice/routing-rules", { method: "POST", body: JSON.stringify(input) });
}
export function updateRoutingRule(id: string, input: Partial<RoutingRuleInput> & { active?: boolean }): Promise<RoutingRule> {
  return apiFetch<RoutingRule>(`/voice/routing-rules/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}
export function deleteRoutingRule(id: string): Promise<{ id: string }> {
  return apiFetch(`/voice/routing-rules/${id}/delete`, { method: "POST" });
}
export function reorderRoutingRules(ids: string[]): Promise<RoutingRule[]> {
  return apiFetch<RoutingRule[]>("/voice/routing-rules/reorder", { method: "PATCH", body: JSON.stringify({ ids }) });
}

/* ───────────── Knowledge: FAQs and imported documents ───────────── */

export interface KnowledgeEntry {
  id: string;
  kind: "faq" | "document";
  title: string;
  question: string | null;
  content: string;
  sourceFilename: string | null;
  active: boolean;
  usedCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeEntryInput {
  kind: "faq" | "document";
  title: string;
  question?: string;
  content: string;
  sourceFilename?: string;
}

export function fetchKnowledge(): Promise<KnowledgeEntry[]> {
  return apiFetch<KnowledgeEntry[]>("/voice/knowledge");
}
export function createKnowledgeEntry(input: KnowledgeEntryInput): Promise<KnowledgeEntry> {
  return apiFetch<KnowledgeEntry>("/voice/knowledge", { method: "POST", body: JSON.stringify(input) });
}
export function updateKnowledgeEntry(
  id: string,
  input: { title?: string; question?: string; content?: string; active?: boolean },
): Promise<KnowledgeEntry> {
  return apiFetch<KnowledgeEntry>(`/voice/knowledge/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}
export function deleteKnowledgeEntry(id: string): Promise<{ id: string }> {
  return apiFetch(`/voice/knowledge/${id}/delete`, { method: "POST" });
}

/* ───────────── Question clusters ───────────── */

/** Every factual question the AI filed under a topic, grouped by that fixed topic. */
export interface QuestionCluster {
  topic: TopicKey;
  label: string;
  asked: number;
  answered: number;
  declined: number;
  /** A caller's own verbatim words, most recent first. */
  sampleQuestion: string | null;
  lastAskedAt: string | null;
}

export function fetchQuestionClusters(days = 30): Promise<QuestionCluster[]> {
  return apiFetch<QuestionCluster[]>(`/voice/clusters?days=${days}`);
}
