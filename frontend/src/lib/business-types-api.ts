import { apiFetch } from "@/lib/api-client";

export interface BusinessType {
  id: string;
  key: string;
  label: string;
  aiGenerated: boolean;
}

/** GET /business-types?q= — @Public() on the backend (runs pre-signup); no q returns every seeded type. */
export function fetchBusinessTypes(q?: string): Promise<BusinessType[]> {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiFetch<BusinessType[]>(`/business-types${query}`, {}, { skipAuth: true });
}

/** POST /business-types/ai-map — matches an existing type or creates a new ai_generated:true one. */
export function aiMapBusinessType(description: string): Promise<BusinessType> {
  return apiFetch<BusinessType>(
    "/business-types/ai-map",
    { method: "POST", body: JSON.stringify({ description }) },
    { skipAuth: true },
  );
}
