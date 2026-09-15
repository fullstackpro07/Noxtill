"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, Send, Receipt as ReceiptIcon } from "lucide-react";
import { useSession } from "@/lib/session";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { fetchReceiptStats, fetchReceipts, resendReceipt, type LiveReceiptRow } from "@/lib/receipts-api";
import { useOrdersSearchStore } from "@/store/orders-search-store";
import { PosModalShell } from "@/components/pos/pos-modal-shell";

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };

export function ReceiptsView() {
  const session = useSession();
  const queryClient = useQueryClient();
  const query = useOrdersSearchStore((s) => s.query);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);

  const { data: stats } = useQuery({ queryKey: ["receipt-stats"], queryFn: fetchReceiptStats });
  const { data: rows } = useQuery({ queryKey: ["receipts", query], queryFn: () => fetchReceipts({ q: query.trim() || undefined }) });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["receipts"] });
    queryClient.invalidateQueries({ queryKey: ["receipt-stats"] });
  }

  const resendMutation = useMutation({
    mutationFn: ({ id, channel }: { id: string; channel: "digital" | "print" }) => resendReceipt(id, channel),
    onSuccess: (result, { channel }) => {
      invalidate();
      if (channel === "print") window.open(result.url, "_blank", "noopener,noreferrer");
      else toast.success("Receipt resent to the customer.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't resend this receipt — please try again."),
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      const results = await Promise.allSettled(ids.map((id) => resendReceipt(id, "digital")));
      return results.filter((r) => r.status === "fulfilled").length;
    },
    onSuccess: (count) => {
      invalidate();
      toast.success(`Resent ${count} receipt(s).`);
      setSelected(new Set());
      setConfirmBulk(false);
    },
  });

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Receipts</h2>
        <span className="text-[11.5px]" style={{ color: "var(--app-text-disabled)" }}>Search by order number or phone in the header search</span>
        {selected.size > 0 && (
          <button type="button" onClick={() => setConfirmBulk(true)} className="ms-auto" style={outlineBtn}>Resend {selected.size} selected</button>
        )}
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Sent Digitally (30d)</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{stats?.digitalCount ?? "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Printed (30d)</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{stats?.printedCount ?? "—"}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>% Digital</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{stats ? `${stats.digitalPercent}%` : "—"}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {rows && rows.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[14px]" style={{ background: "var(--app-surface-2)" }}>
              <ReceiptIcon className="h-[23px] w-[23px]" style={{ color: "var(--app-text-disabled)" }} aria-hidden />
            </div>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>{query ? "No matching sales" : "No receipts today"}</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Receipts appear here the moment a sale completes.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 820 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="w-[34px] p-[10px_0_10px_17px]" />
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Order #</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Amount</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Last Sent</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(rows ?? []).map((row) => (
                  <ReceiptRow
                    key={row.id}
                    row={row}
                    currency={session.business.currency}
                    checked={selected.has(row.id)}
                    onToggle={() => toggleRow(row.id)}
                    onResend={(channel) => resendMutation.mutate({ id: row.id, channel })}
                    busy={resendMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PosModalShell
        open={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        title="Bulk Resend"
        footer={
          <>
            <button type="button" onClick={() => setConfirmBulk(false)} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => bulkMutation.mutate()} disabled={bulkMutation.isPending} style={{ ...primaryBtn, opacity: bulkMutation.isPending ? 0.6 : 1 }}>
              {bulkMutation.isPending ? "Sending…" : "Resend"}
            </button>
          </>
        }
      >
        <p className="m-0 p-[17px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>Each customer gets a fresh digital copy of their receipt.</p>
      </PosModalShell>
    </main>
  );
}

function ReceiptRow({
  row,
  currency,
  checked,
  onToggle,
  onResend,
  busy,
}: {
  row: LiveReceiptRow;
  currency: string;
  checked: boolean;
  onToggle: () => void;
  onResend: (channel: "digital" | "print") => void;
  busy: boolean;
}) {
  return (
    <tr style={{ borderTop: "1px solid var(--app-border-strong)" }}>
      <td className="p-[12px_0_12px_17px]"><input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select order #${row.orderNo}`} style={{ accentColor: "var(--app-primary)" }} /></td>
      <td className="p-[12px] text-[12.5px] font-extrabold" style={{ color: "var(--app-success-text)" }}>#{row.orderNo}</td>
      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>
        {row.customerName ?? "Walk-in"}
        {row.customerPhone && <span style={{ color: "var(--app-text-disabled)" }}> · {row.customerPhone}</span>}
      </td>
      <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(row.total, currency)}</td>
      <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>
        {row.lastSentAt ? (
          <span className="inline-flex items-center gap-1.5">
            {formatDate(row.lastSentAt)} {formatTime(row.lastSentAt)}
            <span className="rounded-full px-[8px] py-[2px] text-[10px] font-bold" style={{ background: row.lastChannel === "digital" ? "var(--app-success-bg)" : "var(--app-surface-2)", color: row.lastChannel === "digital" ? "var(--app-success-text)" : "var(--app-text-faint)" }}>{row.lastChannel}</span>
          </span>
        ) : (
          "Never sent"
        )}
      </td>
      <td className="p-[12px_17px] text-end">
        <span className="inline-flex gap-1.5">
          <button type="button" onClick={() => onResend("print")} disabled={busy} aria-label="Reprint" className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-faint)" }}>
            <Printer className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={() => onResend("digital")} disabled={busy} aria-label="Resend" className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[9px] text-white" style={{ background: "var(--app-primary)" }}>
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </span>
      </td>
    </tr>
  );
}
