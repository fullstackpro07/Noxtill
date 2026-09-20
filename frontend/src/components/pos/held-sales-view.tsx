"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { PauseCircle, Wallet2, Clock3 } from "lucide-react";
import { useSession } from "@/lib/session";
import { fetchStaffList } from "@/lib/staff-api";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { discardHeldSale, discardOldHeldSales, fetchHeldSales, resumeHeldSale, type LiveHeldSale } from "@/lib/held-sales-api";
import { PosModalShell } from "./pos-modal-shell";

const btnOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const btnPrimary: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const btnDanger: React.CSSProperties = { ...btnPrimary, background: "var(--app-danger-strong)" };
const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 13px", fontSize: 12, fontWeight: 700, color: "var(--app-text-faintest)", minHeight: 40 };
const smallPrimary: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 15px", fontSize: 12, fontWeight: 800, color: "#fff", minHeight: 40 };

type PaymentMethod = "cash" | "card" | "online" | "credit";
const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: "cash", label: "Cash" },
  { key: "card", label: "Card" },
  { key: "online", label: "Online" },
  { key: "credit", label: "Credit" },
];

function StatCard({ icon, tint, label, value }: { icon: React.ReactNode; tint: string; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: tint }}>
        {icon}
      </span>
      <span>
        <span className="block text-[12px] font-semibold" style={{ color: "var(--app-text-faintest)" }}>{label}</span>
        <span className="block text-[22px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>{value}</span>
      </span>
    </div>
  );
}

/** Held Sales, pixel-matched to the design. "Reference" shows the hold's real free-text note (set
 * from the New Sale screen's Hold modal) — the design's demo `h.ref` sequence numbers don't exist
 * as a real field, so the honest equivalent is the note the cashier actually wrote down. */
export function HeldSalesView() {
  const session = useSession();
  const queryClient = useQueryClient();
  const now = useNow(60_000);
  const [staffFilter, setStaffFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [resuming, setResuming] = useState<LiveHeldSale | null>(null);
  const [discarding, setDiscarding] = useState<LiveHeldSale | null>(null);
  const [discardAllOpen, setDiscardAllOpen] = useState(false);

  const { data: holds } = useQuery({ queryKey: ["held-sales"], queryFn: fetchHeldSales, refetchInterval: 60_000 });
  const { data: staff } = useQuery({ queryKey: ["staff-roster"], queryFn: () => fetchStaffList(), staleTime: 5 * 60 * 1000 });
  const staffNameByUserId = useMemo(() => new Map((staff ?? []).map((s) => [s.userId, s.name])), [staff]);

  const filtered = useMemo(() => {
    if (!holds) return [];
    return holds.filter((h) => {
      if (staffFilter !== "all" && h.heldByUserId !== staffFilter) return false;
      if (dateFilter && h.createdAt.slice(0, 10) !== dateFilter) return false;
      return true;
    });
  }, [holds, staffFilter, dateFilter]);

  const heldCount = holds?.length ?? 0;
  const heldValue = (holds ?? []).reduce((sum, h) => sum + h.estimatedTotal, 0);
  const oldest = (holds ?? []).reduce<string | null>((min, h) => (min == null || h.createdAt < min ? h.createdAt : min), null);

  const discardMutation = useMutation({
    mutationFn: discardHeldSale,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["held-sales"] });
      toast.success("Held sale discarded.");
      setDiscarding(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't discard this hold — please try again."),
  });

  const discardAllMutation = useMutation({
    mutationFn: discardOldHeldSales,
    onSuccess: ({ count }) => {
      queryClient.invalidateQueries({ queryKey: ["held-sales"] });
      toast.success(count > 0 ? `Discarded ${count} hold(s) from before today.` : "No holds from before today.");
      setDiscardAllOpen(false);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't discard old holds — please try again."),
  });

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <h2 className="m-0 text-[20px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>Held Sales</h2>
          <span className="rounded-full px-[11px] py-[3px] text-[12px] font-extrabold" style={{ color: "var(--app-success-text)", background: "var(--app-success-bg)" }}>{heldCount}</span>
        </div>
        <div className="ms-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={() => setDiscardAllOpen(true)} style={btnOutline}>Discard all older than today</button>
          <Link href="/sales" style={btnPrimary} className="inline-flex items-center">New Sale</Link>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
        <StatCard
          icon={<PauseCircle className="h-[18px] w-[18px]" style={{ color: "var(--app-primary)" }} aria-hidden />}
          tint="var(--app-success-bg)"
          label="Held Sales"
          value={heldCount}
        />
        <StatCard
          icon={<Wallet2 className="h-[18px] w-[18px]" style={{ color: "#3538CD" }} aria-hidden />}
          tint="#EEF4FF"
          label="Total Value Held"
          value={formatCurrency(heldValue, session.business.currency)}
        />
        <StatCard
          icon={<Clock3 className="h-[18px] w-[18px]" style={{ color: "var(--app-warning-text)" }} aria-hidden />}
          tint="var(--app-warning-bg)"
          label="Oldest Held"
          value={oldest ? formatRelativeTime(now - new Date(oldest).getTime()) : "—"}
        />
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-[9px] p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          {staff && staff.length > 0 && (
            <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Filter by staff" style={selectStyle}>
              <option value="all">All staff</option>
              {staff.map((s) => (
                <option key={s.userId} value={s.userId}>{s.name}</option>
              ))}
            </select>
          )}
          <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} aria-label="Filter by date" style={selectStyle} />
        </div>

        {holds && filtered.length === 0 ? (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14px] font-bold" style={{ color: "var(--app-text-muted)" }}>{holds.length > 0 ? "No holds match these filters" : "No held sales"}</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Park a sale from Fast Sale and it appears here instantly.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 760 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Reference</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Items</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Value</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Held By</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Held At</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => (
                  <tr key={h.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="p-[12px_17px] text-[12.5px] font-extrabold" style={{ color: "var(--app-success-text)" }}>{h.note ?? "—"}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{h.customerName ?? "Walk-in"}</td>
                    <td className="p-[12px] text-end text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{h.itemsCount}</td>
                    <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(h.estimatedTotal, session.business.currency)}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-faint)" }}>{h.heldByUserId ? staffNameByUserId.get(h.heldByUserId) ?? "Staff" : "—"}</td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>{formatRelativeTime(now - new Date(h.createdAt).getTime())}</td>
                    <td className="p-[12px_17px] text-end">
                      <span className="inline-flex gap-2">
                        <button type="button" onClick={() => setDiscarding(h)} style={smallOutline}>Discard</button>
                        <button type="button" onClick={() => setResuming(h)} style={smallPrimary}>Resume</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ResumeModal hold={resuming} onClose={() => setResuming(null)} currency={session.business.currency} />

      <PosModalShell
        open={discarding != null}
        onClose={() => setDiscarding(null)}
        title="Discard Held Sale"
        footer={
          <>
            <button type="button" onClick={() => setDiscarding(null)} style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" }}>Cancel</button>
            <button
              type="button"
              onClick={() => discarding && discardMutation.mutate(discarding.id)}
              disabled={discardMutation.isPending}
              style={{ ...btnDanger, opacity: discardMutation.isPending ? 0.6 : 1 }}
            >
              {discardMutation.isPending ? "Discarding…" : "Discard"}
            </button>
          </>
        }
      >
        {discarding && (
          <div className="p-[17px]">
            <div className="rounded-[12px] p-[13px]" style={{ background: "var(--app-surface-2)", border: "1px solid var(--app-surface-2)" }}>
              <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faintest)" }}>Reference</span><span className="font-extrabold" style={{ color: "var(--app-text)" }}>{discarding.note ?? "—"}</span></div>
              <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faintest)" }}>Customer</span><span className="font-bold" style={{ color: "var(--app-text-muted)" }}>{discarding.customerName ?? "Walk-in"}</span></div>
              <div className="flex justify-between p-[4px_0] text-[12.5px]"><span style={{ color: "var(--app-text-faintest)" }}>Value</span><span className="font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(discarding.estimatedTotal, session.business.currency)}</span></div>
            </div>
            <p className="mt-3 text-[12.5px]" style={{ color: "var(--app-danger-strong)" }}>The parked cart is deleted and cannot be resumed.</p>
          </div>
        )}
      </PosModalShell>

      <PosModalShell
        open={discardAllOpen}
        onClose={() => setDiscardAllOpen(false)}
        title="Discard Old Held Sales"
        footer={
          <>
            <button type="button" onClick={() => setDiscardAllOpen(false)} style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" }}>Cancel</button>
            <button
              type="button"
              onClick={() => discardAllMutation.mutate()}
              disabled={discardAllMutation.isPending}
              style={{ ...btnDanger, opacity: discardAllMutation.isPending ? 0.6 : 1 }}
            >
              {discardAllMutation.isPending ? "Discarding…" : "Discard them"}
            </button>
          </>
        }
      >
        <p className="p-[17px] text-[13px] leading-relaxed" style={{ color: "var(--app-text-faint)" }}>
          Every held sale from before today will be permanently discarded. Today&apos;s held sales are untouched.
        </p>
      </PosModalShell>
    </main>
  );
}

function ResumeModal({ hold, onClose, currency }: { hold: LiveHeldSale | null; onClose: () => void; currency: string }) {
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => resumeHeldSale(id, method),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["held-sales"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      toast.success(`Sale #${order.orderNo} recorded — ${formatCurrency(Number(order.total), currency)} via ${method}.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't complete this sale — the hold is still here."),
  });

  return (
    <PosModalShell
      open={hold != null}
      onClose={onClose}
      title="Resume Held Sale"
      footer={
        <>
          <button type="button" onClick={onClose} style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" onClick={() => hold && mutation.mutate(hold.id)} disabled={mutation.isPending} style={{ ...btnPrimary, opacity: mutation.isPending ? 0.6 : 1 }}>
            {mutation.isPending ? "Confirming…" : "Confirm Sale"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5 p-[17px]">
        {hold && (
          <div className="flex items-baseline gap-2.5 rounded-[13px] p-[14px]" style={{ background: "var(--app-success-bg)", border: "1px solid var(--app-success-border)" }}>
            <span className="text-[12.5px] font-bold" style={{ color: "var(--app-success-text)" }}>Total due</span>
            <span className="ms-auto text-[22px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>{formatCurrency(hold.estimatedTotal, currency)}</span>
          </div>
        )}
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>PAYMENT METHOD</span>
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
        </label>
      </div>
    </PosModalShell>
  );
}
