"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchDebtors, fetchStatementStats, generateStatement, sendStatement, bulkGenerateStatements, type LiveDebtor } from "@/lib/credit-api";
import { StatementDialog } from "./statement-dialog";
import { ApiError } from "@/lib/api-client";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useCreditSearchStore } from "@/store/credit-search-store";

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };
const smallPrimary: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", minHeight: 40 };

export function StatementsPanel({ currency }: { currency: string }) {
  const query = useCreditSearchStore((s) => s.query);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState<LiveDebtor | null>(null);

  const { data: debtors = [], isPending } = useQuery({ queryKey: ["debtors"], queryFn: () => fetchDebtors() });
  const { data: stats } = useQuery({ queryKey: ["credit-statement-stats", 30], queryFn: () => fetchStatementStats(30) });

  const downloadMutation = useMutation({
    mutationFn: (customerId: string) => generateStatement(customerId),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate this statement."),
  });
  const sendMutation = useMutation({
    mutationFn: (customerId: string) => sendStatement(customerId),
    onSuccess: () => toast.success("Statement sent."),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this statement."),
  });
  const bulkMutation = useMutation({
    mutationFn: (customerIds: string[]) => bulkGenerateStatements(customerIds),
    onSuccess: (results) => {
      const ok = results.filter((r) => r.url).length;
      toast.success(`Generated ${ok} of ${results.length} statement(s).`);
      results.forEach((r) => r.url && window.open(r.url, "_blank", "noopener,noreferrer"));
      setSelected([]);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't generate statements."),
  });

  const filtered = useMemo(() => {
    return debtors.filter((d) => !query || d.name.toLowerCase().includes(query.toLowerCase()) || d.phone.includes(query));
  }, [debtors, query]);

  function toggle(customerId: string) {
    setSelected((ids) => (ids.includes(customerId) ? ids.filter((i) => i !== customerId) : [...ids, customerId]));
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Statements</h2>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          {selected.length > 0 && (
            <button type="button" onClick={() => bulkMutation.mutate(selected)} disabled={bulkMutation.isPending} style={outlineBtn}>Send Selected ({selected.length})</button>
          )}
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Customers With A Balance</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{debtors.length}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Sent (last 30 days)</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{stats?.sent ?? "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Delivered</div>
          <div className="mt-1.5 text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{stats?.delivered ?? "—"}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2.5 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Customers with a balance</h3>
          <span className="text-[11px]" style={{ color: "var(--app-text-disabled)" }}>Generate a statement fresh from the live ledger — nothing is cached from a prior send.</span>
        </div>

        {!isPending && filtered.length === 0 && (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No statements to generate</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Customers with an outstanding balance show up here.</div>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex flex-col">
            {filtered.map((d, i) => (
              <div key={d.customerId} className="flex flex-wrap items-center gap-3 p-[13px_17px]" style={{ borderTop: i === 0 ? undefined : "1px solid var(--app-surface-2)" }}>
                <input type="checkbox" checked={selected.includes(d.customerId)} onChange={() => toggle(d.customerId)} aria-label={`Select ${d.name}`} style={{ width: 15, height: 15, accentColor: "var(--app-primary)" }} />
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{d.name}</p>
                  <p className="m-0 mt-0.5 text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>{formatCurrency(d.balance, currency)} outstanding</p>
                </div>
                <div className="flex shrink-0 items-center gap-[7px]">
                  <button type="button" onClick={() => setPreviewing(d)} style={smallOutline}>Preview</button>
                  <button type="button" onClick={() => sendMutation.mutate(d.customerId)} disabled={sendMutation.isPending} style={smallOutline}>Send</button>
                  <button type="button" onClick={() => downloadMutation.mutate(d.customerId)} disabled={downloadMutation.isPending} style={smallPrimary}>PDF</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <StatementDialog debtor={previewing} currency={currency} onClose={() => setPreviewing(null)} />
    </main>
  );
}
