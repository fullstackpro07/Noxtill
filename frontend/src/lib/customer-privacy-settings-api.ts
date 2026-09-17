import { apiFetch } from "@/lib/api-client";

export interface CustomerPrivacySettings {
  creditBalanceVisibleToStaff: boolean;
  notesVisibleToStaff: boolean;
  staffCanExport: boolean;
  staffCanMerge: boolean;
  staffCanArchive: boolean;
}

/** GET /customer-privacy-settings — real, business-wide; owner/manager are never restricted by
 * these, they only ever narrow what the Staff role can see/do. */
export function fetchCustomerPrivacySettings(): Promise<CustomerPrivacySettings> {
  return apiFetch<CustomerPrivacySettings>("/customer-privacy-settings");
}

export function updateCustomerPrivacySettings(input: Partial<CustomerPrivacySettings>): Promise<CustomerPrivacySettings> {
  return apiFetch<CustomerPrivacySettings>("/customer-privacy-settings", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
