import { apiFetch } from "@/lib/api-client";

export interface LiveCategory {
  id: string;
  name: string;
  sortOrder: number;
  productCount: number;
}

export function fetchCategories(): Promise<LiveCategory[]> {
  return apiFetch<LiveCategory[]>("/categories");
}

export function createCategory(input: { name: string; sortOrder?: number }): Promise<LiveCategory> {
  return apiFetch<LiveCategory>("/categories", { method: "POST", body: JSON.stringify(input) });
}

export function updateCategory(id: string, input: { name?: string; sortOrder?: number }): Promise<LiveCategory> {
  return apiFetch<LiveCategory>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteCategory(id: string): Promise<void> {
  return apiFetch<void>(`/categories/${id}`, { method: "DELETE" });
}

export function reorderCategories(categories: { id: string; sortOrder: number }[]): Promise<LiveCategory[]> {
  return apiFetch<LiveCategory[]>("/categories/reorder", { method: "PATCH", body: JSON.stringify({ categories }) });
}

export function mergeCategory(id: string, targetCategoryId: string): Promise<{ mergedInto: string; movedProductCount: number }> {
  return apiFetch(`/categories/${id}/merge`, { method: "POST", body: JSON.stringify({ targetCategoryId }) });
}

export interface CategoryRevenue {
  categoryId: string;
  categoryName: string;
  revenue: number;
}

export function fetchCategoryRevenue(): Promise<CategoryRevenue[]> {
  return apiFetch<CategoryRevenue[]>("/categories/revenue");
}
