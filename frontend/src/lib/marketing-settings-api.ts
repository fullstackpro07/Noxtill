import { apiFetch } from "@/lib/api-client";

export interface MarketingSettingsGroup {
  group: string;
  rows: { label: string; value: string }[];
}

export interface MarketingPermissionRow {
  action: string;
  owner: boolean;
  manager: boolean;
  staff: boolean;
}

export interface MarketingSettings {
  groups: MarketingSettingsGroup[];
  permissions: MarketingPermissionRow[];
}

/** Real, backend-computed: `permissions` is derived live from the actual capability tiers
 * `RolesGuard` enforces (not hand-typed booleans), so it can't silently drift from what's enforced. */
export function fetchMarketingSettings(): Promise<MarketingSettings> {
  return apiFetch<MarketingSettings>("/marketing/settings");
}
