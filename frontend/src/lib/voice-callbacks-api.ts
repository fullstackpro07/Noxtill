import { apiFetch } from "@/lib/api-client";

export type CallbackAttemptStatus =
  | "blocked"
  | "agent_ringing"
  | "agent_no_answer"
  | "customer_ringing"
  | "answered"
  | "busy"
  | "no_answer"
  | "failed"
  | "canceled";

export type CallbackOutcome =
  | "resolved"
  | "booked"
  | "no_longer_needed"
  | "unreachable"
  | "wrong_number"
  | "do_not_call";

export interface MissedCallItem {
  callId: string;
  caller: string;
  startedAt: string;
  status: string;
  callbackRequestedAt: string | null;
  resolvedAt: string | null;
  assignedToUserId: string | null;
  trackingSource: string | null;
  callback: {
    id: string;
    status: "open" | "calling" | "connected" | "completed";
    attemptCount: number;
    lastAttemptAt: string | null;
    lastBlockReason: string | null;
    outcome: CallbackOutcome | null;
    completedAt: string | null;
    attempts: Array<{
      id: string;
      status: CallbackAttemptStatus;
      blockReasonCode: string | null;
      customerDialed: boolean;
      viaProvider: boolean;
      durationSec: number | null;
      createdAt: string;
    }>;
  } | null;
}

export interface MissedCallsResponse {
  windowDays: number;
  summary: { open: number; neverCalledBack: number; recovered: number; blockedLastTry: number };
  items: MissedCallItem[];
}

export interface PlaceCallbackResult {
  callbackId: string;
  attemptId: string;
  eligible: boolean;
  placed: boolean;
  reasonCode: string | null;
  decisionId: string | null;
  /** Only when eligibility passed but Noxtill cannot place the call itself. */
  manualDialNumber: string | null;
  message: string;
}

export function fetchMissedCalls(): Promise<MissedCallsResponse> {
  return apiFetch("/voice/callbacks");
}

export function placeCallback(callId: string, callerRequestedCallback: boolean): Promise<PlaceCallbackResult> {
  return apiFetch(`/voice/calls/${callId}/callback`, {
    method: "POST",
    body: JSON.stringify({ callerRequestedCallback }),
  });
}

export function completeCallback(callbackId: string, outcome: CallbackOutcome, notes?: string) {
  return apiFetch<{ callbackId: string; status: "completed"; outcome: CallbackOutcome }>(
    `/voice/callbacks/${callbackId}/complete`,
    { method: "POST", body: JSON.stringify({ outcome, notes: notes || undefined }) },
  );
}
