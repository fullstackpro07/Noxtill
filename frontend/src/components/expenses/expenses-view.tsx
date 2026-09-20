"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AddExpenseDialog } from "./add-expense-drawer";
import { EditExpenseDialog } from "./edit-expense-dialog";
import { ScanReceiptDialog } from "./scan-receipt-dialog";
import { EXPENSE_CATEGORIES, CATEGORY_CHART_SLOT, totalsByCategory } from "@/lib/expenses";
import { fetchExpenses, deleteExpense, type LiveExpense } from "@/lib/expenses-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

function recentMonths(count = 6): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
    return { value, label };
  });
}

function priorMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function bars(vals: number[], max: number, W: number, PH: number, T: number) {
  const slot = (W - 44) / Math.max(1, vals.length);
  return vals.map((v, i) => ({
    x: +(34 + i * slot + slot * 0.18).toFixed(1),
    w: +(slot * 0.62).toFixed(1),
    h: +((v / max) * PH).toFixed(1),
    y: +(T + PH - (v / max) * PH).toFixed(1),
    cx: +(34 + i * slot + slot / 2).toFixed(1),
  }));
}

const RECURRING_FILTERS = ["All expenses", "Recurring only", "One-off only"] as const;

const selectStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  color: "var(--app-text-muted)",
  borderRadius: 11,
  padding: "10px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  minHeight: 44,
};

const outlineBtnStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  borderRadius: 11,
  padding: "11px 15px",
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--app-text-muted)",
  minHeight: 44,
};

function handleFakeOption(value: string): boolean {
  if (value.indexOf("+ Add") === 0) {
    toast.info("Custom option builder — not available yet.");
    return true;
  }
  return false;
}

export function ExpensesView() {
  const session = useSession();
  const currency = session.business.currency;
  const months = useMemo(() => recentMonths(), []);
  const [month, setMonth] = useState(months[0].value);
  const [category, setCategory] = useState("All categories");
  const [recurringFilter, setRecurringFilter] = useState<(typeof RECURRING_FILTERS)[number]>("All expenses");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [editing, setEditing] = useState<LiveExpense | null>(null);
  const [deleting, setDeleting] = useState<LiveExpense | null>(null);
  const queryClient = useQueryClient();

  const { data: expenses = [], isPending, isError, refetch } = useQuery({ queryKey: ["expenses", month], queryFn: () => fetchExpenses(month) });
  const { data: lastMonthExpenses } = useQuery({ queryKey: ["expenses", priorMonth(month)], queryFn: () => fetchExpenses(priorMonth(month)) });

  const trendMonths = useMemo(() => [...months].reverse(), [months]);
  const trendQueries = useQueries({
    queries: trendMonths.map((m) => ({ queryKey: ["expenses", m.value], queryFn: () => fetchExpenses(m.value) })),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense removed.");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't remove this expense — please try again."),
  });

  const filtered = expenses.filter((e) => {
    if (category !== "All categories" && e.category !== category) return false;
    if (recurringFilter === "Recurring only" && !e.recurring) return false;
    if (recurringFilter === "One-off only" && e.recurring) return false;
    if (minAmount && e.amount < Number(minAmount)) return false;
    if (maxAmount && e.amount > Number(maxAmount)) return false;
    return true;
  });

  const totals = totalsByCategory(expenses);
  const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);
  const recurringTotal = expenses.filter((e) => e.recurring).reduce((sum, e) => sum + e.amount, 0);
  const oneOffTotal = grandTotal - recurringTotal;
  const largestCategory = totals.length ? [...totals].sort((a, b) => b.total - a.total)[0] : null;
  const lastMonthTotal = lastMonthExpenses?.reduce((sum, e) => sum + e.amount, 0) ?? null;
  const vsLastMonthPct = lastMonthTotal != null && lastMonthTotal > 0 ? Math.round(((grandTotal - lastMonthTotal) / lastMonthTotal) * 100) : null;

  const trendVals = trendQueries.map((q) => (q.data ?? []).reduce((sum, e) => sum + e.amount, 0));
  const trendReady = trendQueries.every((q) => q.data);
  const trendMax = Math.max(1, ...trendVals);
  const trendBars = bars(trendVals, trendMax, 620, 96, 10).map((b, i) => ({
    ...b,
    m: new Date(`${trendMonths[i].value}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
  }));

  function exportCsv() {
    const header = ["Date", "Category", "Description", "Amount", "Recurring"];
    const lines = [header, ...filtered.map((e) => [formatDate(e.incurredOn), e.category, e.description, e.amount, e.recurring ? "Yes" : "No"])];
    const csv = lines.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "expenses.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Couldn&apos;t load expenses</p>
        <button type="button" onClick={() => refetch()} className="mt-3 rounded-[12px] px-5 py-2.5 text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>Retry</button>
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        <select
          value={month}
          onChange={(e) => { if (handleFakeOption(e.target.value)) return; setMonth(e.target.value); }}
          aria-label="Month"
          style={selectStyle}
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
          <option>+ Add your own…</option>
        </select>
        <select
          value={category}
          onChange={(e) => { if (handleFakeOption(e.target.value)) return; setCategory(e.target.value); }}
          aria-label="Category"
          style={selectStyle}
        >
          <option>All categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
          <option>+ Add custom…</option>
        </select>
        <select value={recurringFilter} onChange={(e) => setRecurringFilter(e.target.value as (typeof RECURRING_FILTERS)[number])} aria-label="Recurring" style={selectStyle}>
          {RECURRING_FILTERS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <span className="flex items-center gap-1.5">
          <input type="number" placeholder="Min" aria-label="Minimum amount" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} className="w-[88px] rounded-[11px] text-[12.5px]" style={{ border: "1px solid var(--app-border)", padding: 10, minHeight: 44 }} />
          <span style={{ color: "var(--app-text-disabled)", fontSize: 12 }}>–</span>
          <input type="number" placeholder="Max" aria-label="Maximum amount" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} className="w-[88px] rounded-[11px] text-[12.5px]" style={{ border: "1px solid var(--app-border)", padding: 10, minHeight: 44 }} />
        </span>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => toast.info("Importing expenses from a file — not available yet.")} style={outlineBtnStyle}>Import</button>
          <button type="button" onClick={exportCsv} style={outlineBtnStyle}>Export</button>
          <button type="button" onClick={() => setScanOpen(true)} className="flex items-center gap-1.5" style={outlineBtnStyle}>
            <Camera className="h-3.5 w-3.5" aria-hidden />
            Photograph Receipt
          </button>
          <button type="button" onClick={() => setAddOpen(true)} className="flex items-center gap-1.5 rounded-[11px] text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: "11px 18px", minHeight: 44 }}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add Expense
          </button>
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))" }}>
        {isPending ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[86px] animate-pulse rounded-[14px]" style={{ background: "var(--app-surface-2)" }} />)
        ) : (
          <>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDE3B3" }}>
              <div className="text-[12px] font-bold" style={{ color: "#B54708" }}>Total This Month</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(grandTotal, currency)}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Recurring</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(recurringTotal, currency)}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>One-Off</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(oneOffTotal, currency)}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>Largest Category</div>
              <div className="mt-2 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>{largestCategory?.category ?? "—"}</div>
            </div>
            <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
              <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faint)" }}>vs Last Month</div>
              <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "#B54708" }}>{vsLastMonthPct == null ? "—" : `${vsLastMonthPct > 0 ? "+" : ""}${vsLastMonthPct}%`}</div>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-[15px]" style={{ gridTemplateColumns: "340px minmax(0,1fr)", alignItems: "start" }}>
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>By category</h3>
          {totals.length === 0 ? (
            <p className="m-0 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>No expenses this month.</p>
          ) : (
            <div className="flex flex-col gap-[11px]">
              {totals.map((c) => (
                <div key={c.category}>
                  <div className="mb-[5px] flex justify-between">
                    <span className="flex items-center gap-[7px] text-[12.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
                      <span className="h-2 w-2 rounded-[2px]" style={{ background: CATEGORY_CHART_SLOT[c.category] }} />
                      {c.category}
                    </span>
                    <span className="text-[11.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(c.total, currency)}</span>
                  </div>
                  <div className="h-[9px] overflow-hidden rounded-[6px]" style={{ background: "var(--app-surface-2)" }}>
                    <div className="h-full rounded-[6px]" style={{ width: `${(c.total / grandTotal) * 100}%`, background: CATEGORY_CHART_SLOT[c.category] }} />
                  </div>
                  <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>{((c.total / grandTotal) * 100).toFixed(0)}% of total</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="min-w-0 rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-1.5 text-[14.5px] font-extrabold" style={{ color: "var(--app-text)" }}>Monthly trend</h3>
          {!trendReady ? (
            <div className="flex h-[100px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Loading…</div>
          ) : (
            <svg viewBox="0 0 620 122" style={{ width: "100%", height: 122, display: "block" }}>
              {trendBars.map((b, i) => (
                <g key={i}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={5} fill="#FEC84B" />
                  <text x={b.cx} y={116} textAnchor="middle" fontSize={10.5} fill="#667085" fontWeight={600}>{b.m}</text>
                </g>
              ))}
            </svg>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {!isPending && filtered.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Add your rent and salaries so profit figures are accurate</div>
            <button type="button" onClick={() => setAddOpen(true)} className="mt-[15px] rounded-[12px] text-[13px] font-extrabold text-white" style={{ background: "var(--app-primary)", padding: "12px 22px", minHeight: 46 }}>Add Expense</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 860 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Date</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Category</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Description</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Amount</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Recurring</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Receipt</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isPending
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                        <td colSpan={7} style={{ padding: 14 }}><div className="h-4 animate-pulse rounded" style={{ background: "var(--app-surface-2)" }} /></td>
                      </tr>
                    ))
                  : filtered.map((e) => (
                      <tr key={e.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                        <td style={{ padding: "11px 17px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", whiteSpace: "nowrap" }}>{formatDate(e.incurredOn)}</td>
                        <td style={{ padding: 11, fontSize: 12.5, color: "var(--app-text-faint)" }}>{e.category}</td>
                        <td style={{ padding: 11, fontSize: 12.5, color: "var(--app-text-faint)" }}>{e.description}</td>
                        <td style={{ padding: 11, fontSize: 12.5, fontWeight: 800, color: "var(--app-text)", textAlign: "right" }}>{formatCurrency(e.amount, currency)}</td>
                        <td style={{ padding: 11 }}>
                          <span className="rounded-full text-[10.5px] font-bold" style={{ padding: "3px 9px", background: e.recurring ? "#E8F7EE" : "var(--app-surface-2)", color: e.recurring ? "#0E8442" : "var(--app-text-faint)" }}>
                            {e.recurring ? "Recurring" : "One-off"}
                          </span>
                        </td>
                        <td style={{ padding: 11, fontSize: 11.5, fontWeight: 700 }}>
                          {e.receiptUrl ? (
                            <a href={e.receiptUrl} target="_blank" rel="noreferrer" style={{ color: "#0E8442" }}>View</a>
                          ) : (
                            <span style={{ color: "var(--app-text-disabled)" }}>None</span>
                          )}
                        </td>
                        <td style={{ padding: "11px 17px", textAlign: "right" }}>
                          <span className="inline-flex gap-1.5">
                            <button
                              type="button"
                              aria-label="Edit expense"
                              onClick={() => setEditing(e)}
                              className="rounded-[9px]"
                              style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "8px 10px", minHeight: 40 }}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label="Delete expense"
                              onClick={() => setDeleting(e)}
                              className="rounded-[9px]"
                              style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", color: "var(--app-text-muted)", padding: "8px 10px", minHeight: 40 }}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          </span>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-end">
        <Link href="/profit" className="text-[12.5px] font-bold" style={{ color: "var(--app-primary)" }}>View profit & loss →</Link>
      </div>

      <AddExpenseDialog open={addOpen} onClose={() => setAddOpen(false)} month={month} />
      <ScanReceiptDialog open={scanOpen} onClose={() => setScanOpen(false)} />
      {editing && <EditExpenseDialog expense={editing} onClose={() => setEditing(null)} />}

      <Dialog
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title={deleting ? `Remove "${deleting.description}"?` : "Remove expense"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleting && deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Removing…" : "Remove"}
            </Button>
          </>
        }
      />
    </main>
  );
}
