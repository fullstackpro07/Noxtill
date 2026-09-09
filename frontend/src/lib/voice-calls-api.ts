import { apiFetch } from "@/lib/api-client";

export type PhoneCallStatus = "in_progress" | "completed" | "missed" | "transferred";
export type PhoneCallOutcome = "none" | "booking" | "message" | "transfer" | "custom";

export interface CallTurn {
  speaker: "caller" | "assistant";
  text: string;
  at: string;
  recordingKey?: string;
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
