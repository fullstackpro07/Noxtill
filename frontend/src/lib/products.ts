export type ProductKind = "product" | "service";

export interface ProductVariation {
  name: string;
  price: number;
}

export interface Product {
  id: string;
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
  active: boolean;
  photoUrl?: string | null;
  /** Services, formal fields (UPD-BE-087) — only meaningful for kind: "service". */
  eligibleStaffIds?: string[];
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  depositRequired?: boolean;
  depositAmount?: number;
}

export const PRODUCT_CATEGORIES = ["Hair", "Skin", "Nails", "Retail", "Color"] as const;

export function marginPercent(price: number, cost: number): number {
  if (price <= 0) return 0;
  return ((price - cost) / price) * 100;
}
