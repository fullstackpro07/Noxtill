import { apiFetch } from "@/lib/api-client";

interface RawBundleItem {
  productId: string;
  qty: number;
  product: { name: string; sellingPrice: string };
}

interface RawBundle {
  id: string;
  productId: string;
  product: { name: string; sku: string | null; costPrice: string; sellingPrice: string; active: boolean };
  items: RawBundleItem[];
}

export interface LiveBundleItem {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface LiveBundle {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  costPrice: number;
  sellingPrice: number;
  active: boolean;
  items: LiveBundleItem[];
}

function toLiveBundle(raw: RawBundle): LiveBundle {
  return {
    id: raw.id,
    productId: raw.productId,
    name: raw.product.name,
    sku: raw.product.sku,
    costPrice: Number(raw.product.costPrice),
    sellingPrice: Number(raw.product.sellingPrice),
    active: raw.product.active,
    items: raw.items.map((i) => ({
      productId: i.productId,
      name: i.product.name,
      qty: i.qty,
      unitPrice: Number(i.product.sellingPrice),
    })),
  };
}

export interface BundleDraft {
  name: string;
  sku?: string;
  sellingPrice: number;
  items: { productId: string; qty: number }[];
}

export function fetchBundles(): Promise<LiveBundle[]> {
  return apiFetch<RawBundle[]>("/products/bundle").then((rows) => rows.map(toLiveBundle));
}

export function createBundle(draft: BundleDraft): Promise<LiveBundle> {
  return apiFetch<RawBundle>("/products/bundle", { method: "POST", body: JSON.stringify(draft) }).then(toLiveBundle);
}

export function deleteBundle(id: string): Promise<void> {
  return apiFetch<void>(`/products/bundle/${id}`, { method: "DELETE" });
}

export interface BundleSuggestion {
  productAId: string;
  productBId: string;
  nameA: string;
  nameB: string;
  togetherCount: number;
  combinedPrice: number;
  suggestedPrice: number;
  pitch: string;
}

export function fetchBundleSuggestions(): Promise<BundleSuggestion[]> {
  return apiFetch<BundleSuggestion[]>("/profit/bundle-suggestions");
}
