import { apiFetch } from "@/lib/api-client";
import type { Product, ProductKind, ProductVariation } from "@/lib/products";

/** Raw shape of a Prisma `Product` row as JSON (Decimal fields serialize as strings). */
interface RawProduct {
  id: string;
  kind: ProductKind;
  name: string;
  category: string | null;
  sku: string | null;
  variations: { label: string; options: { name: string; priceOverride?: number }[] }[];
  costPrice: string;
  sellingPrice: string;
  stockQty: number;
  lowStockThreshold: number;
  durationMin: number | null;
  active: boolean;
}

/**
 * Backend variations are grouped (`{label, options: [...]}`) to support multi-choice variants later;
 * the frontend UI only ever edits one flat named price per variation, so each group's first option
 * round-trips losslessly through our own write path (see toVariationPayload below).
 */
function toProduct(raw: RawProduct): Product {
  const price = Number(raw.sellingPrice);
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category ?? "",
    kind: raw.kind,
    sku: raw.sku ?? undefined,
    price,
    costPrice: Number(raw.costPrice),
    stockOnHand: raw.kind === "product" ? raw.stockQty : undefined,
    lowStockThreshold: raw.kind === "product" ? raw.lowStockThreshold : undefined,
    durationMinutes: raw.kind === "service" ? (raw.durationMin ?? undefined) : undefined,
    variations: raw.variations.map((v) => ({
      name: v.label,
      price: v.options[0]?.priceOverride ?? price,
    })),
    active: raw.active,
  };
}

function toVariationPayload(variations: ProductVariation[]) {
  return variations.map((v) => ({
    label: v.name,
    options: [{ name: v.name, priceOverride: v.price }],
  }));
}

export interface ProductDraft {
  name: string;
  category: string;
  kind: ProductKind;
  sku?: string;
  price: number;
  costPrice: number;
  stockOnHand?: number;
  lowStockThreshold?: number;
  durationMinutes?: number;
  variations: ProductVariation[];
  active?: boolean;
}

function toPayload(draft: ProductDraft) {
  return {
    kind: draft.kind,
    name: draft.name,
    category: draft.category || undefined,
    sku: draft.sku || undefined,
    variations: toVariationPayload(draft.variations),
    costPrice: draft.costPrice,
    sellingPrice: draft.price,
    stockQty: draft.kind === "product" ? (draft.stockOnHand ?? 0) : undefined,
    lowStockThreshold: draft.kind === "product" ? draft.lowStockThreshold : undefined,
    durationMin: draft.kind === "service" ? draft.durationMinutes : undefined,
    active: draft.active,
  };
}

export interface ProductFilters {
  q?: string;
  category?: string;
  kind?: ProductKind;
  active?: boolean;
}

export async function fetchProducts(filters: ProductFilters = {}): Promise<Product[]> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.active !== undefined) params.set("active", String(filters.active));
  const query = params.toString();
  const raw = await apiFetch<RawProduct[]>(`/products${query ? `?${query}` : ""}`);
  return raw.map(toProduct);
}

export async function createProduct(draft: ProductDraft): Promise<Product> {
  const raw = await apiFetch<RawProduct>("/products", {
    method: "POST",
    body: JSON.stringify(toPayload(draft)),
  });
  return toProduct(raw);
}

export async function updateProduct(id: string, draft: ProductDraft): Promise<Product> {
  const raw = await apiFetch<RawProduct>(`/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(toPayload(draft)),
  });
  return toProduct(raw);
}

export async function deactivateProduct(id: string): Promise<Product> {
  const raw = await apiFetch<RawProduct>(`/products/${id}/deactivate`, { method: "PATCH" });
  return toProduct(raw);
}

export interface ImportSummary {
  created: number;
  skipped: number;
  errorsFileUrl?: string;
}

/** POST /products/import — backend expects canonical columns (name, kind, category, sku, costPrice, sellingPrice, stockQty), no arbitrary column mapping. */
export function importProductsFile(file: File): Promise<ImportSummary> {
  const formData = new FormData();
  formData.append("file", file);
  return apiFetch<ImportSummary>("/products/import", {
    method: "POST",
    body: formData,
  });
}
