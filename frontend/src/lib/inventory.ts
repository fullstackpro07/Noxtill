export type MovementType = "purchase" | "sale" | "wastage";
export type WastageReason = "damaged" | "expired" | "theft" | "other";

export interface StockMovement {
  id: string;
  type: MovementType;
  date: string;
  qtyChange: number;
  note: string;
}

export interface InventoryItem {
  productId: string;
  name: string;
  supplier: string;
  stockOnHand: number;
  lowStockThreshold: number;
  costPrice: number;
  movements: StockMovement[];
}

export const SUPPLIERS = ["BeautyCo Distributors", "Northgate Salon Supply", "Pure Ingredients Co."] as const;

export const WASTAGE_REASONS: { key: WastageReason; label: string }[] = [
  { key: "damaged", label: "Damaged" },
  { key: "expired", label: "Expired" },
  { key: "theft", label: "Theft" },
  { key: "other", label: "Other" },
];

/** Mock inventory book layered on top of PRODUCTS — real purchase/wastage endpoints are BE-033, live wiring is INT-005. */
export const INVENTORY_ITEMS: InventoryItem[] = [
  {
    productId: "p7",
    name: "Argan Oil Shampoo",
    supplier: "BeautyCo Distributors",
    stockOnHand: 3,
    lowStockThreshold: 5,
    costPrice: 11,
    movements: [
      { id: "m1", type: "purchase", date: "2026-06-20", qtyChange: 20, note: "Restock from BeautyCo" },
      { id: "m2", type: "sale", date: "2026-07-10", qtyChange: -12, note: "Sold via POS" },
      { id: "m3", type: "wastage", date: "2026-07-18", qtyChange: -5, note: "Damaged in storage" },
    ],
  },
  {
    productId: "p8",
    name: "Keratin Conditioner",
    supplier: "BeautyCo Distributors",
    stockOnHand: 14,
    lowStockThreshold: 5,
    costPrice: 10,
    movements: [
      { id: "m4", type: "purchase", date: "2026-06-20", qtyChange: 20, note: "Restock from BeautyCo" },
      { id: "m5", type: "sale", date: "2026-07-12", qtyChange: -6, note: "Sold via POS" },
    ],
  },
  {
    productId: "p9",
    name: "Boar Bristle Brush",
    supplier: "Northgate Salon Supply",
    stockOnHand: 22,
    lowStockThreshold: 5,
    costPrice: 6,
    movements: [{ id: "m6", type: "purchase", date: "2026-06-05", qtyChange: 25, note: "Initial stock" }],
  },
  {
    productId: "p10",
    name: "Heat Protectant Spray",
    supplier: "Pure Ingredients Co.",
    stockOnHand: 1,
    lowStockThreshold: 5,
    costPrice: 8,
    movements: [
      { id: "m7", type: "purchase", date: "2026-06-15", qtyChange: 10, note: "Restock from Pure Ingredients" },
      { id: "m8", type: "sale", date: "2026-07-20", qtyChange: -9, note: "Sold via POS" },
    ],
  },
];
