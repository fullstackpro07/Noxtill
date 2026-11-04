import { apiFetch } from "@/lib/api-client";

export interface SeoAnalyticsProperty {
  property: string;
  displayName: string;
  propertyType: string | null;
  account: string;
  accountDisplayName: string;
}

export interface SeoAnalyticsWindow {
  startDate: string;
  endDate: string;
  dataState: "returned" | "no_data_returned";
  sessions: string | null;
  keyEvents: string | null;
  totalRevenue: string | null;
  landingPages: {
    dataState: "returned" | "no_data_returned" | "not_available";
    rows: {
      landingPage: string;
      sessions: string | null;
      keyEvents: string | null;
      totalRevenue: string | null;
    }[];
    totalRows: number | null;
    truncated: boolean;
    reason: string | null;
  } | null;
}

export interface SeoAnalyticsSnapshot {
  property: string;
  propertyName: string;
  currencyCode: string | null;
  timeZone: string | null;
  windowDays: number;
  current: SeoAnalyticsWindow;
  comparison: SeoAnalyticsWindow;
  fetchedAt: string;
  disclosure: string;
}

export interface SeoAnalyticsAttributionSummary {
  status: "not_connected" | "connected" | "needs_attention";
  properties: SeoAnalyticsProperty[];
  selectedProperty: string | null;
  lastPropertyRefreshAt: string | null;
  lastSyncAt: string | null;
  snapshot: SeoAnalyticsSnapshot | null;
  windowDays: number;
  disclosure: string;
}

export function fetchSeoAnalyticsAttributionSummary() {
  return apiFetch<SeoAnalyticsAttributionSummary>("/seo-autopilot/analytics");
}

export function refreshSeoAnalyticsProperties() {
  return apiFetch<{ properties: SeoAnalyticsProperty[]; refreshedAt: string }>(
    "/seo-autopilot/analytics/properties/refresh",
    { method: "POST" },
  );
}

export function selectSeoAnalyticsProperty(property: string) {
  return apiFetch<{ selectedProperty: string; availableProperties: number }>(
    "/seo-autopilot/analytics/property",
    { method: "POST", body: JSON.stringify({ property }) },
  );
}

export function syncSeoOrganicAttribution() {
  return apiFetch<SeoAnalyticsAttributionSummary>(
    "/seo-autopilot/analytics/sync",
    { method: "POST" },
  );
}
