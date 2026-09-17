import { apiFetch } from "@/lib/api-client";

export type CustomerTagKind = "manual" | "rule_based";

export interface CustomerTagCatalogEntry {
  id: string;
  name: string;
  kind: CustomerTagKind;
  count: number;
  createdAt: string;
}

/** GET /customer-tags — the real tags catalog, each with a live customer count and a real creation date/origin. */
export function fetchCustomerTagsCatalog(): Promise<CustomerTagCatalogEntry[]> {
  return apiFetch<CustomerTagCatalogEntry[]>("/customer-tags");
}

export function createCustomerTagCatalogEntry(name: string): Promise<CustomerTagCatalogEntry> {
  return apiFetch<CustomerTagCatalogEntry>("/customer-tags", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}
