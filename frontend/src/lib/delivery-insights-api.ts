import { apiFetch } from "@/lib/api-client";
import type { KpiCardData } from "@/components/delivery/delivery-ui";

export interface InsightCell {
  [key: string]: string;
}
export interface InsightRow {
  i: string;
  cells: InsightCell;
}
export interface TableInsight {
  kpis: KpiCardData[];
  rows: InsightRow[];
}

export function fetchExceptions(): Promise<TableInsight> {
  return apiFetch<TableInsight>("/delivery-insights/exceptions");
}
export function fetchTracking(): Promise<TableInsight> {
  return apiFetch<TableInsight>("/delivery-insights/tracking");
}
export function fetchPod(): Promise<TableInsight> {
  return apiFetch<TableInsight>("/delivery-insights/pod");
}

export interface StageBreakdownItem {
  t: string;
  d: string;
  v: string;
  vColor: string;
}
export interface AnalyticsInsight {
  kpis: KpiCardData[];
  stageBreakdown: StageBreakdownItem[];
  panels: PanelInsight[];
  note: string;
}
export function fetchAnalytics(): Promise<AnalyticsInsight> {
  return apiFetch<AnalyticsInsight>("/delivery-insights/analytics");
}

export interface PanelItem {
  t: string;
  d?: string;
  v?: string;
  vColor?: string;
  tag?: string;
  tagBg?: string;
  tagFg?: string;
  toggle?: boolean;
  toggleOn?: boolean;
  settingKey?: string;
}
export interface PanelInsight {
  h: string;
  sub?: string;
  bd: string;
  items: PanelItem[];
}
export interface Rider360Insight {
  kpis: KpiCardData[];
  panels: PanelInsight[];
}
export function fetchRider360(riderId: string): Promise<Rider360Insight> {
  return apiFetch<Rider360Insight>(`/delivery-insights/rider/${riderId}`);
}

export interface RoutePanel extends PanelInsight {
  routeId: string;
}
export interface RoutesInsight {
  kpis: KpiCardData[];
  panels: RoutePanel[];
}
export function fetchRoutesSummary(): Promise<RoutesInsight> {
  return apiFetch<RoutesInsight>("/delivery-insights/routes");
}

export interface ZoneSummaryEntry {
  t: string;
  d: string;
  v: string;
  vColor: string;
}
export interface ZoneRule {
  key: string;
  t: string;
  d: string;
  on: boolean;
}
export interface ZonesInsight {
  hub: { lat: number; lng: number } | null;
  kpis: KpiCardData[];
  zones: ZoneSummaryEntry[];
  lossPanel: PanelInsight | null;
  rules: ZoneRule[];
}
export function fetchZonesSummary(): Promise<ZonesInsight> {
  return apiFetch<ZonesInsight>("/delivery-insights/zones");
}

export interface AutomationsInsight {
  kpis: KpiCardData[];
  panels: PanelInsight[];
}
export function fetchAutomationsSummary(): Promise<AutomationsInsight> {
  return apiFetch<AutomationsInsight>("/delivery-insights/automations");
}
