import { apiFetch } from "@/lib/api-client";

export interface SeoHeatmapPoint {
  id: string;
  scanId: string;
  keyword: string;
  lat: number;
  lng: number;
  /** null = the business did not appear in the local pack results at this point — never fabricated. */
  rank: number | null;
  scannedAt: string;
}

export interface SeoHeatmapResult {
  scanId: string | null;
  keyword: string;
  points: SeoHeatmapPoint[];
}

export function fetchSeoHeatmap(keyword: string): Promise<SeoHeatmapResult> {
  return apiFetch<SeoHeatmapResult>(`/seo/heatmap?keyword=${encodeURIComponent(keyword)}`);
}

export interface ScanSeoHeatmapInput {
  keyword: string;
  radiusKm?: number;
  ringPoints?: number;
}

export interface SeoHeatmapScanResult {
  scanId: string;
  keyword: string;
  points: { lat: number; lng: number; rank: number | null }[];
}

/** Real scan: geocodes the business address, samples a compass-rose grid of points, and does a real local-pack rank lookup at each — needs MAPS_PROVIDER_API_KEY/SERPAPI_KEY configured server-side, throws a typed error otherwise. */
export function scanSeoHeatmap(input: ScanSeoHeatmapInput): Promise<SeoHeatmapScanResult> {
  return apiFetch<SeoHeatmapScanResult>("/seo/heatmap/scan", { method: "POST", body: JSON.stringify(input) });
}
