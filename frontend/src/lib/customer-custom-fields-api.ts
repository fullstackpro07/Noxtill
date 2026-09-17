import { apiFetch } from "@/lib/api-client";

export type CustomerCustomFieldType = "text" | "select" | "date" | "number";

export interface CustomerCustomField {
  id: string;
  name: string;
  type: CustomerCustomFieldType;
  options: string[];
  usedCount: number;
  createdAt: string;
}

/** GET /customer-custom-fields — real definitions, each with a live "used by N customers" count. */
export function fetchCustomerCustomFields(): Promise<CustomerCustomField[]> {
  return apiFetch<CustomerCustomField[]>("/customer-custom-fields");
}

export interface CreateCustomerCustomFieldInput {
  name: string;
  type?: CustomerCustomFieldType;
  options?: string[];
}

export function createCustomerCustomField(input: CreateCustomerCustomFieldInput): Promise<CustomerCustomField> {
  return apiFetch<CustomerCustomField>("/customer-custom-fields", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deleteCustomerCustomField(id: string): Promise<void> {
  return apiFetch<void>(`/customer-custom-fields/${id}`, { method: "DELETE" });
}
