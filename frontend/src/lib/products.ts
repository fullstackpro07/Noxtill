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
  /** Services, formal fields (UPD-BE-087) — only meaningful for kind: "service". */
  eligibleStaffIds?: string[];
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  depositRequired?: boolean;
  depositAmount?: number;
}

export const PRODUCT_CATEGORIES = ["Hair", "Skin", "Nails", "Retail", "Color"] as const;

/** Mock catalog for Sunset Hair Studio — real CRUD wires up in INT-003. */
export const PRODUCTS: Product[] = [
  { id: "p1", name: "Signature Haircut", category: "Hair", kind: "service", price: 45, costPrice: 12, durationMinutes: 45, variations: [], active: true },
  { id: "p2", name: "Beard Trim", category: "Hair", kind: "service", price: 20, costPrice: 5, durationMinutes: 20, variations: [], active: true },
  { id: "p3", name: "Full Color & Highlights", category: "Color", kind: "service", price: 120, costPrice: 38, durationMinutes: 120, variations: [{ name: "Root touch-up", price: 85 }], active: true },
  { id: "p4", name: "Deep Conditioning Treatment", category: "Hair", kind: "service", price: 35, costPrice: 9, durationMinutes: 30, variations: [], active: true },
  { id: "p5", name: "Classic Manicure", category: "Nails", kind: "service", price: 28, costPrice: 7, durationMinutes: 35, variations: [{ name: "Gel finish", price: 38 }], active: true },
  { id: "p6", name: "Express Facial", category: "Skin", kind: "service", price: 55, costPrice: 18, durationMinutes: 40, variations: [], active: true },
  { id: "p7", name: "Argan Oil Shampoo", category: "Retail", kind: "product", sku: "SKU-1042", price: 24, costPrice: 11, stockOnHand: 3, lowStockThreshold: 5, variations: [], active: true },
  { id: "p8", name: "Keratin Conditioner", category: "Retail", kind: "product", sku: "SKU-1043", price: 22, costPrice: 10, stockOnHand: 14, lowStockThreshold: 5, variations: [], active: true },
  { id: "p9", name: "Boar Bristle Brush", category: "Retail", kind: "product", sku: "SKU-1044", price: 16, costPrice: 6, stockOnHand: 22, lowStockThreshold: 5, variations: [], active: true },
  { id: "p10", name: "Heat Protectant Spray", category: "Retail", kind: "product", sku: "SKU-1045", price: 19, costPrice: 8, stockOnHand: 1, lowStockThreshold: 5, variations: [], active: true },
  { id: "p11", name: "Scalp Massage Add-on", category: "Hair", kind: "service", price: 15, costPrice: 3, durationMinutes: 15, variations: [], active: true },
  { id: "p12", name: "Bridal Package", category: "Hair", kind: "service", price: 220, costPrice: 60, durationMinutes: 180, variations: [], active: false },
];

export function marginPercent(price: number, cost: number): number {
  if (price <= 0) return 0;
  return ((price - cost) / price) * 100;
}
