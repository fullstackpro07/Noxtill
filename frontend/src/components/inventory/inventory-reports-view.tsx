"use client";

import { useState } from "react";
import { fetchInventory, fetchStockMovements, fetchLowStock, fetchReorderSuggestions } from "@/lib/inventory-api";
import { fetchPurchaseOrders } from "@/lib/purchase-orders-api";
import { fetchProducts } from "@/lib/products-api";
import { formatDate } from "@/lib/format";
import { INV } from "@/components/inventory/inventory-ui";
import { toast } from "@/lib/toast";

function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

interface ReportDef {
  name: string;
  description: string;
  run: () => Promise<void>;
}

export function InventoryReportsView() {
  const [running, setRunning] = useState<string | null>(null);

  const reports: ReportDef[] = [
    {
      name: "Stock on hand",
      description: "Every tracked product's on-hand quantity, threshold and value at cost, as of right now.",
      run: async () => {
        const items = await fetchInventory();
        downloadCsv(
          "stock-on-hand.csv",
          ["Product", "SKU", "Category", "On hand", "Threshold", "Value at cost", "Status"],
          items.map((i) => [i.name, i.sku ?? "", i.category ?? "", i.stockQty, i.lowStockThreshold, i.stockValue, i.status]),
        );
      },
    },
    {
      name: "Stock movements",
      description: "Every purchase, sale, wastage, adjustment and transfer on record, with running balances.",
      run: async () => {
        const rows = await fetchStockMovements({});
        downloadCsv(
          "stock-movements.csv",
          ["Date", "Product", "Type", "Quantity", "Unit cost", "Balance after"],
          rows.map((m) => [formatDate(m.createdAt), m.productName, m.kind, m.qty, m.unitCost ?? "", m.resultingBalance]),
        );
      },
    },
    {
      name: "Low stock & out of stock",
      description: "Products at or below their reorder threshold, with estimated lost sales while out.",
      run: async () => {
        const items = await fetchLowStock();
        downloadCsv(
          "low-stock.csv",
          ["Product", "On hand", "Threshold", "Days out of stock", "Estimated lost sales"],
          items.map((i) => [i.name, i.stockQty, i.lowStockThreshold, i.daysOutOfStock, i.lostSalesEstimate]),
        );
      },
    },
    {
      name: "Wastage log",
      description: "Every recorded write-off, by product and reason, with its cost-price value.",
      run: async () => {
        const rows = await fetchStockMovements({ kind: "wastage" });
        downloadCsv(
          "wastage-log.csv",
          ["Date", "Product", "Quantity", "Reason", "Note"],
          rows.map((m) => [formatDate(m.createdAt), m.productName, Math.abs(m.qty), m.wastageReason ?? "Other", m.description]),
        );
      },
    },
    {
      name: "Purchase orders",
      description: "Every purchase order, its supplier, line count, total cost and current status.",
      run: async () => {
        const orders = await fetchPurchaseOrders();
        downloadCsv(
          "purchase-orders.csv",
          ["Supplier", "Items", "Qty", "Total cost", "Status", "Ordered", "Received"],
          orders.map((o) => [
            o.supplier.name,
            o.items.length,
            o.items.reduce((s, i) => s + i.qtyOrdered, 0),
            o.items.reduce((s, i) => s + i.qtyOrdered * i.unitCost, 0),
            o.status,
            formatDate(o.createdAt),
            o.receivedAt ? formatDate(o.receivedAt) : "",
          ]),
        );
      },
    },
    {
      name: "Reorder suggestions",
      description: "What the reorder algorithm currently suggests buying, grouped by supplier.",
      run: async () => {
        const groups = await fetchReorderSuggestions();
        downloadCsv(
          "reorder-suggestions.csv",
          ["Supplier", "Product", "Current stock", "Velocity/day", "Suggested qty"],
          groups.flatMap((g) => g.items.map((i) => [g.supplierName, i.name, i.currentStock, i.velocityPerDay, i.suggestedQty])),
        );
      },
    },
    {
      name: "Valuation by product",
      description: "Stock value, cost and 30-day sales velocity for every product, for checking capital tied up in stock.",
      run: async () => {
        const [items, products] = await Promise.all([fetchInventory(), fetchProducts({ active: true })]);
        const priceById = new Map(products.map((p) => [p.id, p.price]));
        downloadCsv(
          "valuation-by-product.csv",
          ["Product", "Stock value", "Units", "Unit cost", "Selling price", "Velocity/day"],
          items.map((i) => [i.name, i.stockValue, i.stockQty, i.costPrice, priceById.get(i.id) ?? "", i.velocityPerDay]),
        );
      },
    },
  ];

  async function run(report: ReportDef) {
    setRunning(report.name);
    try {
      await report.run();
      toast.success(`${report.name} exported.`);
    } catch {
      toast.error(`Couldn't export ${report.name} — please try again.`);
    } finally {
      setRunning(null);
    }
  }

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ fontSize: 12, color: "#667085" }}>Reports draw on connected sales, stock and movement data — every one below is generated from what&apos;s live in this business right now.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
        {reports.map((r) => (
          <div key={r.name} style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#101828", flex: 1, minWidth: 0 }}>{r.name}</span>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 20, background: "#E8F7EE", color: "#0E8442", whiteSpace: "nowrap" }}>Ready</span>
            </div>
            <div style={{ fontSize: 12, color: "#475467", marginTop: 7, lineHeight: 1.6 }}>{r.description}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 13 }}>
              <button
                type="button"
                onClick={() => run(r)}
                disabled={running === r.name}
                style={{ flex: 1, border: 0, background: INV.primary, borderRadius: 10, padding: 10, fontSize: 12, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 44, opacity: running === r.name ? 0.6 : 1 }}
              >
                {running === r.name ? "Exporting…" : "Export CSV"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
