"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { fetchStockCounts, createStockCount, applyStockCount } from "@/lib/stock-count-api";
import { fetchInventory } from "@/lib/inventory-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { useInventorySearch, useRegisterExport } from "@/components/inventory/inventory-drawer-context";
import { INV, KpiTile, KpiSkeleton, filterSelectStyle, outlineBtnStyle, primaryBtnStyle, EmptyBlock } from "@/components/inventory/inventory-ui";
import { canApplyStockCountsByDefaultRole } from "@/components/inventory/inventory-classification";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/session";

interface DraftRow {
  productId: string;
  name: string;
  category: string | null;
  system: number;
  counted: string;
  costPrice: number;
}

export function StockCountView() {
  const session = useSession();
  const currency = session.business.currency;
  const canApply = canApplyStockCountsByDefaultRole(session.user.role);
  const [category, setCategory] = useState("all");
  const [varianceOnly, setVarianceOnly] = useState(false);
  const [note, setNote] = useState("");
  const [draftRows, setDraftRows] = useState<DraftRow[] | null>(null);
  const [touchedIds, setTouchedIds] = useState<Set<string>>(new Set());
  const { query } = useInventorySearch();
  const queryClient = useQueryClient();

  const { data: items = [] } = useQuery({ queryKey: ["inventory"], queryFn: fetchInventory });
  const { data: counts = [], isPending, isError, refetch } = useQuery({ queryKey: ["stock-counts"], queryFn: () => fetchStockCounts() });

  const openDraft = counts.find((c) => c.status === "draft") ?? null;
  const mostRecent = counts[0] ?? null;

  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter((c): c is string => Boolean(c)))].sort(), [items]);

  const saveMutation = useMutation({
    mutationFn: () =>
      createStockCount({
        note: note.trim() || undefined,
        lines: (draftRows ?? []).filter((r) => r.counted !== "").map((r) => ({ productId: r.productId, countedQty: Number(r.counted) })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      toast.success("Saved as a draft — nothing changes until you apply it.");
      setDraftRows(null);
      setNote("");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't save this count — please try again."),
  });

  const applyMutation = useMutation({
    mutationFn: (id: string) => applyStockCount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-counts"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Stock count applied — real adjustments written.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't apply this count — please try again."),
  });

  function startCount() {
    setDraftRows(
      items.map((i) => ({ productId: i.id, name: i.name, category: i.category, system: i.stockQty, counted: String(i.stockQty), costPrice: i.costPrice })),
    );
    setTouchedIds(new Set());
  }

  function setCounted(productId: string, value: string) {
    setDraftRows((prev) => (prev ? prev.map((r) => (r.productId === productId ? { ...r, counted: value } : r)) : prev));
    setTouchedIds((prev) => new Set(prev).add(productId));
  }

  // Unify local (unsaved) rows and the real saved draft's lines into one shape for the sheet + KPIs.
  const sheetRows = useMemo(() => {
    if (draftRows) {
      return draftRows.map((r) => ({ productId: r.productId, name: r.name, category: r.category, system: r.system, counted: r.counted, variance: r.counted !== "" ? Number(r.counted) - r.system : 0, valueVariance: r.counted !== "" ? (Number(r.counted) - r.system) * r.costPrice : 0, editable: true }));
    }
    if (openDraft) {
      return openDraft.lines.map((l) => {
        const item = items.find((i) => i.id === l.productId);
        return { productId: l.productId, name: l.product.name, category: item?.category ?? null, system: l.expectedQty, counted: String(l.countedQty), variance: l.variance, valueVariance: l.variance * (item?.costPrice ?? 0), editable: false };
      });
    }
    return [];
  }, [draftRows, openDraft, items]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sheetRows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (varianceOnly && r.variance === 0) return false;
      if (q && !r.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sheetRows, category, varianceOnly, query]);

  const activeCount = openDraft ?? mostRecent;
  const discrepancies = sheetRows.filter((r) => r.variance !== 0).length;
  const valueVariance = sheetRows.reduce((sum, r) => sum + r.valueVariance, 0);
  // While actively building a count, "counted" means the user has touched that row — a pre-filled
  // default that matches system stock isn't a verified count yet. A saved/applied count's lines
  // were all submitted together, so every one of them counts as counted.
  const countedRows = draftRows ? touchedIds.size : sheetRows.length;
  const progress = sheetRows.length > 0 ? Math.round((countedRows / sheetRows.length) * 100) : 0;

  const categoryVariance = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const r of sheetRows) {
      const key = r.category ?? "Uncategorized";
      byCategory.set(key, (byCategory.get(key) ?? 0) + r.valueVariance);
    }
    const maxAbs = Math.max(1, ...[...byCategory.values()].map((v) => Math.abs(v)));
    return [...byCategory.entries()]
      .filter(([, v]) => v !== 0)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([cat, v]) => ({ cat, value: v, pct: Math.round((Math.abs(v) / maxAbs) * 100), color: v < 0 ? "#B42318" : "#0E8442" }));
  }, [sheetRows]);

  useRegisterExport(() => {
    const header = ["Product", "System qty", "Counted qty", "Variance", "Value variance"];
    const rows = filteredRows.map((r) => [r.name, r.system, r.counted, r.variance, r.valueVariance]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "stock-count-variance.csv";
    link.click();
    URL.revokeObjectURL(url);
  });

  if (isError) {
    return (
      <div style={{ margin: 22, background: "#fff", border: "1px solid #FDD9D6", borderRadius: 16, padding: "48px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, color: "#B42318" }}>Couldn&apos;t load stock counts</div>
        <button type="button" onClick={() => refetch()} style={{ marginTop: 15, border: 0, background: INV.primary, borderRadius: 12, padding: "12px 22px", fontSize: 13, fontWeight: 800, color: "#fff", cursor: "pointer", minHeight: 46 }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <main style={{ padding: "16px 22px 26px", display: "flex", flexDirection: "column", gap: 15 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${INV.border}`, borderRadius: 11, padding: "9px 13px", background: "#fff", minHeight: 44 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#344054" }}>Variance only</span>
          <button
            type="button"
            onClick={() => setVarianceOnly((v) => !v)}
            role="switch"
            aria-checked={varianceOnly}
            aria-label="Show variance only"
            style={{ width: 38, height: 21, border: 0, borderRadius: 20, background: varianceOnly ? INV.primary : "#E1E5EB", position: "relative", cursor: "pointer" }}
          >
            <span style={{ position: "absolute", top: 2, left: varianceOnly ? 19 : 2, width: 17, height: 17, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
          </button>
        </span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" style={filterSelectStyle}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 9, marginLeft: "auto", flexWrap: "wrap" }}>
          {draftRows && (
            <button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} style={outlineBtnStyle}>
              {saveMutation.isPending ? "Saving…" : "Save Progress"}
            </button>
          )}
          {openDraft && canApply && (
            <button type="button" onClick={() => applyMutation.mutate(openDraft.id)} disabled={applyMutation.isPending} style={outlineBtnStyle}>
              {applyMutation.isPending ? "Applying…" : "Apply Adjustments"}
            </button>
          )}
          {openDraft && !canApply && (
            <span style={{ fontSize: 12, fontWeight: 600, color: "#98A2B3", display: "flex", alignItems: "center" }}>Saved as a draft — ask the owner to apply it.</span>
          )}
          {!draftRows && !openDraft && (
            <button type="button" onClick={startCount} style={primaryBtnStyle}>
              Start Count
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14 }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <KpiTile label="Last Count" value={activeCount ? formatDate(activeCount.appliedAt ?? activeCount.createdAt) : "Never counted"} />
            <KpiTile label="Items Counted" value={String(countedRows)} meta={draftRows ? `${sheetRows.length - countedRows} remaining` : undefined} />
            <KpiTile label="Discrepancies" value={String(discrepancies)} tone={discrepancies > 0 ? "amber" : undefined} />
            <KpiTile label="Value Variance" value={formatCurrency(valueVariance, currency)} tone={valueVariance < 0 ? "red" : valueVariance > 0 ? "green" : undefined} />
          </>
        )}
      </div>

      {categoryVariance.length > 0 && (
        <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, padding: 17 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Variance by category</h3>
            <span style={{ fontSize: 11, color: "#98A2B3" }}>Negative means less on the shelf than the system expected</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {categoryVariance.map((c) => (
              <div key={c.cat}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "#344054" }}>{c.cat}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: c.color }}>{formatCurrency(c.value, currency)}</span>
                </div>
                <div style={{ height: 9, borderRadius: 6, background: "#F2F4F7", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 6, background: c.color, width: `${c.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ background: "#fff", border: `1px solid ${INV.border}`, borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "#101828" }}>Count sheet</h3>
          {sheetRows.length > 0 && (
            <>
              <span style={{ flex: 1, minWidth: 140, maxWidth: 240, height: 8, borderRadius: 6, background: "#F2F4F7", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", borderRadius: 6, background: INV.primary, width: `${progress}%` }} />
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: "#0E8442" }}>{progress}% counted</span>
            </>
          )}
        </div>
        {draftRows && (
          <div style={{ padding: "13px 17px", borderBottom: "1px solid #F0F2F5" }}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for this count (optional)" style={{ width: "100%", maxWidth: 420, border: `1px solid ${INV.border}`, borderRadius: 10, padding: 10, fontSize: 12.5 }} />
          </div>
        )}
        {filteredRows.length === 0 ? (
          <EmptyBlock icon={ClipboardCheck} iconBg="#F2F4F7" iconColor="#98A2B3" title="Run a stock count to verify your figures" description={sheetRows.length > 0 ? "Nothing matches these filters." : undefined} action={!draftRows && !openDraft ? <button type="button" onClick={startCount} style={primaryBtnStyle}>Start Count</button> : undefined} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
              <thead>
                <tr style={{ background: "#FAFBFC" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Product</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>System qty</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Counted qty</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: 10 }}>Variance</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#98A2B3", padding: "10px 17px" }}>Value variance</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const vColor = r.variance === 0 ? "#98A2B3" : r.variance > 0 ? "#0E8442" : "#B42318";
                  return (
                    <tr key={r.productId} style={{ borderTop: "1px solid #F2F4F7" }}>
                      <td style={{ padding: "11px 17px", fontSize: 12.5, fontWeight: 700, color: "#101828" }}>{r.name}</td>
                      <td style={{ padding: 11, fontSize: 12.5, color: "#98A2B3", textAlign: "right" }}>{r.system}</td>
                      <td style={{ padding: 11, textAlign: "right" }}>
                        {r.editable ? (
                          <input
                            type="number"
                            min={0}
                            value={r.counted}
                            onChange={(e) => setCounted(r.productId, e.target.value)}
                            aria-label={`Counted quantity for ${r.name}`}
                            style={{ width: 84, border: `1px solid ${INV.border}`, borderRadius: 9, padding: 9, fontSize: 13, fontWeight: 800, textAlign: "right", minHeight: 42 }}
                          />
                        ) : (
                          <span style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>{r.counted}</span>
                        )}
                      </td>
                      <td style={{ padding: 11, fontSize: 13, fontWeight: 800, color: vColor, textAlign: "right" }}>
                        {r.variance > 0 ? "+" : ""}
                        {r.variance}
                      </td>
                      <td style={{ padding: "11px 17px", fontSize: 12.5, fontWeight: 700, color: vColor, textAlign: "right" }}>{formatCurrency(r.valueVariance, currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ padding: "11px 17px", borderTop: "1px solid #F0F2F5", fontSize: 11.5, color: "#98A2B3" }}>Nothing changes until you apply adjustments — applying writes a real adjustment movement per product that varied.</div>
      </div>
    </main>
  );
}
