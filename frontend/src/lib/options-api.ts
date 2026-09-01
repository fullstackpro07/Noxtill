import { apiFetch } from "@/lib/api-client";

export interface OptionItem {
  id: string;
  optionSetId: string;
  value: string;
  sortOrder: number;
  hidden: boolean;
}

export interface OptionSet {
  id: string;
  setKey: string;
  label: string;
  options: OptionItem[];
}

/** GET /options — every set with its options, in display order. */
export function fetchOptionSets(): Promise<OptionSet[]> {
  return apiFetch<OptionSet[]>("/options");
}

/** POST /options */
export function createOptionSet(dto: { setKey: string; label: string }): Promise<OptionSet> {
  return apiFetch<OptionSet>("/options", { method: "POST", body: JSON.stringify(dto) });
}

/** POST /options/:setKey/items */
export function addOption(setKey: string, value: string): Promise<OptionItem> {
  return apiFetch<OptionItem>(`/options/${setKey}/items`, {
    method: "POST",
    body: JSON.stringify({ value }),
  });
}

/** PATCH /options/:setKey/items/:id */
export function updateOption(setKey: string, id: string, dto: { value?: string; hidden?: boolean }): Promise<OptionItem> {
  return apiFetch<OptionItem>(`/options/${setKey}/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
}

/** DELETE /options/:setKey/items/:id */
export function removeOption(setKey: string, id: string): Promise<void> {
  return apiFetch<void>(`/options/${setKey}/items/${id}`, { method: "DELETE" });
}

/** PATCH /options/:setKey/reorder */
export function reorderOptions(setKey: string, orderedIds: string[]): Promise<OptionItem[]> {
  return apiFetch<OptionItem[]>(`/options/${setKey}/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ orderedIds }),
  });
}
