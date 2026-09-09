import type { DigitizerDestination } from "@/lib/digitizer-api";

export interface FieldConfig {
  key: string;
  label: string;
  type: "text" | "number" | "date";
}

/** Real fields each destination's `commitRow()` actually reads (`backend/src/digitizer/digitizer.service.ts`) — matches exactly, no extra/fabricated fields. */
export const DESTINATION_FIELDS: Record<DigitizerDestination, FieldConfig[]> = {
  customer: [
    { key: "name", label: "Name", type: "text" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "balance", label: "Opening balance", type: "number" },
  ],
  product: [
    { key: "name", label: "Name", type: "text" },
    { key: "sku", label: "SKU", type: "text" },
    { key: "costPrice", label: "Cost price", type: "number" },
    { key: "sellingPrice", label: "Selling price", type: "number" },
    { key: "stockQty", label: "Stock qty", type: "number" },
  ],
  expense: [
    { key: "description", label: "Description", type: "text" },
    { key: "category", label: "Category", type: "text" },
    { key: "amount", label: "Amount", type: "number" },
    { key: "incurredOn", label: "Date", type: "date" },
  ],
  supplier: [
    { key: "name", label: "Name", type: "text" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "email", label: "Email", type: "text" },
  ],
  credit_opening_balance: [
    { key: "customerName", label: "Customer name", type: "text" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "amount", label: "Amount", type: "number" },
  ],
};
