import { apiFetch } from "@/lib/api-client";

export type ListingPhotoCategory = "exterior" | "interior" | "team" | "products" | "logo";

export interface ListingPhoto {
  id: string;
  businessId: string;
  url: string;
  category: ListingPhotoCategory;
  pushedProviders: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PhotoPushResult {
  provider: string;
  status: "success" | "failed";
  message?: string;
}

/** GET /listings/photos */
export function fetchListingPhotos(): Promise<ListingPhoto[]> {
  return apiFetch<ListingPhoto[]>("/listings/photos");
}

/** POST /listings/photos */
export function createListingPhoto(dto: { url: string; category: ListingPhotoCategory }): Promise<ListingPhoto> {
  return apiFetch<ListingPhoto>("/listings/photos", { method: "POST", body: JSON.stringify(dto) });
}

/** PATCH /listings/photos/:id */
export function updateListingPhoto(id: string, category: ListingPhotoCategory): Promise<ListingPhoto> {
  return apiFetch<ListingPhoto>(`/listings/photos/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ category }),
  });
}

/** DELETE /listings/photos/:id */
export function deleteListingPhoto(id: string): Promise<void> {
  return apiFetch<void>(`/listings/photos/${id}`, { method: "DELETE" });
}

/** POST /listings/photos/:id/push — omit providers to push to every provider that supports it. */
export function pushListingPhoto(id: string, providers?: string[]): Promise<PhotoPushResult[]> {
  return apiFetch<PhotoPushResult[]>(`/listings/photos/${id}/push`, {
    method: "POST",
    body: JSON.stringify({ providers }),
  });
}
