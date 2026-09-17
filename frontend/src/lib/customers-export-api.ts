import { apiFetch } from "@/lib/api-client";

export type CustomerExportFormat = "csv" | "xlsx" | "pdf";
export type CustomerExportField = "name" | "phone" | "email" | "tags" | "spend" | "visits" | "lastVisit" | "credit";

export const CUSTOMER_EXPORT_FIELDS: { key: CustomerExportField; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "tags", label: "Tags" },
  { key: "spend", label: "Total spend" },
  { key: "visits", label: "Visits" },
  { key: "lastVisit", label: "Last visit" },
  { key: "credit", label: "Credit balance" },
];

export interface ExportCustomersInput {
  format: CustomerExportFormat;
  fields: CustomerExportField[];
}

/** POST /customers/export — a real server-generated file (CSV/Excel/PDF), uploaded and signed,
 * logged to real export history. */
export function exportCustomers(input: ExportCustomersInput): Promise<{ url: string; rowCount: number }> {
  return apiFetch<{ url: string; rowCount: number }>("/customers/export", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface CustomerExportLogEntry {
  id: string;
  userId: string;
  format: CustomerExportFormat;
  rowCount: number;
  fields: CustomerExportField[];
  fileUrl: string | null;
  createdAt: string;
}

/** GET /customers/export-history — every bulk export actually run, most recent first. */
export function fetchCustomerExportHistory(): Promise<CustomerExportLogEntry[]> {
  return apiFetch<CustomerExportLogEntry[]>("/customers/export-history");
}
