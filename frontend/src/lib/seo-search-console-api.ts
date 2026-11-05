import { apiFetch } from "@/lib/api-client";

export interface SeoSearchConsoleProperty {
  siteUrl: string;
  permissionLevel: string;
}

export interface SeoSearchConsoleSnapshot {
  id: string;
  propertyUrl: string;
  startDate: string;
  endDate: string;
  clicks: string | null;
  impressions: string | null;
  clickThroughRate: number | null;
  averagePosition: number | null;
  dataState: string;
  fetchedAt: string;
}

export interface SeoSearchConsoleSummary {
  status: "not_connected" | "connected" | "needs_attention";
  properties: SeoSearchConsoleProperty[];
  selectedProperty: string | null;
  lastPropertyRefreshAt: string | null;
  lastSyncAt: string | null;
  snapshots: SeoSearchConsoleSnapshot[];
  windowDays: number;
}

export interface SeoSearchConsoleKeywordSnapshot {
  id: string;
  startDate: string;
  endDate: string;
  clicks: string | null;
  impressions: string | null;
  clickThroughRate: number | null;
  averagePosition: number | null;
  dataState: string;
  fetchedAt: string;
}

export interface SeoSearchConsoleKeywordPerformance {
  id: string;
  keyword: string;
  snapshots: SeoSearchConsoleKeywordSnapshot[];
}

export interface SeoSearchConsoleKeywordSummary {
  status: "not_connected" | "connected" | "needs_attention";
  selectedProperty: string | null;
  trackedKeywordCount: number;
  latestWindowEnd: string | null;
  matchedKeywordCount: number;
  notReportedKeywordCount: number;
  windows: SeoSearchConsoleKeywordPerformance[];
}

export interface SeoSearchConsoleUrlInspection {
  inspectionResultLink: string | null;
  verdict: string | null;
  coverageState: string | null;
  indexingState: string | null;
  robotsTxtState: string | null;
  pageFetchState: string | null;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  sitemaps: string[];
  referringUrls: string[];
  propertyUrl: string;
  inspectionUrl: string;
  inspectedAt: string;
  source: "google_search_console_index";
  searchPerformance: {
    status: "final" | "no_data_returned" | "unavailable";
    startDate: string;
    endDate: string;
    pageUrl: string | null;
    clicks: string | null;
    impressions: string | null;
    clickThroughRate: number | null;
    averagePosition: number | null;
  };
  searchPerformanceDisclosure: string;
  disclosure: string;
}

export function fetchSeoSearchConsoleSummary() {
  return apiFetch<SeoSearchConsoleSummary>("/seo-autopilot/search-console");
}

export function fetchSeoSearchConsoleKeywordSummary() {
  return apiFetch<SeoSearchConsoleKeywordSummary>(
    "/seo-autopilot/search-console/keywords",
  );
}

export function refreshSeoSearchConsoleProperties() {
  return apiFetch<{
    id: string;
    properties: SeoSearchConsoleProperty[];
    refreshedAt: string;
  }>("/seo-autopilot/search-console/properties/refresh", { method: "POST" });
}

export function selectSeoSearchConsoleProperty(siteUrl: string) {
  return apiFetch<{ id: string; selectedProperty: string; availableProperties: number }>(
    "/seo-autopilot/search-console/property",
    { method: "POST", body: JSON.stringify({ siteUrl }) },
  );
}

export function syncSeoSearchConsolePerformance() {
  return apiFetch<{
    id: string;
    selectedProperty: string;
    fetchedAt: string;
    windows: { startDate: string; endDate: string; snapshot: SeoSearchConsoleSnapshot }[];
  }>("/seo-autopilot/search-console/sync", { method: "POST" });
}

export function inspectSeoSearchConsoleUrl(inspectionUrl: string) {
  return apiFetch<SeoSearchConsoleUrlInspection>(
    "/seo-autopilot/search-console/url-inspection",
    { method: "POST", body: JSON.stringify({ inspectionUrl }) },
  );
}
