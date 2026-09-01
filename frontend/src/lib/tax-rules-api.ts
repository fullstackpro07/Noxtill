import { apiFetch } from "@/lib/api-client";

export interface TaxRule {
  id: string;
  businessId: string;
  category: string | null;
  label: string;
  rate: number;
  taxInclusive: boolean;
  active: boolean;
}

export interface CreateTaxRule {
  category?: string;
  label: string;
  rate: number;
  taxInclusive?: boolean;
  active?: boolean;
}

export type UpdateTaxRule = Partial<CreateTaxRule>;

function normalize(raw: Omit<TaxRule, "rate"> & { rate: number | string }): TaxRule {
  return { ...raw, rate: Number(raw.rate) };
}

/** GET /tax-rules */
export async function fetchTaxRules(): Promise<TaxRule[]> {
  const rows = await apiFetch<(Omit<TaxRule, "rate"> & { rate: number | string })[]>("/tax-rules");
  return rows.map(normalize);
}

/** POST /tax-rules */
export async function createTaxRule(dto: CreateTaxRule): Promise<TaxRule> {
  const row = await apiFetch<Omit<TaxRule, "rate"> & { rate: number | string }>("/tax-rules", {
    method: "POST",
    body: JSON.stringify(dto),
  });
  return normalize(row);
}

/** PATCH /tax-rules/:id */
export async function updateTaxRule(id: string, dto: UpdateTaxRule): Promise<TaxRule> {
  const row = await apiFetch<Omit<TaxRule, "rate"> & { rate: number | string }>(`/tax-rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify(dto),
  });
  return normalize(row);
}

/** DELETE /tax-rules/:id */
export function deleteTaxRule(id: string): Promise<void> {
  return apiFetch<void>(`/tax-rules/${id}`, { method: "DELETE" });
}
