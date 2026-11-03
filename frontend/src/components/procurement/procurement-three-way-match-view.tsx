"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { Btn, Card, Empty, Kpi, Notice, Page, StatusBadge, errorText, formatDate, money } from "@/components/website/website-ui";
import { fetchProcurementThreeWayMatch } from "@/lib/procurement-api";
import { useSession } from "@/lib/session";

type MatchFilter = "all" | "awaiting" | "received";

export function ProcurementThreeWayMatchView() {
  const session = useSession();
  const [filter, setFilter] = useState<MatchFilter>("all");
  const query = useQuery({
    queryKey: ["procurement", "three-way-match"],
    queryFn: fetchProcurementThreeWayMatch,
  });
  const orders = useMemo(() => {
    const rows = query.data?.purchaseOrders ?? [];
    if (filter === "awaiting") return rows.filter((row) => row.receiptStatus !== "received");
    if (filter === "received") return rows.filter((row) => row.receiptStatus === "received");
    return rows;
  }, [filter, query.data?.purchaseOrders]);

  useModuleHeader({
    title: "3-Way Match",
    subtitle: "Compare purchase orders with recorded goods receipts; invoice matching needs Finance/AP",
    actions: (
      <Btn onClick={() => void query.refetch()} disabled={query.isFetching}>
        <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} aria-hidden />
        Refresh
      </Btn>
    ),
  });

  return (
    <Page>
      <Notice tone="warn">
        {query.data?.invoiceDetail ?? "Vendor bills are not recorded in this workspace, so invoice comparison and 3-way match results are not available."}
      </Notice>
      {query.isPending ? (
        <p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading purchase orders…</p>
      ) : query.isError || !query.data ? (
        <Notice tone="danger">{errorText(query.error, "Couldn't load purchase-order receipt data.")}</Notice>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Purchase orders" value={query.data.summary.purchaseOrders} hint="Non-cancelled records" />
            <Kpi label="Awaiting receipt" value={query.data.summary.awaitingReceipt} hint="At least one ordered line remains outstanding" />
            <Kpi label="Fully received" value={query.data.summary.fullyReceived} hint="All recorded PO lines received" />
          </div>

          <Card title="Recorded order and receipt quantities" actions={
            <select
              aria-label="Filter receipt status"
              className="rounded-lg border px-2 py-1 text-xs"
              style={{ borderColor: "var(--app-border)", background: "var(--app-bg)", color: "var(--app-text)" }}
              value={filter}
              onChange={(event) => setFilter(event.target.value as MatchFilter)}
            >
              <option value="all">All purchase orders</option>
              <option value="awaiting">Awaiting receipt</option>
              <option value="received">Fully received</option>
            </select>
          }>
            {orders.length === 0 ? (
              <Empty>{filter === "all" ? "No purchase orders are recorded." : "No purchase orders match this receipt filter."}</Empty>
            ) : (
              <div className="flex flex-col gap-3">
                {orders.map((order) => (
                  <article key={order.id} className="rounded-xl border p-3" style={{ borderColor: "var(--app-border)" }}>
                    <header className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="m-0 font-semibold">{order.reference} · {order.supplier.name}</p>
                        <p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Created {formatDate(order.createdAt)} · PO status <StatusBadge status={order.status} /></p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span>Receipt: <StatusBadge status={order.receiptStatus} label={order.receiptStatus.replaceAll("_", " ")} /></span>
                        <Link href="/inventory/purchases" className="inline-flex items-center gap-1 text-[var(--app-primary)] hover:underline">
                          Open in Inventory <ArrowUpRight className="h-3 w-3" aria-hidden />
                        </Link>
                      </div>
                    </header>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[620px] text-left text-xs">
                        <thead style={{ color: "var(--app-text-faint)" }}><tr><th className="py-1 pr-2">Item</th><th className="py-1 pr-2">PO quantity</th><th className="py-1 pr-2">Received</th><th className="py-1 pr-2">Outstanding</th><th className="py-1 pr-2">PO unit cost</th><th className="py-1">Vendor bill</th></tr></thead>
                        <tbody>
                          {order.items.map((item) => (
                            <tr key={item.id} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                              <td className="py-2 pr-2">{item.product.name}{item.product.sku ? <span className="ml-1" style={{ color: "var(--app-text-faint)" }}>({item.product.sku})</span> : null}</td>
                              <td className="py-2 pr-2">{item.qtyOrdered}</td>
                              <td className="py-2 pr-2">{item.qtyReceived}</td>
                              <td className="py-2 pr-2">{item.outstanding}</td>
                              <td className="py-2 pr-2">{money(item.unitCost, session.business.currency || "USD")}</td>
                              <td className="py-2" style={{ color: "var(--app-text-faint)" }}>Not available</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
                      Match result: Not available without a recorded supplier invoice. Receiving remains in Inventory → Purchases.
                    </p>
                  </article>
                ))}
              </div>
            )}
          </Card>
          <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
            Showing up to the latest {query.data.listLimit} non-cancelled purchase orders. Receipt data comes from recorded Inventory receipts, not an inferred invoice match.
          </p>
        </>
      )}
    </Page>
  );
}
