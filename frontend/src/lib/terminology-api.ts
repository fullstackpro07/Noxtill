import { apiFetch } from "@/lib/api-client";

export type LabelMatrix = Record<string, Record<string, string>>;

export interface LabelUpdate {
  area: string;
  key: string;
  value: string;
}

/** GET /labels — real defaults merged with real overrides, grouped by area. */
export function fetchLabels(): Promise<LabelMatrix> {
  return apiFetch<LabelMatrix>("/labels");
}

/** PATCH /labels */
export function updateLabels(updates: LabelUpdate[]): Promise<LabelMatrix> {
  return apiFetch<LabelMatrix>("/labels", {
    method: "PATCH",
    body: JSON.stringify({ updates }),
  });
}
