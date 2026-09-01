import { apiFetch } from "@/lib/api-client";

export type InventoryStatus = "out_of_stock" | "low_stock" | "ok";

export interface LiveInventoryItem {
  id: string;
  name: string;
  stockQty: number;
  lowStockThreshold: number;
  costPrice: number;
  stockValue: number;
  lastPurchaseAt: string | null;
  supplier: string | null;
  status: InventoryStatus;
}

/** GET /inventory — on-hand/threshold/value for every product-kind item, plus its most recent purchase's supplier. */
export function fetchInventory(): Promise<LiveInventoryItem[]> {
  return apiFetch<LiveInventoryItem[]>("/inventory");
}

/** UPD-BE-110 fix-it: the real `StockMovementKind` enum has 7 values — this used to only list 3,
 * so a Stock Count adjustment or a Stock Transfer row silently fell through `describeMovement()`'s
 * catch-all "Sold via POS" branch and had no icon/tone in `MOVEMENT_ICON`/`MOVEMENT_TONE`. */
export type MovementKind = "purchase" | "sale" | "wastage" | "adjustment" | "return" | "transfer_out" | "transfer_in";

interface RawMovement {
  id: string;
  kind: MovementKind;
  qty: number;
  unitCost: string | null;
  supplier: string | null;
  reason: string | null;
  createdAt: string;
}

export interface LiveMovement {
  id: string;
  kind: MovementKind;
  qty: number;
  description: string;
  createdAt: string;
}

function describeMovement(m: RawMovement): string {
  switch (m.kind) {
    case "purchase":
      return m.supplier ? `Restocked from ${m.supplier}` : "Restocked";
    case "wastage":
      return m.reason ?? "Written off";
    case "sale":
      return "Sold via POS";
    case "adjustment":
      return m.reason ?? "Stock count adjustment";
    case "return":
      return m.reason ?? "Customer return";
    case "transfer_out":
      return m.reason ?? "Transferred to another branch";
    case "transfer_in":
      return m.reason ?? "Transferred from another branch";
  }
}

function toLiveMovement(m: RawMovement): LiveMovement {
  return { id: m.id, kind: m.kind, qty: m.qty, description: describeMovement(m), createdAt: m.createdAt };
}

export function fetchMovements(productId: string): Promise<LiveMovement[]> {
  return apiFetch<RawMovement[]>(`/inventory/${productId}/movements`).then((rows) => rows.map(toLiveMovement));
}

export interface RecordPurchaseInput {
  productId: string;
  qty: number;
  unitCost: number;
  supplier?: string;
}

export function recordPurchase(input: RecordPurchaseInput): Promise<LiveMovement> {
  return apiFetch<RawMovement>("/inventory/purchases", {
    method: "POST",
    body: JSON.stringify(input),
  }).then(toLiveMovement);
}

export type WastageReason = "Expired" | "Damaged" | "Theft" | "Other";

export interface RecordWastageInput {
  productId: string;
  qty: number;
  reason: WastageReason;
  note?: string;
}

export function recordWastage(input: RecordWastageInput): Promise<LiveMovement> {
  return apiFetch<RawMovement>("/inventory/wastage", {
    method: "POST",
    body: JSON.stringify(input),
  }).then(toLiveMovement);
}

// --- Stock Movements, cross-product (UPD-BE-110) ---

interface RawMovementWithBalance extends RawMovement {
  productId: string;
  resultingBalance: number;
  product: { id: string; name: string };
  supplierRef: { id: string; name: string } | null;
}

export interface StockMovementRow extends LiveMovement {
  productId: string;
  productName: string;
  resultingBalance: number;
  supplierName: string | null;
}

function toStockMovementRow(m: RawMovementWithBalance): StockMovementRow {
  return {
    ...toLiveMovement(m),
    productId: m.productId,
    productName: m.product.name,
    resultingBalance: m.resultingBalance,
    supplierName: m.supplierRef?.name ?? m.supplier ?? null,
  };
}

export interface MovementFilters {
  productId?: string;
  kind?: MovementKind;
  from?: string;
  to?: string;
}

export async function fetchStockMovements(filters: MovementFilters = {}): Promise<StockMovementRow[]> {
  const query = new URLSearchParams();
  if (filters.productId) query.set("productId", filters.productId);
  if (filters.kind) query.set("kind", filters.kind);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const qs = query.toString();
  const raw = await apiFetch<RawMovementWithBalance[]>(`/stock/movements${qs ? `?${qs}` : ""}`);
  return raw.map(toStockMovementRow);
}

// --- Low Stock, dedicated (UPD-BE-111) ---

export interface LowStockItem extends LiveInventoryItem {
  daysOutOfStock: number;
  lostSalesEstimate: number;
}

export function fetchLowStock(): Promise<LowStockItem[]> {
  return apiFetch<LowStockItem[]>("/stock?status=low");
}

// --- Back-in-stock waitlist (UPD-BE-111) ---

export interface WaitlistEntry {
  id: string;
  productId: string;
  customerId: string;
  customer: { id: string; name: string; phone: string };
  notifiedAt: string | null;
  createdAt: string;
}

export function fetchWaitlist(productId: string): Promise<WaitlistEntry[]> {
  return apiFetch<WaitlistEntry[]>(`/stock/${productId}/waitlist`);
}

export function addToWaitlist(productId: string, customerId: string): Promise<WaitlistEntry> {
  return apiFetch<WaitlistEntry>(`/stock/${productId}/waitlist`, {
    method: "POST",
    body: JSON.stringify({ customerId }),
  });
}

export function removeFromWaitlist(id: string): Promise<void> {
  return apiFetch<void>(`/stock/waitlist/${id}`, { method: "DELETE" });
}

export function notifyWaitlist(productId: string): Promise<{ notifiedCount: number }> {
  return apiFetch<{ notifiedCount: number }>(`/stock/${productId}/waitlist/notify`, { method: "POST" });
}

/** A lighter partial update than `updateProduct()` (which requires the full product draft) — safe for a single-field bulk threshold edit. */
export function updateLowStockThreshold(productId: string, lowStockThreshold: number): Promise<void> {
  return apiFetch<void>(`/products/${productId}`, {
    method: "PATCH",
    body: JSON.stringify({ lowStockThreshold }),
  });
}

// --- Reorder Suggestions (UPD-BE-077, real backend, previously zero frontend) ---

export interface ReorderSuggestionItem {
  productId: string;
  name: string;
  sku: string | null;
  currentStock: number;
  velocityPerDay: number;
  suggestedQty: number;
}

export interface ReorderSuggestionGroup {
  supplierId: string;
  supplierName: string;
  items: ReorderSuggestionItem[];
  totalSuggestedQty: number;
}

export function fetchReorderSuggestions(): Promise<ReorderSuggestionGroup[]> {
  return apiFetch<ReorderSuggestionGroup[]>("/stock/reorder-suggestions");
}
