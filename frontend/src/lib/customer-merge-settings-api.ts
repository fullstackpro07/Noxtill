import { apiFetch } from "@/lib/api-client";

export type CustomerMatchOn = "phone_or_email" | "phone_only" | "name_and_phone";
export type CustomerConflictResolution = "primary" | "most_recent" | "ask";

export interface CustomerMergeSettings {
  matchOn: CustomerMatchOn;
  conflictResolution: CustomerConflictResolution;
}

export function fetchCustomerMergeSettings(): Promise<CustomerMergeSettings> {
  return apiFetch<CustomerMergeSettings>("/customer-merge-settings");
}

export function updateCustomerMergeSettings(input: Partial<CustomerMergeSettings>): Promise<CustomerMergeSettings> {
  return apiFetch<CustomerMergeSettings>("/customer-merge-settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
