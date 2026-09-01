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

export function deleteAssistantConversation(id: string): Promise<void> {
  return apiFetch<void>(`/assistant/conversations/${id}`, { method: "DELETE" });
}
