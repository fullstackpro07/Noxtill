"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
import { fetchStaffList } from "@/lib/staff-api";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { convertDraftOrder, deleteDraftOrder, fetchDraftOrders } from "@/lib/draft-orders-api";
import type { LiveOrder } from "@/lib/orders-api";
import { PosModalShell } from "@/components/pos/pos-modal-shell";

type PaymentMethod = "cash" | "card" | "online" | "credit";
const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "online", label: "Online" },
  { key: "credit", label: "Credit" },
];
const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const cancelBtn: React.CSSProperties = { background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" };
const primaryBtn: React.CSSProperties = { background: "var(--app-primary)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };
const dangerBtn: React.CSSProperties = { background: "var(--app-danger-strong)", border: 0, borderRadius: 11, padding: "11px 20px", fontSize: 12.5, fontWeight: 800, color: "#fff" };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60_000;

export function DraftOrdersPanel() {
  const session = useSession();
  const now = useNow(60_000);
  const queryClient = useQueryClient();
  const [staffFilter, setStaffFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [converting, setConverting] = useState<LiveOrder | null>(null);
  const [deleting, setDeleting] = useState<LiveOrder | null>(null);
  const [deleteOldOpen, setDeleteOldOpen] = useState(false);

  const { data: drafts } = useQuery({ queryKey: ["draft-orders"], queryFn: fetchDraftOrders });
  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: () => fetchStaffList(), staleTime: 5 * 60_000 });

  const filtered = useMemo(() => {
    if (!drafts) return [];
    return drafts.filter((d) => {
      if (staffFilter !== "all" && d.staffName !== staff?.find((s) => s.userId === staffFilter)?.name) return false;
      if (dateFilter && d.createdAt.slice(0, 10) !== dateFilter) return false;
      return true;
    });
  }, [drafts, staffFilter, dateFilter, staff]);

  const oldDrafts = useMemo(() => (drafts ?? []).filter((d) => now - new Date(d.createdAt).getTime() > SEVEN_DAYS_MS), [drafts, now]);
  const draftValue = (drafts ?? []).reduce((sum, d) => sum + d.total, 0);
  const oldest = (drafts ?? []).reduce<string | null>((min, d) => (min == null || d.createdAt < min ? d.createdAt : min), null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDraftOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
      toast.success("Draft deleted.");
      setDeleting(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't delete this draft — please try again."),
  });

  const deleteOldMutation = useMutation({
    mutationFn: async () => {
      const results = await Promise.allSettled(oldDrafts.map((d) => deleteDraftOrder(d.id)));
      return results.filter((r) => r.status === "fulfilled").length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
      toast.success(count > 0 ? `Deleted ${count} draft(s) older than 7 days.` : "No drafts older than 7 days.");
      setDeleteOldOpen(false);
    },
  });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>Drafts</h2>
        <span className="rounded-full px-[11px] py-[3px] text-[12px] font-extrabold" style={{ color: "var(--app-success-text)", background: "var(--app-success-bg)" }}>{drafts?.length ?? 0}</span>
        <button type="button" onClick={() => setDeleteOldOpen(true)} className="ms-auto rounded-[11px] px-[15px] py-[11px] text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)", minHeight: 44 }}>
          Delete All Older Than 7 Days
        </button>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Draft Count</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{drafts?.length ?? 0}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Total Value</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(draftValue, session.business.currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>Oldest Draft</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{oldest ? formatRelativeTime(now - new Date(oldest).getTime()) : "—"}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          {staff && staff.length > 0 && (
            <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Staff" style={selectStyle}>
              <option value="all">All staff</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>{s.name}</option>
              ))}
            </select>
          )}
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Date" style={selectStyle} />
        </div>

        {drafts && filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No drafts</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Start an order and save it as a draft to park it here.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 720 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Draft #</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Items</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Value</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Created By</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Age</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="p-[12px_17px] text-[12.5px] font-extrabold" style={{ color: "var(--app-success-text)" }}>#{d.orderNo}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{d.customerName}</td>
                    <td className="p-[12px] text-end text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{d.items.reduce((n, i) => n + i.qty, 0)}</td>
                    <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(d.total, session.business.currency)}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{d.staffName ?? "—"}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>{formatRelativeTime(now - new Date(d.createdAt).getTime())}</td>
                    <td className="p-[12px_17px] text-end">
                      <span className="inline-flex gap-2">
                        <button type="button" onClick={() => setDeleting(d)} style={{ border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-faintest)", minHeight: 40 }}>Delete</button>
                        <button type="button" onClick={() => setConverting(d)} style={{ border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 800, color: "#fff", minHeight: 40 }}>Convert</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConvertDraftModal draft={converting} onClose={() => setConverting(null)} currency={session.business.currency} />

      <PosModalShell
        open={deleting != null}
        onClose={() => setDeleting(null)}
        title="Delete Draft"
        footer={
          <>
            <button type="button" onClick={() => setDeleting(null)} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => deleting && deleteMutation.mutate(deleting.id)} disabled={deleteMutation.isPending} style={{ ...dangerBtn, opacity: deleteMutation.isPending ? 0.6 : 1 }}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </button>
          </>
        }
      >
        <p className="m-0 p-[17px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>This can&apos;t be undone — the draft order is cancelled permanently.</p>
      </PosModalShell>

      <PosModalShell
        open={deleteOldOpen}
        onClose={() => setDeleteOldOpen(false)}
        title="Delete Old Drafts"
        footer={
          <>
            <button type="button" onClick={() => setDeleteOldOpen(false)} style={cancelBtn}>Cancel</button>
            <button type="button" onClick={() => deleteOldMutation.mutate()} disabled={deleteOldMutation.isPending} style={{ ...dangerBtn, opacity: deleteOldMutation.isPending ? 0.6 : 1 }}>
              {deleteOldMutation.isPending ? "Deleting…" : "Discard them"}
            </button>
          </>
        }
      >
        <p className="m-0 p-[17px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
          {oldDrafts.length} draft(s) from more than 7 days ago will be permanently deleted. Newer drafts are untouched.
        </p>
      </PosModalShell>
    </main>
  );
}

function ConvertDraftModal({ draft, onClose, currency }: { draft: LiveOrder | null; onClose: () => void; currency: string }) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => convertDraftOrder(id, method),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["draft-orders"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`Sale #${order.orderNo} recorded — ${formatCurrency(order.total, currency)} via ${method}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't convert this draft — please try again."),
  });

  return (
    <PosModalShell
      open={draft != null}
      onClose={onClose}
      title="Convert Draft"
      footer={
        <>
          <button type="button" onClick={onClose} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={() => draft && mutation.mutate(draft.id)} disabled={mutation.isPending} style={{ ...primaryBtn, opacity: mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Confirming…" : "Confirm Sale"}
          </button>
        </>
      }
    >
      {draft && (
        <div className="flex flex-col gap-3.5 p-[17px]">
          <div className="flex items-baseline gap-2.5 rounded-[13px] p-[14px]" style={{ background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)" }}>
            <span className="text-[12.5px] font-bold" style={{ color: "var(--app-success-text)" }}>Total due</span>
            <span className="ms-auto text-[22px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(draft.total, currency)}</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMethod(m.key)}
                className="rounded-[9px] p-[9px_4px] text-[12px] font-bold"
                style={{
                  border: `1px solid ${method === m.key ? "var(--app-primary)" : "var(--app-border)"}`,
                  background: method === m.key ? "var(--app-success-bg)" : "var(--app-surface)",
                  color: method === m.key ? "var(--app-success-text)" : "var(--app-text-muted)",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </PosModalShell>
  );
}
