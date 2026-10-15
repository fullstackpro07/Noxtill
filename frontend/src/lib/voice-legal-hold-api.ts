import { apiFetch } from "@/lib/api-client";

export function placeLegalHold(callId: string, reason: string) {
  return apiFetch<{ id: string; legalHoldAt: string }>(`/voice/calls/${callId}/legal-hold`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** Permanently replaces card/ID/phone/email details in a finished call's transcript and summary. */
export function redactTranscript(callId: string) {
  return apiFetch<{ id: string; redactions: number }>(`/voice/calls/${callId}/redact-transcript`, { method: "POST" });
}

export function releaseLegalHold(callId: string, reason: string) {
  return apiFetch<{ id: string; legalHoldAt: null }>(`/voice/calls/${callId}/legal-hold/release`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
