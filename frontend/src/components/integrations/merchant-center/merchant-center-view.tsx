"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductFormDrawer } from "@/components/products/product-form-drawer";
import { FEED_ISSUES, FEED_STATUS, FEED_ITEM_COUNT, LAST_SYNCED_AT } from "@/lib/merchant-center";
import { PRODUCTS, type Product } from "@/lib/products";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";

export function MerchantCenterView() {
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncFrequency, setSyncFrequency] = useState("nightly");

  function handleFix(productId: string) {
    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product) return;
    setEditingProduct(product);
    setDrawerOpen(true);
  }

  function handleResync() {
    toast.success("Feed resync queued. Live sync wires up in INT-013.");
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-5 font-display text-2xl font-bold text-fg">Google Merchant Center</h1>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-whatsapp" aria-hidden />
          <div>
            <p className="text-sm font-medium text-fg">
              Feed {FEED_STATUS} — {FEED_ITEM_COUNT} products
            </p>
            <p className="text-xs text-fg-faint">Last synced {formatDate(LAST_SYNCED_AT)}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleResync}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Resync now
        </Button>
      </div>

      <div className="mb-6">
        <p className="mb-3 text-sm font-medium text-fg">Issues</p>
        {FEED_ISSUES.length === 0 ? (
          <p className="text-sm text-fg-faint">No issues — your feed is clean.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-noxtill)] border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-fg-faint">
                  <th className="px-4 py-3 text-start">Product</th>
                  <th className="px-4 py-3 text-start">Issue</th>
                  <th className="px-4 py-3 text-start" />
                </tr>
              </thead>
              <tbody>
                {FEED_ISSUES.map((issue) => {
                  const product = PRODUCTS.find((p) => p.id === issue.productId);
                  return (
                    <tr key={issue.id} className="border-b border-border last:border-0 hover:bg-surface-2/50">
                      <td className="px-4 py-3 font-medium text-fg">{product?.name ?? "Unknown product"}</td>
                      <td className="px-4 py-3">
                        <Badge tone={issue.severity === "error" ? "danger" : "warning"}>
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          {issue.issue}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-end">
                        <Button size="sm" variant="outline" onClick={() => handleFix(issue.productId)}>
                          Fix
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-[var(--radius-noxtill)] border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-medium text-fg">Settings</p>
        <Select label="Sync frequency" value={syncFrequency} onChange={(e) => setSyncFrequency(e.target.value)} className="w-48">
          <option value="nightly">Nightly</option>
          <option value="hourly">Hourly</option>
          <option value="realtime">Real-time (on product edit)</option>
        </Select>
      </div>

      <ProductFormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} product={editingProduct} />
    </div>
  );
}
