import { apiFetch } from "@/lib/api-client";

export interface LiveSupplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

export interface SupplierDraft {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export function fetchSuppliers(): Promise<LiveSupplier[]> {
  return apiFetch<LiveSupplier[]>("/suppliers");
}

export function createSupplier(draft: SupplierDraft): Promise<LiveSupplier> {
  return apiFetch<LiveSupplier>("/suppliers", { method: "POST", body: JSON.stringify(draft) });
}

export function updateSupplier(id: string, draft: Partial<SupplierDraft>): Promise<LiveSupplier> {
  return apiFetch<LiveSupplier>(`/suppliers/${id}`, { method: "PATCH", body: JSON.stringify(draft) });
}

export function deleteSupplier(id: string): Promise<void> {
  return apiFetch<void>(`/suppliers/${id}`, { method: "DELETE" });
}

export interface QuickPoLine {
  productId: string;
  qty: number;
  unitCost: number;
}

export interface QuickPoResult {
  supplierId: string;
  lines: { productId: string; productName: string; qty: number; unitCost: number; stockMovementId?: string }[];
}

export function quickPurchaseOrder(supplierId: string, items: QuickPoLine[]): Promise<QuickPoResult> {
  return apiFetch<QuickPoResult>(`/suppliers/${supplierId}/purchase-order`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}
