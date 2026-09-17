import { apiFetch } from "@/lib/api-client";

export type MemoryNoteSubjectType = "customer" | "supplier" | "product" | "table";

export interface MemoryNote {
  id: string;
  subjectType: MemoryNoteSubjectType;
  subjectId: string;
  body: string;
  pinned: boolean;
  authorUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /memory-notes?subjectType=&subjectId= — real notes for one specific real subject; there's no "list every note" endpoint, a subject must be picked first. */
export function fetchMemoryNotes(subjectType: MemoryNoteSubjectType, subjectId: string): Promise<MemoryNote[]> {
  return apiFetch<MemoryNote[]>(`/memory-notes?subjectType=${subjectType}&subjectId=${subjectId}`);
}

export interface CreateMemoryNoteInput {
  subjectType: MemoryNoteSubjectType;
  subjectId: string;
  body: string;
  pinned?: boolean;
}

/** POST /memory-notes */
export function createMemoryNote(input: CreateMemoryNoteInput): Promise<MemoryNote> {
  return apiFetch<MemoryNote>("/memory-notes", { method: "POST", body: JSON.stringify(input) });
}

/** PATCH /memory-notes/:id — used for both editing the body and toggling pinned. */
export function updateMemoryNote(id: string, input: { body?: string; pinned?: boolean }): Promise<MemoryNote> {
  return apiFetch<MemoryNote>(`/memory-notes/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

/** DELETE /memory-notes/:id */
export function deleteMemoryNote(id: string): Promise<void> {
  return apiFetch<void>(`/memory-notes/${id}`, { method: "DELETE" });
}

/** GET /memory-notes/all — every note across every subject type, business-wide (capped at 500, pinned first). */
export function fetchAllMemoryNotes(): Promise<MemoryNote[]> {
  return apiFetch<MemoryNote[]>("/memory-notes/all");
}
