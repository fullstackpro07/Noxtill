import { apiFetch, refreshAccessToken } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth-store";
import { useBranchContextStore } from "@/store/branch-context-store";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined"
    ? "/api/v1"
    : process.env.INTERNAL_BACKEND_URL || "http://127.0.0.1:5000/api/v1");

export interface AssistantToolCall {
  name: string;
  input: unknown;
  output: unknown;
}

export interface AssistantChatResult {
  text: string;
  toolCalls: AssistantToolCall[];
  conversationId: string;
}

interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone: (result: AssistantChatResult) => void;
  onError: (message: string) => void;
}

function buildHeaders(): Headers {
  const headers = new Headers({ "Content-Type": "application/json" });
  const { accessToken } = useAuthStore.getState();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const selectedBranchId = useBranchContextStore.getState().selectedBranchId;
  if (selectedBranchId) headers.set("X-Branch", selectedBranchId);
  return headers;
}

function postChat(message: string, conversationId: string | undefined, signal?: AbortSignal): Promise<Response> {
  return fetch(`${BASE_URL}/assistant/chat`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify({ message, conversationId }),
    signal,
  });
}

function dispatchFrame(frame: string, handlers: StreamHandlers): void {
  let eventName = "message";
  let dataLine = "";
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLine = line.slice(5).trim();
  }
  if (!dataLine) return;

  const data = JSON.parse(dataLine) as { text?: string; message?: string } & Partial<AssistantChatResult>;
  if (eventName === "delta" && data.text) handlers.onDelta(data.text);
  else if (eventName === "done") handlers.onDone(data as AssistantChatResult);
  else if (eventName === "error") handlers.onError(data.message ?? "Something went wrong — please try again.");
}

/**
 * First SSE-consuming client in this codebase (BE-074/INT-011) — `apiFetch` in api-client.ts is
 * JSON-only, so this duplicates its auth/branch header logic rather than delegating to it, and
 * parses the backend's own simplified `event: delta|done|error` frames (not Anthropic's raw SSE
 * format, which the backend already abstracts away).
 */
export async function streamAssistantChat(
  message: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
  conversationId?: string,
): Promise<void> {
  try {
    let res = await postChat(message, conversationId, signal);

    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) {
        useAuthStore.getState().clearSession();
        if (typeof window !== "undefined") window.location.assign("/login");
        handlers.onError("Your session expired — please sign in again.");
        return;
      }
      res = await postChat(message, conversationId, signal);
    }

    if (!res.ok || !res.body) {
      handlers.onError("Something went wrong — please try again.");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIndex = buffer.indexOf("\n\n");
      while (sepIndex !== -1) {
        const frame = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        dispatchFrame(frame, handlers);
        sepIndex = buffer.indexOf("\n\n");
      }
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    handlers.onError("Something went wrong — please try again.");
  }
}

// --- Chat History (UPD-BE-114) ---

export interface AssistantConversationSummary {
  id: string;
  title: string;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantMessageRecord {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Real tool-call trace (name/input/output), persisted per assistant turn — `getConversation`
   * returns the full Prisma row, which includes this column even though older call sites only
   * destructured a narrower shape. Null for user messages and for turns that used no tools. */
  toolCalls: AssistantToolCall[] | null;
  createdAt: string;
}

export interface AssistantConversationDetail {
  id: string;
  title: string | null;
  messages: AssistantMessageRecord[];
  createdAt: string;
  updatedAt: string;
}

export function fetchAssistantConversations(): Promise<AssistantConversationSummary[]> {
  return apiFetch<AssistantConversationSummary[]>("/assistant/conversations");
}

export function fetchAssistantConversation(id: string): Promise<AssistantConversationDetail> {
  return apiFetch<AssistantConversationDetail>(`/assistant/conversations/${id}`);
}

// --- Chat attachments (read-only file-to-text) ---

export interface ExtractedAttachment {
  filename: string;
  mimeType: string;
  kind: "pdf" | "docx" | "text" | "image";
  text: string;
  charCount: number;
  truncated: boolean;
}

/** POST /assistant/attachments — reads a PDF, Word doc, CSV/text file or photo into plain text.
 * Nothing is written to any business table; the caller prepends the text to their next chat question. */
export function extractAssistantAttachment(file: File): Promise<ExtractedAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<ExtractedAttachment>("/assistant/attachments", { method: "POST", body: formData });
}

// --- Reports (real one-page PDF per Q&A turn) ---

export interface GenerateReportInput {
  question: string;
  answer: string;
  toolCalls: AssistantToolCall[];
  helpSources: { title: string; url: string }[];
}

/** POST /assistant/report — a real PDF built from exactly the tool trace and sources this answer
 * already carried, uploaded and returned as a signed, downloadable URL. */
export function generateAssistantReport(input: GenerateReportInput): Promise<{ url: string }> {
  return apiFetch<{ url: string }>("/assistant/report", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// --- Unified Chat History (Business + Help + Voice) ---

export type HistoryKind = "business" | "help" | "voice";

export interface HistoryRow {
  id: string;
  kind: HistoryKind;
  title: string;
  topic: string;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface HelpQueryDetail {
  id: string;
  question: string;
  answer: string;
  sources: { title: string; url: string }[];
  createdAt: string;
}

export interface VoiceCommandDetail {
  id: string;
  transcript: string;
  action: string;
  args: Record<string, unknown>;
  humanSummary: string;
  status: "pending" | "confirmed" | "rejected";
  createdAt: string;
  confirmedAt: string | null;
}

/** GET /assistant/history — real rows merged from `AssistantConversation`, `HelpQueryLog` and
 * `VoiceCommandDraft`, each with a real topic derived from what was actually read or done. */
export function fetchAssistantHistory(): Promise<HistoryRow[]> {
  return apiFetch<HistoryRow[]>("/assistant/history");
}

export function fetchHistoryDetail(kind: HistoryKind, id: string): Promise<AssistantConversationDetail | HelpQueryDetail | VoiceCommandDetail> {
  return apiFetch(`/assistant/history/${kind}/${id}`);
}

export function deleteHistoryEntry(kind: HistoryKind, id: string): Promise<void> {
  return apiFetch<void>(`/assistant/history/${kind}/${id}`, { method: "DELETE" });
}
