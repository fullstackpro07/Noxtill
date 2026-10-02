import { apiFetch } from "@/lib/api-client";

export interface BusinessModule {
  key: string;
  label: string;
  group: "Core" | "Growth & channels" | "AI";
  description: string;
  enabled: boolean;
}

export interface BusinessModules {
  modules: BusinessModule[];
  disabled: string[];
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
