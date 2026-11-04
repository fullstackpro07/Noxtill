import { apiFetch } from "@/lib/api-client";

export interface DuplicateCandidate {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
}

export interface DuplicatePair {
  a: DuplicateCandidate;
  b: DuplicateCandidate;
  reason: string;
  matchEvidence: {
    field: "email" | "phone";
    method: "trimmed_case_insensitive" | "digits_only";
    label: string;
  }[];
  conflictingFields: ("name" | "phone" | "email" | "address")[];
}

/** GET /customers/duplicates — server-computed exact-match pairs (per the business's real
 * CustomerMergeSettings.matchOn), already excluding anything persistently dismissed. */
export function fetchCustomerDuplicates(): Promise<DuplicatePair[]> {
  return apiFetch<DuplicatePair[]>("/customers/duplicates");
}

/** POST /customers/duplicates/dismiss — persists "not a duplicate" so it survives a refresh. */
export function dismissCustomerDuplicate(customerIdA: string, customerIdB: string): Promise<unknown> {
  return apiFetch("/customers/duplicates/dismiss", {
    method: "POST",
    body: JSON.stringify({ customerIdA, customerIdB }),
  });
}
