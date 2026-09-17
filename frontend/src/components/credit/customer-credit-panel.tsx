"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchDebtors,
  fetchLedger,
  fetchInstallmentPlans,
  sendStatement,
  type LedgerEntry,
} from "@/lib/credit-api";
import { RecordPaymentDialog } from "./record-payment-dialog";
import { StatementDialog } from "./statement-dialog";
import { InstallmentPlanDialog } from "./installment-plan-dialog";
import { ShareLinkDialog } from "./share-link-dialog";
import { WriteOffDialog } from "./write-off-dialog";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";

const ENTRY_LABEL: Record<LedgerEntry["kind"], string> = { credit: "Credit", payment: "Payment", write_off: "Adjustment" };
const ENTRY_TONE: Record<LedgerEntry["kind"], { bg: string; fg: string }> = {
  credit: { bg: "#FEF3F2", fg: "#B42318" },
  payment: { bg: "#E8F7EE", fg: "#0E8442" },
  write_off: { bg: "var(--app-surface-2)", fg: "var(--app-text-muted)" },
};

function riskSignal(daysOutstanding: number, recentNetChange: number): { label: string; bg: string; fg: string } {
  if (daysOutstanding >= 60 || recentNetChange > 0) return { label: "High risk", bg: "#FEF3F2", fg: "#B42318" };
  if (daysOutstanding >= 30) return { label: "Watch", bg: "#FEF6E7", fg: "#B54708" };
  return { label: "Low risk", bg: "#E8F7EE", fg: "#0E8442" };
}

function initialsFor(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 11, padding: "11px 15px", fontSize: 12.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 44 };
const primaryBtn: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 11, padding: "11px 16px", fontSize: 12.5, fontWeight: 800, color: "#fff", minHeight: 44 };
const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };

export function CustomerCreditPanel() {
  const session = useSession();
  const currency = session.business.currency;
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id");
  const queryClient = useQueryClient();

  const { data: debtors = [] } = useQuery({ queryKey: ["debtors", "overdue"], queryFn: () => fetchDebtors("overdue") });
  const customerId = selectedId ?? debtors[0]?.customerId ?? null;

  const [paying, setPaying] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [rangeFilter, setRangeFilter] = useState("Last 90 days");
  const [typeFilter, setTypeFilter] = useState("All types");

  const { data: ledger, isPending } = useQuery({ queryKey: ["ledger", customerId], queryFn: () => fetchLedger(customerId!), enabled: !!customerId });
  const { data: plans } = useQuery({ queryKey: ["installment-plans", customerId], queryFn: () => fetchInstallmentPlans(customerId!), enabled: !!customerId });

  const sendMutation = useMutation({
    mutationFn: () => sendStatement(customerId!),
    onSuccess: () => toast.success("Statement sent."),
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this statement."),
  });

  const daysOutstanding = useMemo(() => {
    if (!ledger || ledger.entries.length === 0) return 0;
    return Math.floor((new Date().getTime() - new Date(ledger.entries[ledger.entries.length - 1].date).getTime()) / (1000 * 60 * 60 * 24));
  }, [ledger]);
  const recentNetChange = useMemo(() => {
    if (!ledger) return 0;
    const since = new Date().getTime() - 30 * 24 * 60 * 60 * 1000;
    return ledger.entries.filter((e) => new Date(e.date).getTime() >= since).reduce((s, e) => s + (e.kind === "credit" ? e.amount : -e.amount), 0);
  }, [ledger]);
  const risk = riskSignal(daysOutstanding, recentNetChange);

  const totals = useMemo(() => {
    if (!ledger) return { extended: 0, repaid: 0 };
    return ledger.entries.reduce(
      (acc, e) => {
        if (e.kind === "credit") acc.extended += e.amount;
        if (e.kind === "payment") acc.repaid += e.amount;
        return acc;
      },
      { extended: 0, repaid: 0 },
    );
  }, [ledger]);

  const filteredEntries = useMemo(() => {
    if (!ledger) return [];
    const cutoffDays = rangeFilter === "Last 30 days" ? 30 : rangeFilter === "Last 90 days" ? 90 : rangeFilter === "This year" ? 366 : null;
    const now = new Date().getTime();
    return ledger.entries
      .filter((e) => {
        if (typeFilter !== "All types" && ENTRY_LABEL[e.kind] !== typeFilter) return false;
        if (cutoffDays !== null && now - new Date(e.date).getTime() > cutoffDays * 24 * 60 * 60 * 1000) return false;
        return true;
      })
      .slice()
      .reverse();
  }, [ledger, rangeFilter, typeFilter]);

  function pickCustomer(id: string) {
    router.push(`/credit/customer?id=${id}`);
  }

  if (debtors.length === 0) {
    return (
      <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
        <div className="rounded-[16px] p-[40px] text-center" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No customers with credit history yet</div>
        </div>
      </main>
    );
  }

  if (!customerId || isPending || !ledger) {
    return <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4" />;
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <div className="flex flex-wrap items-center gap-[14px] rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <span className="flex h-[48px] w-[48px] flex-none items-center justify-center rounded-full text-[15px] font-extrabold text-white" style={{ background: "#0A1B2A" }}>{initialsFor(ledger.name)}</span>
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="text-[18px] font-extrabold" style={{ color: "var(--app-text)", letterSpacing: "-.3px" }}>{ledger.name}</span>
            <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: risk.bg, color: risk.fg }}>{risk.label}</span>
          </span>
          <span className="mt-[3px] block text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{ledger.phone} · last activity {daysOutstanding}d ago</span>
        </span>
        <span className="ml-auto flex flex-col items-end">
          <span className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "var(--app-text-faint)" }}>Current balance</span>
          <span className="text-[26px] font-extrabold" style={{ color: "#B42318", letterSpacing: "-.8px" }}>{formatCurrency(ledger.balance, currency)}</span>
        </span>
        <span className="flex flex-wrap gap-2.5">
          <button type="button" onClick={() => setStatementOpen(true)} style={outlineBtn}>Statement</button>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-[10px]">
        <label className="text-[12px] font-bold" style={{ color: "var(--app-text-faint)" }}>VIEWING</label>
        <select value={customerId} onChange={(e) => pickCustomer(e.target.value)} aria-label="Choose customer" style={{ ...selectStyle, padding: "10px 12px", minHeight: 44 }}>
          {debtors.map((d) => (
            <option key={d.customerId} value={d.customerId}>{d.name}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDD9D6" }}>
          <div className="text-[12px] font-bold" style={{ color: "#B42318" }}>Current Balance</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(ledger.balance, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Total Ever Extended</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(totals.extended, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Total Repaid</div>
          <div className="mt-[5px] text-[21px] font-extrabold" style={{ color: "var(--app-primary)" }}>{formatCurrency(totals.repaid, currency)}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Risk Signal</div>
          <div className="mt-[9px]"><span className="rounded-full px-[11px] py-[5px] text-[12px] font-extrabold" style={{ background: risk.bg, color: risk.fg }}>{risk.label}</span></div>
        </div>
      </div>

      <div className="flex flex-wrap gap-[9px]">
        <button type="button" onClick={() => setPaying(true)} style={primaryBtn}>Record Payment</button>
        <button type="button" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending} style={outlineBtn}>Send Statement</button>
        <button type="button" onClick={() => setPlanOpen(true)} disabled={ledger.balance <= 0} style={outlineBtn}>Create Instalment Plan</button>
        <button type="button" onClick={() => setShareOpen(true)} style={outlineBtn}>Generate Transparent Link</button>
        {session.user.role === "owner" && ledger.balance > 0 && (
          <button type="button" onClick={() => setWriteOffOpen(true)} style={{ ...outlineBtn, borderColor: "#FDD9D6", color: "#B42318" }}>Write Off</button>
        )}
      </div>

      {plans && plans.length > 0 && (
        <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <h3 className="m-0 mb-3 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Instalment plans</h3>
          <div className="flex flex-col gap-2">
            {plans.map((plan) => (
              <div key={plan.id} className="rounded-[11px] p-3" style={{ background: "var(--app-surface-2)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{formatCurrency(Number(plan.totalAmount), currency)}</span>
                  <span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: plan.status === "completed" ? "#E8F7EE" : plan.status === "cancelled" ? "var(--app-surface)" : "#EEF4FF", color: plan.status === "completed" ? "#0E8442" : plan.status === "cancelled" ? "var(--app-text-muted)" : "#3538CD" }}>{plan.status}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {plan.installments.map((line) => (
                    <span key={line.id} className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: line.status === "paid" ? "#E8F7EE" : "var(--app-surface)", color: line.status === "paid" ? "#0E8442" : "var(--app-text-muted)" }}>
                      #{line.seq} {formatCurrency(Number(line.amount), currency)} · {formatDate(line.dueDate)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Balance over time</h3>
        <BalanceOverTimeChart entries={ledger.entries} />
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Ledger entries</h3>
          <span className="ml-auto flex flex-wrap gap-2">
            <select value={rangeFilter} onChange={(e) => setRangeFilter(e.target.value)} aria-label="Date range" style={selectStyle}>
              {["Last 90 days", "Last 30 days", "This year", "All time"].map((o) => <option key={o}>{o}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Entry type" style={selectStyle}>
              {["All types", "Credit", "Payment", "Adjustment"].map((o) => <option key={o}>{o}</option>)}
            </select>
          </span>
        </div>
        {filteredEntries.length === 0 ? (
          <div className="p-[48px_18px] text-center">
            <div className="text-[14px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>No entries of this type</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Change the entry-type filter to see the full history.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 760 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="p-[10px_17px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Date</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Entry Type</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Description</th>
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Amount</th>
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Running Balance</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((e) => (
                  <tr key={e.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                    <td className="whitespace-nowrap p-[12px_17px] text-[12.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>{formatDate(e.date)}</td>
                    <td className="p-[12px]"><span className="rounded-full px-[9px] py-[3px] text-[10.5px] font-bold" style={{ background: ENTRY_TONE[e.kind].bg, color: ENTRY_TONE[e.kind].fg }}>{ENTRY_LABEL[e.kind]}</span></td>
                    <td className="p-[12px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{e.note ?? "—"}</td>
                    <td className="p-[12px] text-end text-[12.5px] font-extrabold" style={{ color: e.kind === "credit" ? "var(--app-text)" : "var(--app-primary)" }}>{e.kind === "credit" ? "+" : "−"}{formatCurrency(e.amount, currency)}</td>
                    <td className="p-[12px_17px] text-end text-[12.5px] font-bold" style={{ color: "var(--app-text)" }}>{formatCurrency(e.runningBalance, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {paying && (
        <RecordPaymentDialog
          debtor={{ customerId, name: ledger.name, phone: ledger.phone, balance: ledger.balance, daysOutstanding, optedOutOfReminders: false }}
          currency={currency}
          onClose={() => setPaying(false)}
        />
      )}
      <StatementDialog
        debtor={statementOpen ? { customerId, name: ledger.name, phone: ledger.phone, balance: ledger.balance, daysOutstanding, optedOutOfReminders: false } : null}
        currency={currency}
        onClose={() => setStatementOpen(false)}
      />
      {planOpen && <InstallmentPlanDialog customerId={customerId} customerName={ledger.name} balance={ledger.balance} currency={currency} onClose={() => setPlanOpen(false)} />}
      {shareOpen && <ShareLinkDialog customerId={customerId} customerName={ledger.name} onClose={() => setShareOpen(false)} />}
      {writeOffOpen && <WriteOffDialog customerId={customerId} customerName={ledger.name} balance={ledger.balance} currency={currency} onClose={() => { setWriteOffOpen(false); queryClient.invalidateQueries({ queryKey: ["ledger", customerId] }); }} />}
    </main>
  );
}

function BalanceOverTimeChart({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length < 2) {
    return <div className="flex h-[148px] items-center justify-center text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Not enough history yet.</div>;
  }
  const width = 620;
  const height = 148;
  const max = Math.max(...entries.map((e) => e.runningBalance), 1);
  const coords = entries.map((e, i) => ({ x: (i / (entries.length - 1)) * (width - 8) + 4, y: height - 20 - (e.runningBalance / max) * (height - 40) }));
  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1].x},${height - 20} L${coords[0].x},${height - 20} Z`;
  const labelStep = Math.max(1, Math.floor(entries.length / 6));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ height }}>
      <path d={areaPath} fill="#B42318" opacity={0.08} />
      <path d={linePath} fill="none" stroke="#B42318" strokeWidth={2.4} strokeLinejoin="round" />
      {coords.map((c, i) => (i % labelStep === 0 || i === coords.length - 1 ? <circle key={i} cx={c.x} cy={c.y} r={3.4} fill="#fff" stroke="#B42318" strokeWidth={1.8} /> : null))}
      {entries.map((e, i) =>
        i % labelStep === 0 || i === entries.length - 1 ? (
          <text key={i} x={coords[i].x} y={height - 4} textAnchor="middle" fontSize={10.5} fill="var(--app-text-disabled)" fontWeight={600}>
            {new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </text>
        ) : null,
      )}
    </svg>
  );
}
