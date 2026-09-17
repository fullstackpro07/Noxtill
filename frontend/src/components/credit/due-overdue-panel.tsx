"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchInstallments,
  payInstallment,
  rescheduleInstallment,
  bulkRemindDebtors,
  fetchCollectedToday,
  fetchOverdueAgeing,
  fetchDebtors,
  type DueInstallment,
  type LiveDebtor,
} from "@/lib/credit-api";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";
import { useCreditSearchStore } from "@/store/credit-search-store";

const PILLS = ["Due Today", "Due Tomorrow", "Due This Week", "Overdue", "Long Overdue"] as const;
type Pill = (typeof PILLS)[number];

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };
const smallPrimary: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", minHeight: 40 };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function DueOverduePanel() {
  const session = useSession();
  const currency = session.business.currency;
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const query = useCreditSearchStore((s) => s.query);
  const tabParam = searchParams.get("tab");
  const pill: Pill = tabParam && (PILLS as readonly string[]).includes(tabParam) ? (tabParam as Pill) : "Due Today";
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [rescheduling, setRescheduling] = useState<DueInstallment | null>(null);
  const [payingDebtor, setPayingDebtor] = useState<LiveDebtor | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const isInstallmentView = pill === "Due Today" || pill === "Due Tomorrow" || pill === "Due This Week";

  const { data: installments = [] } = useQuery({ queryKey: ["installments", "all-pending"], queryFn: () => fetchInstallments() });
  const { data: collectedToday } = useQuery({ queryKey: ["collected-today"], queryFn: fetchCollectedToday });
  const { data: debtors = [] } = useQuery({ queryKey: ["debtors", "overdue"], queryFn: () => fetchDebtors("overdue") });
  const { data: ageing } = useQuery({ queryKey: ["credit-overdue"], queryFn: fetchOverdueAgeing });

  const payMutation = useMutation({
    mutationFn: (id: string) => payInstallment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installments"] });
      queryClient.invalidateQueries({ queryKey: ["collected-today"] });
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      toast.success("Instalment marked paid.");
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't mark this instalment paid."),
  });

  const remindMutation = useMutation({
    mutationFn: (customerIds: string[]) => bulkRemindDebtors(customerIds),
    onSuccess: (result) => { toast.success(`Sent ${result.sent} reminder(s)${result.skipped ? `, ${result.skipped} skipped` : ""}.`); setSelected([]); },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send reminders."),
  });

  const today = todayIso();
  const tomorrow = addDaysIso(1);
  const weekEnd = addDaysIso(7);

  const installmentRows = useMemo(() => {
    return installments.filter((i) => {
      const d = i.dueDate.slice(0, 10);
      if (pill === "Due Today") return d === today;
      if (pill === "Due Tomorrow") return d === tomorrow;
      return d >= today && d <= weekEnd;
    });
  }, [installments, pill, today, tomorrow, weekEnd]);

  const filteredInstallments = useMemo(() => {
    return installmentRows.filter((i) => {
      if (query && !i.customerName.toLowerCase().includes(query.toLowerCase()) && !i.customerPhone.includes(query)) return false;
      if (minAmount && i.amount < Number(minAmount)) return false;
      if (maxAmount && i.amount > Number(maxAmount)) return false;
      return true;
    });
  }, [installmentRows, query, minAmount, maxAmount]);

  const overdueDebtors = useMemo(() => debtors.filter((d) => d.daysOutstanding >= 30), [debtors]);
  const longOverdueDebtors = useMemo(() => ageing?.atRisk.debtors ?? [], [ageing]);
  const debtorRows = pill === "Overdue" ? overdueDebtors : longOverdueDebtors;
  const filteredDebtors = useMemo(() => {
    return debtorRows.filter((d) => {
      if (query && !d.name.toLowerCase().includes(query.toLowerCase()) && !d.phone.includes(query)) return false;
      if (minAmount && d.balance < Number(minAmount)) return false;
      if (maxAmount && d.balance > Number(maxAmount)) return false;
      return true;
    });
  }, [debtorRows, query, minAmount, maxAmount]);

  function pickPill(p: Pill) {
    setMinAmount("");
    setMaxAmount("");
    setSelected([]);
    router.replace(`/credit/due?tab=${encodeURIComponent(p)}`);
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap gap-2">
        {PILLS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => pickPill(p)}
            className="rounded-full px-[15px] py-[9px] text-[12px] font-bold"
            style={{
              border: `1px solid ${p === pill ? "var(--app-primary)" : "var(--app-border)"}`,
              background: p === pill ? "#E8F7EE" : "var(--app-surface)",
              color: p === pill ? "#0E8442" : "var(--app-text-muted)",
              minHeight: 42,
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {isInstallmentView ? (
        <InstallmentSection
          pill={pill}
          rows={filteredInstallments}
          allRows={installmentRows}
          collectedToday={collectedToday}
          currency={currency}
          minAmount={minAmount}
          maxAmount={maxAmount}
          setMinAmount={setMinAmount}
          setMaxAmount={setMaxAmount}
          onPay={(id) => payMutation.mutate(id)}
          onReschedule={setRescheduling}
          onRemindAll={() => remindMutation.mutate([...new Set(installmentRows.map((i) => i.customerId))])}
          remindPending={remindMutation.isPending}
        />
      ) : (
        <OverdueSection
          pill={pill}
          rows={filteredDebtors}
          ageing={ageing}
          currency={currency}
          minAmount={minAmount}
          maxAmount={maxAmount}
          setMinAmount={setMinAmount}
          setMaxAmount={setMaxAmount}
          selected={selected}
          toggleSelect={(id) => setSelected((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]))}
          onRemindSelected={() => remindMutation.mutate(selected)}
          onRemindOne={(id) => remindMutation.mutate([id])}
          onPay={setPayingDebtor}
          remindPending={remindMutation.isPending}
        />
      )}

      {rescheduling && <RescheduleDialog installment={rescheduling} onClose={() => setRescheduling(null)} />}
      <RecordPaymentDialog debtor={payingDebtor} currency={currency} onClose={() => setPayingDebtor(null)} />
    </main>
  );
}

function InstallmentSection({
  pill,
  rows,
  allRows,
  collectedToday,
  currency,
  minAmount,
  maxAmount,
  setMinAmount,
  setMaxAmount,
  onPay,
  onReschedule,
  onRemindAll,
  remindPending,
}: {
  pill: Pill;
  rows: DueInstallment[];
  allRows: DueInstallment[];
  collectedToday: number | undefined;
  currency: string;
  minAmount: string;
  maxAmount: string;
  setMinAmount: (v: string) => void;
  setMaxAmount: (v: string) => void;
  onPay: (id: string) => void;
  onReschedule: (i: DueInstallment) => void;
  onRemindAll: () => void;
  remindPending: boolean;
}) {
  const total = allRows.reduce((s, i) => s + i.amount, 0);
  const customersDue = new Set(allRows.map((i) => i.customerId)).size;

  return (
    <>
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>{pill}</h2>
        <span className="rounded-full px-3 py-1 text-[13px] font-extrabold" style={{ color: "#B54708", background: "#FEF6E7" }}>{formatCurrency(total, currency)} due</span>
        <div className="ml-auto flex flex-wrap gap-[9px]">
          <button type="button" onClick={onRemindAll} disabled={allRows.length === 0 || remindPending} style={primaryBtn}>Remind All</button>
        </div>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDE3B3" }}>
          <div className="text-[12px] font-bold" style={{ color: "#B54708" }}>{pill}</div>
          <div className="mt-[5px] text-[23px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.6px" }}>{formatCurrency(total, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Customers Due</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{customersDue}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Collected Today</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{collectedToday != null ? formatCurrency(collectedToday, currency) : "—"}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <span className="flex items-center gap-1.5">
            <input type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="Min" aria-label="Minimum amount" className="w-[88px] rounded-[10px] p-[9px] text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
            <span style={{ color: "var(--app-text-disabled)" }}>–</span>
            <input type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="Max" aria-label="Maximum amount" className="w-[88px] rounded-[10px] p-[9px] text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
          </span>
        </div>

        {rows.length === 0 && (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Nothing {pill.toLowerCase()}</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Change the filters or pick another window.</div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 820 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Phone</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Due Amount</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Due Date</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="p-[12px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-primary)" }}>{i.customerName}</td>
                    <td className="whitespace-nowrap p-[12px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{i.customerPhone}</td>
                    <td className="p-[12px] text-end text-[13.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(i.amount, currency)}</td>
                    <td className="whitespace-nowrap p-[12px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{formatDate(i.dueDate)}</td>
                    <td className="p-[12px_17px] text-end">
                      <span className="inline-flex gap-[7px]">
                        <button type="button" onClick={() => onReschedule(i)} style={smallOutline}>Reschedule</button>
                        <button type="button" onClick={() => onPay(i.id)} style={smallPrimary}>Mark Paid</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function OverdueSection({
  pill,
  rows,
  ageing,
  currency,
  minAmount,
  maxAmount,
  setMinAmount,
  setMaxAmount,
  selected,
  toggleSelect,
  onRemindSelected,
  onRemindOne,
  onPay,
  remindPending,
}: {
  pill: Pill;
  rows: LiveDebtor[];
  ageing: { buckets: { key: string; count: number; total: number }[] } | undefined;
  currency: string;
  minAmount: string;
  maxAmount: string;
  setMinAmount: (v: string) => void;
  setMaxAmount: (v: string) => void;
  selected: string[];
  toggleSelect: (id: string) => void;
  onRemindSelected: () => void;
  onRemindOne: (id: string) => void;
  onPay: (d: LiveDebtor) => void;
  remindPending: boolean;
}) {
  const bucket = (key: string) => ageing?.buckets.find((b) => b.key === key);
  const total = rows.reduce((s, d) => s + d.balance, 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-[10px]">
        <h2 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.4px" }}>{pill}</h2>
        <span className="rounded-full px-3 py-1 text-[13px] font-extrabold" style={{ color: "#B42318", background: "#FEF3F2" }}>{formatCurrency(total, currency)} across {rows.length} customers</span>
        {selected.length > 0 && (
          <div className="ml-auto flex flex-wrap gap-[9px]">
            <button type="button" onClick={onRemindSelected} disabled={remindPending} style={outlineBtn}>Remind Selected ({selected.length})</button>
          </div>
        )}
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDD9D6" }}>
          <div className="text-[12px] font-bold" style={{ color: "#B42318" }}>Overdue Balance</div>
          <div className="mt-[5px] text-[22px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.5px" }}>{formatCurrency(total, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>30+ Days</div>
          <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "#B54708" }}>{formatCurrency(bucket("thirtyPlus")?.total ?? 0, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>60+ Days</div>
          <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "#DC6803" }}>{formatCurrency(bucket("sixtyPlus")?.total ?? 0, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>90+ Days</div>
          <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "#B42318" }}>{formatCurrency(bucket("ninetyPlus")?.total ?? 0, currency)}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <span className="flex items-center gap-1.5">
            <input type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="Min" aria-label="Minimum amount" className="w-[88px] rounded-[10px] p-[9px] text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
            <span style={{ color: "var(--app-text-disabled)" }}>–</span>
            <input type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="Max" aria-label="Maximum amount" className="w-[88px] rounded-[10px] p-[9px] text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
          </span>
        </div>

        {rows.length === 0 && (
          <div className="p-[52px_18px] text-center">
            <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No overdue credit — great</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing matches these filters.</div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 820 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="w-[34px] p-[10px_0_10px_17px]" />
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Phone</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Balance</th>
                  <th className="p-[10px] text-center text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Days Overdue</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.customerId} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="p-[11px_0_11px_17px]"><input type="checkbox" checked={selected.includes(d.customerId)} onChange={() => toggleSelect(d.customerId)} aria-label={`Select ${d.name}`} style={{ width: 15, height: 15, accentColor: "var(--app-primary)" }} /></td>
                    <td className="p-[11px] text-[12.5px] font-bold" style={{ color: "var(--app-primary)" }}>{d.name}</td>
                    <td className="whitespace-nowrap p-[11px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{d.phone}</td>
                    <td className="p-[11px] text-end text-[13.5px] font-extrabold" style={{ color: "#B42318" }}>{formatCurrency(d.balance, currency)}</td>
                    <td className="p-[11px] text-center"><span className="whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] font-extrabold" style={{ background: "#FEF3F2", color: "#B42318" }}>{d.daysOutstanding}</span></td>
                    <td className="p-[11px_17px] text-end">
                      <span className="inline-flex gap-[7px]">
                        <button type="button" onClick={() => onRemindOne(d.customerId)} disabled={d.optedOutOfReminders} style={smallOutline}>Remind</button>
                        <button type="button" onClick={() => onPay(d)} style={smallPrimary}>Record Payment</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function RescheduleDialog({ installment, onClose }: { installment: DueInstallment; onClose: () => void }) {
  const [dueDate, setDueDate] = useState(installment.dueDate.slice(0, 10));
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => rescheduleInstallment(installment.id, new Date(dueDate).toISOString(), reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["installments"] });
      toast.success(`${installment.customerName}'s instalment rescheduled.`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't reschedule this instalment."),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(10,27,42,.38)" }}>
      <div className="w-[420px] max-w-[calc(100%-32px)] rounded-[16px] p-[20px]" style={{ background: "var(--app-surface)" }}>
        <h3 className="m-0 mb-4 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Reschedule — {installment.customerName}</h3>
        <label className="mb-3 block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>NEW DUE DATE</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-[11px] p-3 text-[13px] font-bold" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>REASON</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer requested more time" className="w-full rounded-[11px] p-3 text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
        </label>
        <div className="flex justify-end gap-2.5">
          <button type="button" onClick={onClose} style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", borderRadius: 11, padding: "11px 18px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)" }}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!dueDate || !reason.trim() || mutation.isPending} style={primaryBtn}>{mutation.isPending ? "Saving…" : "Reschedule"}</button>
        </div>
      </div>
    </div>
  );
}
