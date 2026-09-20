"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAllAdvances, fetchStaffList, createAdvance, settleAdvance, fetchPayrollPreview, type Advance } from "@/lib/staff-api";
import { formatCurrency, formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  SimpleKpiTile,
  KpiSkeleton,
  Chip,
  selectStyle,
  outlineBtnStyle,
  primaryBtnStyle,
  exportCsv,
  DisclosureNote,
  CenterModal,
  currentMonthValue,
} from "@/components/staff/staff-ui";
import { DrawerLabel } from "@/components/shared/side-drawer";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

const CATEGORIES = ["Salary Advance", "Emergency", "Festival", "Other"];

function statusLabel(status: Advance["status"]): string {
  return status === "outstanding" ? "Unsettled" : status === "deducted" ? "Settled" : "Cancelled";
}

export function AdvancesView({ currency }: { currency: string }) {
  const session = useSession();
  const isManager = session.user.role !== "staff";
  const [staffFilter, setStaffFilter] = useState("All staff");
  const [settledFilter, setSettledFilter] = useState("All advances");
  const [categoryFilter, setCategoryFilter] = useState("All categories");
  const [recording, setRecording] = useState(false);
  const [settling, setSettling] = useState<Advance | null>(null);
  const queryClient = useQueryClient();

  const { data: advances = [], isPending, isError, refetch } = useQuery({ queryKey: ["advances"], queryFn: fetchAllAdvances });
  // Real deduction the next payroll run will actually apply — capped per staff by that person's
  // earned commission (see `PayrollService.netAdvances`), not the raw outstanding balance.
  // Owner-only, since `/payroll/preview` requires the payroll.export capability.
  const isOwner = session.user.role === "owner";
  const { data: payrollPreview } = useQuery({
    queryKey: ["payroll-preview", currentMonthValue()],
    queryFn: () => fetchPayrollPreview(currentMonthValue()),
    enabled: isOwner,
  });

  const settleMutation = useMutation({
    mutationFn: (a: Advance) => settleAdvance(a.staffUserId, a.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advances"] });
      toast.success("Advance marked settled.");
      setSettling(null);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't settle this advance — please try again."),
  });

  const filtered = advances.filter((a) => {
    if (staffFilter !== "All staff" && a.staffName !== staffFilter) return false;
    if (settledFilter === "Settled only" && a.status !== "deducted") return false;
    if (settledFilter === "Unsettled only" && a.status !== "outstanding") return false;
    if (categoryFilter !== "All categories" && (a.category ?? "Other") !== categoryFilter) return false;
    return true;
  });

  const unsettled = advances.filter((a) => a.status === "outstanding");
  const totalUnsettled = unsettled.reduce((a, x) => a + x.amount, 0);
  const now = new Date();
  const thisMonthTotal = advances
    .filter((a) => {
      const d = new Date(a.createdAt);
      return d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth();
    })
    .reduce((a, x) => a + x.amount, 0);
  const staffWithAdvances = new Set(unsettled.map((a) => a.staffUserId)).size;
  const nextPayoutDeduction = payrollPreview
    ? payrollPreview.rows.reduce((a, r) => a + r.advancesDeducted, 0)
    : totalUnsettled;

  function doExport() {
    exportCsv(
      "advances.csv",
      ["Staff", "Date", "Amount", "Category", "Note", "Status", "Recorded by"],
      filtered.map((a) => [a.staffName ?? "", a.createdAt, a.amount, a.category ?? "Other", a.reason ?? "", statusLabel(a.status), a.recordedByName ?? ""]),
    );
  }

  if (isError) {
    return (
      <div className="mx-6 mt-6 rounded-[16px] p-6 text-center" style={{ background: "var(--app-surface)", border: "1px solid #FDD9D6" }}>
        <p className="m-0 text-[14.5px] font-extrabold" style={{ color: "#B42318" }}>Unable to load advances</p>
        <button type="button" onClick={() => refetch()} className="mt-3.5 rounded-[12px] px-5 py-3 text-[13px] font-extrabold text-white" style={primaryBtnStyle()}>Retry</button>
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[9px]">
        {unsettled.length > 0 && <Chip label={`${unsettled.length} unsettled`} />}
        <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} aria-label="Staff" className="rounded-[11px]" style={selectStyle}>
          <option>All staff</option>
          {Array.from(new Set(advances.map((a) => a.staffName).filter(Boolean))).map((n) => <option key={n}>{n}</option>)}
        </select>
        <select value={settledFilter} onChange={(e) => setSettledFilter(e.target.value)} aria-label="Settled status" className="rounded-[11px]" style={selectStyle}>
          <option>All advances</option>
          <option>Settled only</option>
          <option>Unsettled only</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Category" className="rounded-[11px]" style={selectStyle}>
          <option>All categories</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <div className="ml-auto flex flex-wrap items-center gap-[9px]">
          <button type="button" onClick={doExport} className="rounded-[11px]" style={outlineBtnStyle}>Export</button>
          {isManager && <button type="button" onClick={() => setRecording(true)} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>Record Advance</button>}
        </div>
      </div>

      <div className="grid gap-[14px]" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {isPending ? (
          <KpiSkeleton count={4} />
        ) : (
          <>
            <SimpleKpiTile label="Total Unsettled" labelColor="#B42318" value={formatCurrency(totalUnsettled, currency)} valueSize={22} border="1.5px solid #FDD9D6" />
            <SimpleKpiTile label="Advances This Month" value={formatCurrency(thisMonthTotal, currency)} valueSize={22} />
            <SimpleKpiTile label="Staff With Advances" value={String(staffWithAdvances)} valueSize={22} />
            <SimpleKpiTile
              label="Auto-Deduction Next Payout"
              labelColor="#B54708"
              value={formatCurrency(nextPayoutDeduction, currency)}
              valueSize={22}
              border="1.5px solid #FDE3B3"
              sub={!isOwner ? <div className="mt-1 text-[10.5px]" style={{ color: "var(--app-text-disabled)" }}>Upper bound — actual deduction is capped by commission earned</div> : undefined}
            />
          </>
        )}
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        {filtered.length === 0 ? (
          <div className="text-center" style={{ padding: "52px 18px" }}>
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No advances yet</div>
            <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Record a cash advance — it&apos;s automatically deducted from the next payroll export.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Staff</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Date</th>
                  <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Amount</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Category</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Note</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Status</th>
                  <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: 10 }}>Recorded by</th>
                  {isManager && <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "var(--app-text-disabled)", padding: "10px 17px" }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td style={{ padding: "12px 17px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text)" }}>{a.staffName ?? "—"}</td>
                    <td style={{ padding: 12, fontSize: 12.5, color: "var(--app-text-faint)" }}>{formatDate(a.createdAt)}</td>
                    <td style={{ padding: 12, fontSize: 12.5, fontWeight: 700, color: "var(--app-text)", textAlign: "right" }}>{formatCurrency(a.amount, currency)}</td>
                    <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faint)" }}>{a.category ?? "Other"}</td>
                    <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faint)" }}>{a.reason ?? "—"}</td>
                    <td style={{ padding: 12 }}><Chip label={statusLabel(a.status)} /></td>
                    <td style={{ padding: 12, fontSize: 12, color: "var(--app-text-faint)" }}>{a.recordedByName ?? "—"}</td>
                    {isManager && (
                      <td style={{ padding: "12px 17px", textAlign: "right" }}>
                        {a.status === "outstanding" && (
                          <button type="button" onClick={() => setSettling(a)} className="rounded-[9px] text-[11.5px] font-bold" style={{ ...outlineBtnStyle, minHeight: 34, padding: "6px 10px" }}>Mark Settled</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DisclosureNote>Unsettled advances are netted against commission automatically and appear as a deduction on the payroll sheet.</DisclosureNote>

      {recording && <RecordAdvanceModal onClose={() => setRecording(false)} />}
      {settling && (
        <CenterModal
          title="Mark Advance Settled"
          onClose={() => setSettling(null)}
          footer={
            <>
              <button type="button" onClick={() => setSettling(null)} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
              <button type="button" onClick={() => settleMutation.mutate(settling)} disabled={settleMutation.isPending} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white" style={primaryBtnStyle()}>{settleMutation.isPending ? "Saving…" : "Mark Settled"}</button>
            </>
          }
        >
          <p className="m-0 text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{settling.staffName}</p>
          <p className="m-0 text-[12px]" style={{ color: "var(--app-text-faint)" }}>{settling.category ?? "Other"} · {formatDate(settling.createdAt)} · {formatCurrency(settling.amount, currency)}</p>
          <DisclosureNote>Once settled it stops being deducted from future commission payouts.</DisclosureNote>
        </CenterModal>
      )}
    </main>
  );
}

function RecordAdvanceModal({ onClose }: { onClose: () => void }) {
  const session = useSession();
  const currency = session.business.currency;
  const { data: staffList = [] } = useQuery({ queryKey: ["staff-list"], queryFn: () => fetchStaffList() });
  const [staffUserId, setStaffUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  const valid = staffUserId !== "" && Number(amount) > 0;

  const mutation = useMutation({
    mutationFn: () => createAdvance(staffUserId, { amount: Number(amount), category, reason: note.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advances"] });
      toast.success(`${formatCurrency(Number(amount), currency)} advance recorded — it nets against the next payout.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't record this advance — please try again."),
  });

  return (
    <CenterModal
      title="Record Advance"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-[11px] px-4 py-2.5 text-[12.5px] font-bold" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!valid || mutation.isPending} className="rounded-[11px] px-5 py-2.5 text-[12.5px] font-extrabold text-white disabled:opacity-50" style={primaryBtnStyle()}>{mutation.isPending ? "Saving…" : "Record Advance"}</button>
        </>
      }
    >
      <div>
        <DrawerLabel>Staff</DrawerLabel>
        <select value={staffUserId} onChange={(e) => setStaffUserId(e.target.value)} style={selectStyle} className="w-full">
          <option value="">Select…</option>
          {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div>
        <DrawerLabel>Amount</DrawerLabel>
        <input type="number" min={0.01} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
      </div>
      <div>
        <DrawerLabel>Category</DrawerLabel>
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle} className="w-full">
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div>
        <DrawerLabel>Note</DrawerLabel>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="w-full rounded-[10px] px-3 py-2.5 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
      </div>
      {amount && Number(amount) > 0 && (
        <p className="m-0 rounded-[10px] p-2.5 text-[11.5px] leading-relaxed" style={{ background: "#F7FCF9", border: "1px solid #BFE7CF", color: "#0E8442" }}>
          {formatCurrency(Number(amount), currency)} will be deducted from the next commission payout.
        </p>
      )}
    </CenterModal>
  );
}
