import { apiFetch } from "@/lib/api-client";

export function placeLegalHold(callId: string, reason: string) {
  return apiFetch<{ id: string; legalHoldAt: string }>(`/voice/calls/${callId}/legal-hold`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function releaseLegalHold(callId: string, reason: string) {
  return apiFetch<{ id: string; legalHoldAt: null }>(`/voice/calls/${callId}/legal-hold/release`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
