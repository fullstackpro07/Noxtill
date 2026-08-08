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

export type MovementKind = "purchase" | "sale" | "wastage";

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

/** Purchases carry a supplier, wastage carries a reason, sales carry neither — describe each kind from whichever field it actually has. */
function describeMovement(m: RawMovement): string {
  if (m.kind === "purchase") return m.supplier ? `Restocked from ${m.supplier}` : "Restocked";
  if (m.kind === "wastage") return m.reason ?? "Written off";
  return "Sold via POS";
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

export type WastageReason = "Expired" | "Damaged" | "Other";

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
