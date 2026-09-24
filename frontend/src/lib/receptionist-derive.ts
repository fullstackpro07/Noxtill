/**
 * AI Phone Receptionist — pure derivations over real call rows.
 *
 * Everything here is computed from `PhoneCall` records (enriched server-side with customer match,
 * repeat-caller and after-hours facts, and the AI's own per-turn readings: confidence, sentiment,
 * topic, whether it answered or declined). A reading the model didn't give is null and stays null —
 * nothing is derived from a missing value. No function here calls the network.
 */
import { TOPIC_LABELS, type Confidence, type EnrichedCall, type HandledBy, type Sentiment } from "@/lib/voice-calls-api";

export type Tone = "green" | "amber" | "red" | "blue" | "purple" | "neutral";

export interface ChipSpec {
  label: string;
  tone: Tone;
  /** lucide icon name (kebab-case) used by the design for this chip. */
  icon?: string;
}

/* ─────────────────────────────── names & labels ─────────────────────────────── */

/** A saved customer's name if the number matches one; else a name the caller themselves gave on the call; else unknown. */
export const callerName = (c: EnrichedCall): string => c.customer?.name ?? c.callerName ?? "Unknown caller";

/** What the AI last filed the caller's question under, if it filed one. */
export const topicLabel = (c: EnrichedCall): string | null => (c.analysis?.topic ? TOPIC_LABELS[c.analysis.topic] : null);

export function intentLabel(c: EnrichedCall): string {
  if (c.outcome === "booking") return "Booking";
  if (c.outcome === "custom") return c.customIntentName ?? "Custom situation";
  const topic = topicLabel(c);
  if (c.outcome === "message") return topic ?? "Message";
  if (c.outcome === "transfer") return topic ?? "Transfer request";
  // Nothing was classified. For a missed call there was nothing to classify at all.
  if (c.status === "missed") return "Not answered";
  return topic ?? "Not classified";
}

/** The AI's own confidence, as a chip — or null when it reported none. */
export function confidenceChip(conf: Confidence | null): ChipSpec | null {
  if (!conf) return null;
  return { label: `Confidence: ${conf}`, tone: conf === "high" ? "green" : conf === "medium" ? "amber" : "red", icon: "gauge" };
}

/** The AI's estimate of how the caller sounded — an estimate, labelled as one. */
export function sentimentChip(s: Sentiment | null): ChipSpec | null {
  if (!s) return null;
  const tone: Tone = s === "positive" ? "green" : s === "neutral" ? "neutral" : s === "negative" ? "amber" : "red";
  return { label: `Sounded ${s}`, tone, icon: s === "positive" ? "smile" : s === "neutral" ? "meh" : "frown" };
}

/** A call that still needs a person: unanswered, or the caller left a message / matched a custom situation, and nobody has marked it handled. */
export function needsFollowUp(c: EnrichedCall): boolean {
  return !c.resolvedAt && (c.status === "missed" || c.outcome === "message" || c.outcome === "custom");
}

/**
 * A "lead" here is a caller who is NOT a saved customer and asked to be contacted — they left a
 * message or matched a custom situation. Only what was actually said is kept; name and email are
 * never inferred.
 */
export const isLead = (c: EnrichedCall): boolean => !c.customer && (c.outcome === "message" || c.outcome === "custom");

export function outcomeChip(c: EnrichedCall): ChipSpec {
  if (c.status === "in_progress") return { label: "In progress", tone: "blue" };
  if (c.status === "missed") {
    if (c.resolvedAt) return { label: "Missed · handled", tone: "neutral" };
    if (c.callbackRequestedAt) return { label: "Callback offered", tone: "amber" };
    return { label: "Callback required", tone: "red" };
  }
  if (c.outcome === "booking") return { label: "Booked", tone: "green" };
  if (c.outcome === "transfer") return { label: "Transferred", tone: "blue" };
  if (c.outcome === "message" || c.outcome === "custom") {
    const what = c.outcome === "custom" ? (c.customIntentName ?? "Custom") : "Message";
    return c.resolvedAt ? { label: `${what} · handled`, tone: "neutral" } : { label: `${what} · follow-up`, tone: "amber" };
  }
  return { label: "Completed", tone: "neutral" };
}

export function handlerChip(h: HandledBy): ChipSpec {
  switch (h) {
    case "ai":
      return { label: "AI", tone: "purple", icon: "sparkles" };
    case "ai_to_human":
      return { label: "AI → Human", tone: "blue", icon: "arrow-right-left" };
    case "human_joined":
      return { label: "Human joined", tone: "neutral", icon: "user-round" };
    default:
      return { label: "None", tone: "neutral", icon: "phone-off" };
  }
}

/** Match is by an exact saved-number match — reliable, but caller ID can be spoofed, so it is called "Matched", not "Verified". */
export function matchChip(c: EnrichedCall): ChipSpec {
  return c.customer
    ? { label: "Matched customer", tone: "green", icon: "badge-check" }
    : { label: "No match", tone: "neutral", icon: "circle-dashed" };
}

export function statusChip(c: EnrichedCall): ChipSpec {
  if (c.status === "missed") return { label: "Missed", tone: "red", icon: "phone-missed" };
  if (c.status === "in_progress") return { label: "In progress", tone: "blue", icon: "phone-call" };
  if (c.status === "transferred" || c.outcome === "transfer") return { label: "Transferred", tone: "blue", icon: "phone-forwarded" };
  return { label: "Completed", tone: "green", icon: "circle-check" };
}

export const directionIcon = (c: EnrichedCall): string => (c.status === "missed" ? "phone-missed" : "phone-incoming");

/* ─────────────────────────────── time formatting ─────────────────────────────── */

export function dayMinus(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - n));
  return dt.toISOString().slice(0, 10);
}

export function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m} min ${String(s).padStart(2, "0")} s`;
}

export function fmtShortDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}

export function fmtClock(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  }
}

/** "Today 10:42 AM" / "Yesterday 4:28 PM" / "22 Sep 4:28 PM", all on the business's clock. */
export function fmtWhen(iso: string, tz: string, today: string, localDay?: string): string {
  const clock = fmtClock(iso, tz);
  const day = localDay ?? new Date(iso).toISOString().slice(0, 10);
  if (day === today) return `Today ${clock}`;
  if (day === dayMinus(today, 1)) return `Yesterday ${clock}`;
  const label = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" }).format(new Date(iso));
  return `${label} ${clock}`;
}

export function fmtDateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function relAgo(iso: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(iso).getTime());
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export const firstCallerLine = (c: EnrichedCall): string | null => c.transcript.find((t) => t.speaker === "caller")?.text ?? null;

/* ─────────────────────────────── overview KPIs ─────────────────────────────── */

export interface Kpi {
  key: string;
  label: string;
  value: string;
  delta: string;
  dir: "up" | "down" | "flat";
  tone: "neutral" | "green" | "amber" | "red";
  /** Rows for the detail panel opened by clicking the card. */
  basis: string;
}

function vsYesterday(now: number, prev: number, unit = ""): { text: string; dir: "up" | "down" | "flat" } {
  const d = now - prev;
  if (d === 0) return { text: "same as yesterday", dir: "flat" };
  return { text: `${d > 0 ? "+" : "−"}${Math.abs(d)}${unit} vs yesterday`, dir: d > 0 ? "up" : "down" };
}

export interface DaySlice {
  calls: EnrichedCall[];
  answered: EnrichedCall[];
  missed: EnrichedCall[];
  ai: EnrichedCall[];
  human: EnrichedCall[];
  transferred: EnrichedCall[];
  booked: EnrichedCall[];
  leads: EnrichedCall[];
  customerCalls: EnrichedCall[];
  newCallers: EnrichedCall[];
  repeatCallers: EnrichedCall[];
  afterHours: EnrichedCall[];
  /** Calls where the AI reported low confidence on at least one turn. */
  lowConfidence: EnrichedCall[];
  /** Calls where the AI estimated the caller sounded frustrated or negative. */
  upset: EnrichedCall[];
  /** Factual questions the AI itself said it had no record for, across these calls. */
  declined: number;
  avgDuration: number | null;
}

export function sliceDay(all: EnrichedCall[], day: string): DaySlice {
  const calls = all.filter((c) => c.localDay === day);
  const answered = calls.filter((c) => c.status !== "missed");
  const ended = calls.filter((c) => c.durationSeconds != null);
  return {
    calls,
    answered,
    missed: calls.filter((c) => c.status === "missed"),
    ai: calls.filter((c) => c.handledBy === "ai"),
    human: calls.filter((c) => c.handledBy === "human_joined"),
    transferred: calls.filter((c) => c.outcome === "transfer" || c.status === "transferred"),
    booked: calls.filter((c) => c.outcome === "booking" && !!c.appointment),
    leads: calls.filter(isLead),
    customerCalls: calls.filter((c) => !!c.customer),
    newCallers: calls.filter((c) => !c.customer && c.previousCalls === 0),
    repeatCallers: calls.filter((c) => c.previousCalls > 0),
    afterHours: calls.filter((c) => c.afterHours === true),
    lowConfidence: calls.filter((c) => (c.analysis?.lowConfidenceTurns ?? 0) > 0),
    upset: calls.filter((c) => c.analysis?.sentiment === "frustrated" || c.analysis?.sentiment === "negative"),
    declined: calls.reduce((n, c) => n + (c.analysis?.declinedCount ?? 0), 0),
    avgDuration: ended.length ? Math.round(ended.reduce((s, c) => s + (c.durationSeconds ?? 0), 0) / ended.length) : null,
  };
}

/** AI-handled calls that have actually finished — a call still in progress is neither resolved nor handed off yet. */
export function aiFinished(s: DaySlice): EnrichedCall[] {
  return [...s.ai.filter((c) => c.status !== "in_progress"), ...s.transferred.filter((c) => c.handledBy === "ai_to_human")];
}

/** "AI resolved" = the AI handled it start to finish and it left nothing for a person to do. */
export function aiResolved(s: DaySlice): EnrichedCall[] {
  return s.ai.filter((c) => c.status === "completed" && !needsFollowUp(c));
}

export function buildOverviewKpis(all: EnrichedCall[], today: string, workingHoursConfigured: boolean): Kpi[] {
  const t = sliceDay(all, today);
  const y = sliceDay(all, dayMinus(today, 1));
  const followUps = all.filter(needsFollowUp);
  const unassigned = followUps.filter((c) => !c.assignedToUserId);
  const aiHandled = aiFinished(t).length;
  const dur = t.avgDuration != null && y.avgDuration != null ? t.avgDuration - y.avgDuration : null;

  const k = (key: string, label: string, value: string, delta: string, dir: Kpi["dir"], tone: Kpi["tone"], basis: string): Kpi => ({
    key,
    label,
    value,
    delta,
    dir,
    tone,
    basis,
  });
  const calls = vsYesterday(t.calls.length, y.calls.length);
  const dAi = vsYesterday(t.ai.length, y.ai.length);

  return [
    k("calls", "Calls today", String(t.calls.length), calls.text, calls.dir, "neutral", "Every inbound call on your Noxtill number, on your business's own clock."),
    k("answered", "Answered", String(t.answered.length), `${pct(t.answered.length, t.calls.length)} of calls`, "flat", "green", "Calls that were picked up by the AI (a missed call is one that was never answered)."),
    k("missed", "Missed", String(t.missed.length), t.missed.length ? `${t.missed.filter((c) => !c.resolvedAt).length} still need a callback` : "none today", t.missed.length ? "down" : "flat", t.missed.length ? "red" : "neutral", "Calls that were never answered. Noxtill records the number and the time — it does not guess why they rang."),
    k("ai", "AI answered", String(t.ai.length), `${pct(t.ai.length, t.answered.length)} of answered`, dAi.dir, "neutral", "Answered by the AI start to finish, with no person joining and no transfer."),
    k("human", "Human answered", String(t.human.length), t.human.length ? "staff joined live" : "no one joined live", "flat", "neutral", "A staff member was bridged live onto the call (listen in or take over)."),
    k("transferred", "Transferred", String(t.transferred.length), "AI to a person", "flat", "neutral", "The AI decided to hand the call to a person."),
    k("duration", "Average duration", t.avgDuration != null ? fmtDuration(t.avgDuration) : "—", dur != null ? `${dur > 0 ? "+" : "−"}${Math.abs(dur)} s vs yesterday` : "no finished calls yet", dur == null || dur === 0 ? "flat" : dur < 0 ? "up" : "down", "neutral", "Average of calls that have ended, from the call's start and end time."),
    k("bookings", "Bookings created", String(t.booked.length), t.booked.length ? "created against real bookings" : "none today", t.booked.length ? "up" : "flat", "green", "Calls where the AI created a real appointment in Bookings."),
    k("leads", "Leads captured", String(t.leads.length), t.newCallers.length ? `from ${t.newCallers.length} new caller${t.newCallers.length === 1 ? "" : "s"}` : "no new callers", t.leads.length ? "up" : "flat", "green", "Callers who are not saved customers and left a message. Only what they said is kept."),
    k("callbacks", "Callbacks required", String(followUps.length), followUps.length ? `${unassigned.length} unassigned` : "nothing waiting", "flat", followUps.length ? "amber" : "neutral", "Calls that still need a person — missed, or a message left — and haven't been marked handled. Not limited to today."),
    k(
      "declined",
      "Answers declined",
      String(t.declined),
      t.declined ? "no record to answer from" : "none today",
      "flat",
      t.declined ? "amber" : "neutral",
      "Factual questions the AI itself said it had no record for and so declined to answer, rather than guessing. Counted from what the AI reported on each turn.",
    ),
    k("customers", "Customer calls", String(t.customerCalls.length), "number matches a customer", "flat", "neutral", "The caller's number equals a saved customer's phone number."),
    k("newCallers", "New callers", String(t.newCallers.length), "no prior call or record", "flat", "neutral", "Not a saved customer and never called before."),
    k("repeat", "Repeat callers", String(t.repeatCallers.length), t.calls.length ? `${pct(t.repeatCallers.length, t.calls.length)} of calls` : "—", "flat", "neutral", "The same number has called before."),
    workingHoursConfigured
      ? k("afterHours", "After-hours calls", String(t.afterHours.length), t.afterHours.length ? `${t.afterHours.filter((c) => c.handledBy === "ai" || c.handledBy === "ai_to_human").length} answered by AI` : "none today", "flat", "neutral", "Calls that arrived outside the working hours saved on your business.")
      : k("afterHours", "After-hours calls", "—", "Working hours not set", "flat", "neutral", "Set your working hours in Settings to see calls that arrive outside them."),
    k("resolution", "AI resolution rate", pct(aiResolved(t).length, aiHandled), "of AI-handled calls", "flat", "green", "AI-handled calls that left nothing for a person to do (no message to return, no transfer)."),
    k("handoff", "Human handoff rate", pct(t.transferred.length, aiHandled), "of AI-handled calls", "flat", "neutral", "Share of AI-handled calls the AI transferred to a person."),
  ];
}

/* ─────────────────────────────── charts ─────────────────────────────── */

export interface HourBar {
  hour: number;
  label: string;
  answered: number;
  missed: number;
}

export function hourBars(all: EnrichedCall[], day: string): HourBar[] {
  const calls = all.filter((c) => c.localDay === day);
  const hours = calls.map((c) => c.localHour);
  const from = Math.min(9, ...(hours.length ? hours : [9]));
  const to = Math.max(19, ...(hours.length ? hours : [19]));
  const out: HourBar[] = [];
  for (let h = from; h <= to; h++) {
    const inHour = calls.filter((c) => c.localHour === h);
    out.push({
      hour: h,
      label: String(h % 12 || 12),
      answered: inHour.filter((c) => c.status !== "missed").length,
      missed: inHour.filter((c) => c.status === "missed").length,
    });
  }
  return out;
}

export interface IntentBar {
  label: string;
  count: number;
  detail: string;
  color: string;
}

export function intentBars(calls: EnrichedCall[]): IntentBar[] {
  const groups = new Map<string, EnrichedCall[]>();
  for (const c of calls) groups.set(intentLabel(c), [...(groups.get(intentLabel(c)) ?? []), c]);
  return [...groups.entries()]
    .map(([label, list]) => {
      const open = list.filter(needsFollowUp).length;
      let detail: string;
      let color = "#16A34A";
      if (label === "Booking") detail = `${list.length} of ${list.length} booked`;
      else if (label === "Transfer request") {
        detail = "handed to a person";
        color = "#2563EB";
      } else if (label === "Not answered") {
        detail = `${open} still need a callback`;
        color = "#DC2626";
      } else if (label === "Not classified") {
        detail = "no follow-up needed";
        color = "#94A3B8";
      } else {
        detail = open ? `${list.length - open} handled, ${open} open` : "all handled";
        color = open ? "#F59E0B" : "#16A34A";
      }
      return { label, count: list.length, detail, color };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

/* ─────────────────────────────── the day's brief ─────────────────────────────── */

export function buildBrief(all: EnrichedCall[], today: string, now: Date, workingHoursConfigured: boolean) {
  const t = sliceDay(all, today);
  const hourAgo = now.getTime() - 3_600_000;
  const lastHour = t.calls.filter((c) => new Date(c.startedAt).getTime() >= hourAgo);
  const followUps = all.filter(needsFollowUp);
  const unassigned = followUps.filter((c) => !c.assignedToUserId);

  if (t.calls.length === 0) {
    return {
      meta: "No calls yet today",
      headline: "No calls have come in today.",
      body: followUps.length
        ? `${followUps.length} earlier call${followUps.length === 1 ? " still needs" : "s still need"} a callback${unassigned.length ? `, ${unassigned.length} of them unassigned` : ""}.`
        : "Nothing is waiting for a callback.",
    };
  }
  const parts: string[] = [];
  if (t.booked.length) parts.push(`${t.booked.length} booking${t.booked.length === 1 ? " was" : "s were"} created against real bookings.`);
  if (t.transferred.length) parts.push(`${t.transferred.length} call${t.transferred.length === 1 ? " was" : "s were"} transferred to a person.`);
  if (t.leads.length) parts.push(`${t.leads.length} caller${t.leads.length === 1 ? "" : "s"} who aren't saved customers left a message.`);
  if (workingHoursConfigured && t.afterHours.length) parts.push(`${t.afterHours.length} call${t.afterHours.length === 1 ? "" : "s"} arrived outside working hours.`);
  if (t.declined) parts.push(`The AI declined ${t.declined} question${t.declined === 1 ? "" : "s"} it had no record for instead of guessing.`);
  if (t.upset.length) parts.push(`${t.upset.length} caller${t.upset.length === 1 ? "" : "s"} sounded upset (the AI's own estimate).`);
  if (t.missed.length) parts.push(`${t.missed.length} call${t.missed.length === 1 ? " was" : "s were"} missed — no transcript or recording exists for ${t.missed.length === 1 ? "it" : "them"}, so Noxtill doesn't guess why they rang.`);
  if (followUps.length) parts.push(`${followUps.length} call${followUps.length === 1 ? "" : "s"} still need a callback${unassigned.length ? ` (${unassigned.length} unassigned)` : ""}.`);

  return {
    meta: `${t.calls.length} call${t.calls.length === 1 ? "" : "s"} · ${lastHour.length} in the last hour`,
    headline: `AI handled ${t.ai.length + t.transferred.filter((c) => c.handledBy === "ai_to_human").length} of ${t.calls.length} call${t.calls.length === 1 ? "" : "s"}${t.missed.length ? `, and ${t.missed.length} ${t.missed.length === 1 ? "was" : "were"} missed` : ""}.`,
    body: parts.join(" ") || "Every call today was completed without needing a follow-up.",
  };
}

/** The booking's own number (BK-1042). Only a booking written before numbering existed lacks one, and then falls back to a short id. */
export const bookingRef = (a: { id: string; bookingNo: number | null }): string => (a.bookingNo != null ? `BK-${a.bookingNo}` : `BK-${a.id.slice(0, 6).toUpperCase()}`);

/* ─────────────────────────────── waiting time ─────────────────────────────── */

export function waitedFor(c: EnrichedCall, now: Date): string {
  const mins = Math.max(0, Math.floor((now.getTime() - new Date(c.startedAt).getTime()) / 60_000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} hr ${mins % 60} min` : `${Math.floor(h / 24)} d ${h % 24} hr`;
}

/* ─────────────────────────────── knowledge gaps ─────────────────────────────── */

/** Topics where the AI declined at least once, most-declined first — the real "what should we teach it" list. */
export function knowledgeGaps<T extends { topic: string; declined: number; sampleQuestion: string | null }>(clusters: T[]): T[] {
  return clusters.filter((c) => c.declined > 0).sort((a, b) => b.declined - a.declined);
}

export function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}
