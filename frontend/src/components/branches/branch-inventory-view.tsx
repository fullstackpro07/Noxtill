"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert, Clock3, CircleCheck } from "lucide-react";
import { fetchBranches } from "@/lib/branches-api";
import { fetchBranchInventory } from "@/lib/branch-scoped-api";
import type { LiveInventoryItem } from "@/lib/inventory-api";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useBranchesScope } from "@/components/branches/branches-context";
import { BR, KpiTile, KpiSkeleton, Chip, th, type Tone } from "@/components/branches/branches-ui";
import { ErrorBanner } from "@/components/shared/error-states";

interface Row extends LiveInventoryItem {
  branchId: string;
  branchName: string;
}

export function BranchInventoryView() {
  const session = useSession();
  const currency = session.business.currency;
  const { scopeBranchId } = useBranchesScope();
  const [statusFilter, setStatusFilter] = useState<"all" | "low_stock" | "out_of_stock">("all");

  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: fetchBranches });
  const scoped = scopeBranchId ? branches.filter((b) => b.id === scopeBranchId) : branches.filter((b) => b.active);

  const { data: byBranch, isPending, isError, refetch } = useQuery({
    queryKey: ["branch-inventory", scoped.map((b) => b.id).join(",")],
    queryFn: async () => {
      const entries = await Promise.all(
        scoped.map(async (b) => {
          try {
            const items = await fetchBranchInventory(b.id);
            return [b.id, items] as const;
          } catch {
            return [b.id, [] as LiveInventoryItem[]] as const;
          }
        }),
      );
      return new Map(entries);
    },
    enabled: scoped.length > 0,
  });

  const rows: Row[] = useMemo(() => {
    if (!byBranch) return [];
    const out: Row[] = [];
    for (const b of scoped) {
      for (const item of byBranch.get(b.id) ?? []) {
        out.push({ ...item, branchId: b.id, branchName: b.name });
      }
    }
    return out;
  }, [byBranch, scoped]);

  const filtered = statusFilter === "all" ? rows : rows.filter((r) => r.status === statusFilter);
  const lowStock = rows.filter((r) => r.status === "low_stock");
  const outOfStock = rows.filter((r) => r.status === "out_of_stock");
  const totalValue = rows.reduce((a, r) => a + r.stockValue, 0);
  const totalUnits = rows.reduce((a, r) => a + r.stockQty, 0);

  // Real cross-branch imbalance: same product name low/out at one branch while another branch of
  // the same group holds meaningfully more than its own low-stock threshold's worth of surplus.
  const imbalance = useMemo(() => {
    const byName = new Map<string, Row[]>();
    for (const r of rows) {
      const list = byName.get(r.name) ?? [];
      list.push(r);
      byName.set(r.name, list);
    }
    let shortBranches = 0;
    let surplusBranches = 0;
    for (const list of byName.values()) {
      const short = list.filter((r) => r.status !== "ok");
      const surplus = list.filter((r) => r.status === "ok" && r.stockQty > r.lowStockThreshold * 3);
      if (short.length > 0 && surplus.length > 0) {
        shortBranches += short.length;
        surplusBranches += surplus.length;
      }
    }
    return { shortBranches, surplusBranches };
  }, [rows]);

  if (isError) {
    return <ErrorBanner title="Couldn't load branch inventory" description="Check your connection and try again." onRetry={() => refetch()} />;
  }

  return (
    <main className="flex flex-col gap-[18px] px-6 pb-[30px] pt-[18px]">
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <KpiTile label="Inventory value" value={formatCurrency(totalValue, currency)} meta={`across ${scoped.length} branch${scoped.length === 1 ? "" : "es"}`} />
            <KpiTile label="Units" value={totalUnits.toLocaleString()} meta="on hand" />
            <KpiTile label="Low stock" value={String(lowStock.length)} tone={lowStock.length > 0 ? "amber" : undefined} meta="lines below threshold" />
            <KpiTile label="Out of stock" value={String(outOfStock.length)} tone={outOfStock.length > 0 ? "red" : undefined} meta="lines at zero" />
          </>
        )}
      </div>

      {imbalance.shortBranches > 0 && imbalance.surplusBranches > 0 && (
        <div style={{ background: "#fff", border: "1px solid #FDE3B3", borderRadius: 12, boxShadow: "0 1px 2px rgba(16,24,40,.04)", padding: "15px 17px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ width: 30, height: 30, flex: "0 0 30px", borderRadius: 9, background: "#FEF6E7", color: "#B54708", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <TriangleAlert size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>Stock imbalance across branches</div>
            <div style={{ fontSize: 11.5, color: BR.textMuted, marginTop: 3 }}>
              {imbalance.shortBranches} line{imbalance.shortBranches === 1 ? "" : "s"} are low or out of stock somewhere in the group while another branch holds real surplus of the same product. Open Transfers to move stock — nothing moves automatically.
            </div>
          </div>
        </div>
      )}

      <div style={{ background: "#fff", border: `1px solid ${BR.border}`, borderRadius: 13, boxShadow: "0 1px 2px rgba(16,24,40,.05)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Stock by branch</div>
          <div style={{ marginLeft: "auto", display: "inline-flex", padding: 3, background: "#F1F3F6", borderRadius: 10, gap: 2 }}>
            {(["all", "low_stock", "out_of_stock"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                style={{ height: 26, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: 8, fontSize: 11.5, cursor: "pointer", fontWeight: statusFilter === s ? 700 : 600, color: statusFilter === s ? BR.text : BR.textMuted, background: statusFilter === s ? "#fff" : "transparent", boxShadow: statusFilter === s ? "0 1px 2px rgba(16,24,40,.08)" : "none", border: 0 }}
              >
                {s === "all" ? "All" : s === "low_stock" ? "Low stock" : "Out of stock"}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto nx-scroll">
          <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFBFC", borderTop: "1px solid #F0F2F5", borderBottom: `1px solid ${BR.border}` }}>
                <th style={th("left")}>Product</th>
                <th style={th("left")}>Branch</th>
                <th style={th("center")}>Stock</th>
                <th style={th("right")}>Stock value</th>
                <th style={th("left")}>Status</th>
              </tr>
            </thead>
            <tbody>
              {isPending ? (
                <tr>
                  <td colSpan={5} style={{ padding: 24, textAlign: "center", color: BR.textFaint, fontSize: 12.5 }}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 24, textAlign: "center", color: BR.textFaint, fontSize: 12.5 }}>
                    Nothing matches this filter.
                  </td>
                </tr>
              ) : (
                filtered
                  .sort((x, y) => (x.status === y.status ? 0 : x.status === "out_of_stock" ? -1 : y.status === "out_of_stock" ? 1 : x.status === "low_stock" ? -1 : 1))
                  .slice(0, 300)
                  .map((r) => {
                    const tone: Tone = r.status === "out_of_stock" ? "red" : r.status === "low_stock" ? "amber" : "green";
                    return (
                      <tr key={`${r.branchId}-${r.id}`} style={{ borderBottom: "1px solid #F3F4F7", background: tone === "red" ? "#FEFBFB" : tone === "amber" ? "#FFFDF5" : "#fff" }}>
                        <td style={{ padding: "11px 12px 11px 18px", fontSize: 12.5, fontWeight: 700 }}>{r.name}</td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: "#45505F" }}>{r.branchName}</td>
                        <td style={{ padding: "11px 12px", textAlign: "center", fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{r.stockQty}</td>
                        <td style={{ padding: "11px 12px", textAlign: "right", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{formatCurrency(r.stockValue, currency)}</td>
                        <td style={{ padding: "11px 18px 11px 12px" }}>
                          <Chip tone={tone} style={{ height: 21, fontSize: 10 }}>
                            {r.status === "out_of_stock" ? <TriangleAlert size={11} /> : r.status === "low_stock" ? <Clock3 size={11} /> : <CircleCheck size={11} />}
                            <span>{r.status === "out_of_stock" ? "Out of stock" : r.status === "low_stock" ? "Low stock" : "OK"}</span>
                          </Chip>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid #F0F2F5", background: "#FCFCFD", fontSize: 11, color: BR.textFaint }}>
          Stock quantities are read from Inventory, which owns them. Branches shows the location view and requests movements — it never adjusts stock directly.
        </div>
      </div>
    </main>
  );
}
