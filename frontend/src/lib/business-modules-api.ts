import { apiFetch } from "@/lib/api-client";

export interface BusinessModule {
  key: string;
  label: string;
  group: "Core" | "Growth & channels" | "AI";
  description: string;
  /** The owner's own choice. */
  enabled: boolean;
  /** Set when Noxtill (Super Admin) turned the module off or made it read-only — the owner cannot change it. */
  platform?: PlatformModuleBlock | null;
}

export interface PlatformModuleBlock {
  state: "global_disabled" | "suspended" | "restricted";
  reason: string | null;
  expiresAt: string | null;
}

export interface BusinessModules {
  modules: BusinessModule[];
  /** Hidden modules: the owner's choice plus anything Noxtill turned off. */
  disabled: string[];
  platform?: Record<string, PlatformModuleBlock>;
}

/**
 * Nested under "settings-hub" on purpose: every Settings save invalidates the `["settings-hub"]`
 * prefix, so turning a module on/off in Settings → Modules refreshes the sidebar immediately.
 */
export const BUSINESS_MODULES_QUERY_KEY = ["settings-hub", "business-modules"] as const;

export const fetchBusinessModules = () => apiFetch<BusinessModules>("/business-modules");

export const saveBusinessModuleSelection = (enabled: string[]) =>
  apiFetch<{ disabled: string[] }>("/business-modules/selection", {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
