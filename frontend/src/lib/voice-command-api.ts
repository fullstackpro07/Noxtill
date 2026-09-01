import { apiFetch } from "@/lib/api-client";

export type VoiceCommandActionType = "record_wastage" | "add_expense" | "add_customer" | "record_cash_movement";

export interface ProposedVoiceCommand {
  id: string;
  transcript: string;
  action: VoiceCommandActionType;
  args: Record<string, unknown>;
  humanSummary: string;
}

/** Never writes anything by itself — only ever produces a staged, editable draft (see backend `VoiceCommandService` doc comment). */
export function proposeVoiceCommand(audio: Blob, filename: string): Promise<ProposedVoiceCommand> {
  const formData = new FormData();
  formData.append("audio", audio, filename);
  return apiFetch<ProposedVoiceCommand>("/assistant/voice-command/propose", { method: "POST", body: formData });
}

/** Performs the real write through the same service any other caller of that action would use. `argsOverride` lets the caller hand-correct a misheard field first. */
export function confirmVoiceCommand(id: string, argsOverride?: Record<string, unknown>): Promise<unknown> {
  return apiFetch(`/assistant/voice-command/${id}/confirm`, {
    method: "POST",
    body: JSON.stringify({ argsOverride }),
  });
}

export function cancelVoiceCommand(id: string): Promise<void> {
  return apiFetch<void>(`/assistant/voice-command/${id}/cancel`, { method: "POST" });
}
