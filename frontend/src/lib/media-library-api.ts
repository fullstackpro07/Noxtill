import { apiFetch } from "@/lib/api-client";

export type MediaAssetType = "image" | "video";

export interface MediaAsset {
  id: string;
  businessId: string;
  key: string;
  type: MediaAssetType;
  source: string;
  prompt: string | null;
  tags: string[];
  usageCount: number;
  createdAt: string;
  url: string;
}

export function fetchMediaAssets(type?: MediaAssetType): Promise<MediaAsset[]> {
  const qs = type ? `?type=${type}` : "";
  return apiFetch<MediaAsset[]>(`/media${qs}`);
}

export async function uploadMediaAsset(file: File): Promise<MediaAsset> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<MediaAsset>("/media", { method: "POST", body: form });
}

export function generateMediaImage(prompt: string, tags?: string[]): Promise<MediaAsset> {
  return apiFetch<MediaAsset>("/media/generate", { method: "POST", body: JSON.stringify({ prompt, tags }) });
}

export function updateMediaAsset(id: string, tags: string[]): Promise<MediaAsset> {
  return apiFetch<MediaAsset>(`/media/${id}`, { method: "PATCH", body: JSON.stringify({ tags }) });
}

export function deleteMediaAsset(id: string): Promise<void> {
  return apiFetch<void>(`/media/${id}`, { method: "DELETE" });
}
