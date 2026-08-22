import { apiFetch } from "@/lib/api-client";
import type { Product, ProductKind, ProductVariation } from "@/lib/products";

/** Raw shape of a Prisma `Product` row as JSON (Decimal fields serialize as strings). */
interface RawProduct {
  id: string;
  kind: ProductKind;
  name: string;
  category: string | null;
  categoryId: string | null;
  sku: string | null;
  variations: { label: string; options: { name: string; priceOverride?: number }[] }[];
  costPrice: string;
  sellingPrice: string;
  stockQty: number;
  lowStockThreshold: number;
  durationMin: number | null;
  active: boolean;
  eligibleStaffIds: string[];
  bufferBeforeMin: number | null;
  bufferAfterMin: number | null;
  depositRequired: boolean;
  depositAmount: string | null;
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
    categoryId: raw.categoryId ?? undefined,
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
    eligibleStaffIds: raw.eligibleStaffIds,
    bufferBeforeMin: raw.bufferBeforeMin ?? undefined,
    bufferAfterMin: raw.bufferAfterMin ?? undefined,
    depositRequired: raw.depositRequired,
    depositAmount: raw.depositAmount != null ? Number(raw.depositAmount) : undefined,
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
  categoryId?: string;
  kind: ProductKind;
  sku?: string;
  price: number;
  costPrice: number;
  stockOnHand?: number;
  lowStockThreshold?: number;
  durationMinutes?: number;
  variations: ProductVariation[];
  active?: boolean;
  eligibleStaffIds?: string[];
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  depositRequired?: boolean;
  depositAmount?: number;
}

function toPayload(draft: ProductDraft) {
  return {
    kind: draft.kind,
    name: draft.name,
    category: draft.category || undefined,
    categoryId: draft.categoryId || undefined,
    sku: draft.sku || undefined,
    variations: toVariationPayload(draft.variations),
    costPrice: draft.costPrice,
    sellingPrice: draft.price,
    stockQty: draft.kind === "product" ? (draft.stockOnHand ?? 0) : undefined,
    lowStockThreshold: draft.kind === "product" ? draft.lowStockThreshold : undefined,
    eligibleStaffIds: draft.kind === "service" ? draft.eligibleStaffIds : undefined,
    bufferBeforeMin: draft.kind === "service" ? draft.bufferBeforeMin : undefined,
    bufferAfterMin: draft.kind === "service" ? draft.bufferAfterMin : undefined,
    depositRequired: draft.kind === "service" ? draft.depositRequired : undefined,
    depositAmount: draft.kind === "service" ? draft.depositAmount : undefined,
    durationMin: draft.kind === "service" ? draft.durationMinutes : undefined,
    active: draft.active,
  };
}

export interface ProductFilters {
  q?: string;
  category?: string;
  categoryId?: string;
  kind?: ProductKind;
  active?: boolean;
}

export async function fetchProducts(filters: ProductFilters = {}): Promise<Product[]> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
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
