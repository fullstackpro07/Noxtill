import { apiFetch } from "@/lib/api-client";
import type { PhoneCallStatus, PhoneCallOutcome } from "@/lib/voice-calls-api";

export interface VoiceQueueItem {
  id: string;
  position: number;
  fromNumber: string;
  status: PhoneCallStatus;
  outcome: PhoneCallOutcome;
  customIntentName: string | null;
  startedAt: string;
  callbackRequestedAt: string | null;
  lastMessage: string | null;
}

export interface VoiceQueueResult {
  items: VoiceQueueItem[];
  /** Real average resolution time over recent history — null (not a guess) until there are at least 3 real resolved samples. */
  estimatedWaitMinutes: number | null;
}

/**
 * Call Queue (UPD-BE-129) — the real operational queue of calls needing human follow-up
 * (missed/message/custom-intent calls not yet resolved), not a literal on-hold phone line: every
 * call is answered immediately by the AI receptionist, so there's no ringing/waiting-on-hold state
 * to represent.
 */
export function fetchVoiceQueue(): Promise<VoiceQueueResult> {
  return apiFetch<VoiceQueueResult>("/voice/queue");
}

export function takeQueueItem(id: string): Promise<unknown> {
  return apiFetch(`/voice/queue/${id}/take`, { method: "POST" });
}

export function offerQueueCallback(id: string): Promise<unknown> {
  return apiFetch(`/voice/queue/${id}/offer-callback`, { method: "POST" });
}

export function clearVoiceQueue(): Promise<{ cleared: number }> {
  return apiFetch<{ cleared: number }>("/voice/queue/clear", { method: "POST" });
}
