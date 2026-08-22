import { apiFetch } from "@/lib/api-client";

export interface VariantOption {
  id: string;
  name: string;
  priceOverride: number | null;
  sortOrder: number;
}

interface RawVariantOption {
  id: string;
  name: string;
  priceOverride: string | null;
  sortOrder: number;
}

interface RawVariantSet {
  id: string;
  name: string;
  options: RawVariantOption[];
}

export interface LiveVariantSet {
  id: string;
  name: string;
  options: VariantOption[];
}

function toLiveVariantSet(raw: RawVariantSet): LiveVariantSet {
  return {
    id: raw.id,
    name: raw.name,
    options: raw.options.map((o) => ({
      id: o.id,
      name: o.name,
      priceOverride: o.priceOverride != null ? Number(o.priceOverride) : null,
      sortOrder: o.sortOrder,
    })),
  };
}

export interface VariantOptionInput {
  name: string;
  priceOverride?: number;
}

export interface VariantSetDraft {
  name: string;
  options: VariantOptionInput[];
}

export function fetchVariantSets(): Promise<LiveVariantSet[]> {
  return apiFetch<RawVariantSet[]>("/variants").then((rows) => rows.map(toLiveVariantSet));
}

export function createVariantSet(draft: VariantSetDraft): Promise<LiveVariantSet> {
  return apiFetch<RawVariantSet>("/variants", { method: "POST", body: JSON.stringify(draft) }).then(toLiveVariantSet);
}

export function updateVariantSet(id: string, draft: VariantSetDraft): Promise<LiveVariantSet> {
  return apiFetch<RawVariantSet>(`/variants/${id}`, { method: "PATCH", body: JSON.stringify(draft) }).then(toLiveVariantSet);
}

export function deleteVariantSet(id: string): Promise<void> {
  return apiFetch<void>(`/variants/${id}`, { method: "DELETE" });
}

export function applyVariantSet(id: string, productIds: string[]): Promise<unknown> {
  return apiFetch(`/variants/${id}/apply`, { method: "POST", body: JSON.stringify({ productIds }) });
}
