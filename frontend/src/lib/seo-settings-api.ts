import { apiFetch } from "@/lib/api-client";

export interface SeoSettingsSummary {
  site: { url: string | null; source: string | null };
  market: { country: string | null; locale: string };
  autopilotLevel: "L0" | "L1";
  aiDraftsEnabled: boolean;
  approvalPolicy: string;
  checks: { key: string; label: string; ok: boolean; detail: string; href: string }[];
  configurationHealth: { ok: number; of: number };
  notConnected: { label: string; reason: string }[];
}

export const fetchSeoSettingsSummary = () => apiFetch<SeoSettingsSummary>("/seo-autopilot/settings");
