"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { askText } from "@/lib/ask-dialog";
import { useSession } from "@/lib/session";
import {
  createFinanceAccount,
  createFinanceJournal,
  createFinanceJournalReversal,
  fetchFinanceAccounts,
  fetchFinanceJournalActivity,
  fetchFinanceJournals,
  fetchFinanceTrialBalance,
  lockFinancePeriod,
  postFinanceJournal,
  submitFinanceJournal,
  type FinanceAccountType,
  type FinanceJournalLineInput,
} from "@/lib/finance-journals-api";

type DraftLine = FinanceJournalLineInput & { localId: number };
const ACCOUNT_TYPES: { value: FinanceAccountType; label: string }[] = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
];

const fieldStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 8,
  padding: "9px 10px",
  background: "var(--app-surface)",
  color: "var(--app-text)",
  fontSize: 12,
  minWidth: 0,
};
const panelStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 14,
  background: "var(--app-surface)",
  padding: 18,
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function FinanceJournalsView() {
  const session = useSession();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(todayString().slice(0, 7));
  const [trialBalanceAsOf, setTrialBalanceAsOf] = useState(todayString());
  const [accountCode, setAccountCode] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<FinanceAccountType>("asset");
  const [reference, setReference] = useState("");
  const [entryDate, setEntryDate] = useState(todayString());
  const [description, setDescription] = useState("");
  const [lineId, setLineId] = useState(2);
  const [lines, setLines] = useState<DraftLine[]>([
    { localId: 0, accountId: "", debit: "0.00", credit: "0.00" },
    { localId: 1, accountId: "", debit: "0.00", credit: "0.00" },
  ]);

  const accountQuery = useQuery({ queryKey: ["finance-journal-accounts"], queryFn: fetchFinanceAccounts });
  const journalQuery = useQuery({ queryKey: ["finance-journals", month], queryFn: () => fetchFinanceJournals(month) });
  const activityQuery = useQuery({ queryKey: ["finance-journal-activity", month], queryFn: () => fetchFinanceJournalActivity(month) });
  const trialBalanceQuery = useQuery({ queryKey: ["finance-trial-balance", trialBalanceAsOf], queryFn: () => fetchFinanceTrialBalance(trialBalanceAsOf) });
  const accounts = accountQuery.data ?? [];
  const activeAccounts = accounts.filter((account) => account.active);
  const activeUserId = session.user.id;
  const canManage = session.user.role === "owner" || session.user.role === "manager";
  const isOwner = session.user.role === "owner";

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["finance-journal-accounts"] });
    void queryClient.invalidateQueries({ queryKey: ["finance-journals"] });
    void queryClient.invalidateQueries({ queryKey: ["finance-journal-activity"] });
    void queryClient.invalidateQueries({ queryKey: ["finance-trial-balance"] });
    void queryClient.invalidateQueries({ queryKey: ["action-center"] });
  }
  function onError(error: unknown, fallback: string) {
    toast.error(errorMessage(error, fallback));
  }

  const addAccountMutation = useMutation({
    mutationFn: () => createFinanceAccount({ code: accountCode.trim(), name: accountName.trim(), type: accountType }),
    onSuccess: () => {
      refresh();
      setAccountCode("");
      setAccountName("");
      toast.success("Account added to this business’s chart.");
    },
    onError: (error) => onError(error, "Could not add the account."),
  });
  const createJournalMutation = useMutation({
    mutationFn: () => createFinanceJournal({
      reference: reference.trim(),
      entryDate,
      description: description.trim(),
      lines: lines.map((line) => ({
        accountId: line.accountId,
        debit: line.debit,
        credit: line.credit,
        memo: line.memo,
      })),
    }),
    onSuccess: () => {
      refresh();
      setReference("");
      setDescription("");
      setLines([
        { localId: 0, accountId: "", debit: "0.00", credit: "0.00" },
        { localId: 1, accountId: "", debit: "0.00", credit: "0.00" },
      ]);
      toast.success("Balanced journal draft saved. Submit it for a second-person review when ready.");
    },
    onError: (error) => onError(error, "Could not save the journal draft."),
  });
  const submitMutation = useMutation({
    mutationFn: submitFinanceJournal,
    onSuccess: () => { refresh(); toast.success("Journal sent to the Action Center for approval."); },
    onError: (error) => onError(error, "Could not submit the journal."),
  });
  const postMutation = useMutation({
    mutationFn: postFinanceJournal,
    onSuccess: () => { refresh(); toast.success("Journal posted to the Noxtill manual ledger."); },
    onError: (error) => onError(error, "Could not post the journal."),
  });
  const reverseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => createFinanceJournalReversal(id, reason),
    onSuccess: () => { refresh(); toast.success("Reversal draft created. Submit it for a second-person review before it can be posted."); },
    onError: (error) => onError(error, "Could not create the reversal draft."),
  });
  const lockMutation = useMutation({
    mutationFn: lockFinancePeriod,
    onSuccess: () => { refresh(); toast.success("Journal posting locked for this month."); },
    onError: (error) => onError(error, "Could not lock journal posting for this month."),
  });

  const currentDebits = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0), [lines]);
  const currentCredits = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0), [lines]);
  const selectedEntryId = searchParams.get("entryId");
  const closedMonth = journalQuery.data?.closedPeriods.find((period) => period.month === month);
  const busy = addAccountMutation.isPending || createJournalMutation.isPending || submitMutation.isPending || postMutation.isPending || reverseMutation.isPending || lockMutation.isPending;

  function updateLine(localId: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => line.localId === localId ? { ...line, ...patch } : line));
  }

  async function requestPeriodLock() {
    const reason = await askText({
      title: `Lock journal posting for ${month}`,
      description: "This permanently blocks new journal posting for the month in Noxtill. It does not certify reconciliation, a bank balance, tax status, or an external accounting close.",
      placeholder: "Required lock reason",
      minLength: 8,
      confirmLabel: "Lock month",
      tone: "danger",
    });
    if (reason !== null) lockMutation.mutate({ month, reason });
  }

  async function requestReversal(entryId: string) {
    const reason = await askText({
      title: "Create a reversing journal draft",
      description: "This creates a new draft dated today with debits and credits swapped. The posted journal stays unchanged; the reversal must be submitted, approved by someone else, and posted separately.",
      placeholder: "Required reason for this correction",
      minLength: 8,
      confirmLabel: "Create draft",
    });
    if (reason !== null) reverseMutation.mutate({ id: entryId, reason });
  }

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-4 p-4 lg:p-6">
      <div className="rounded-[12px] border px-4 py-3 text-[12px] leading-5" style={{ borderColor: "var(--app-warning-border)", background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>
        Manual journal ledger only. It does not import Xero entries, bank statements, opening balances, tax postings, or automatically post sales and expenses. Have an accountant review account setup and entries before relying on them for statutory books.
      </div>

      <section style={panelStyle}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Chart of accounts</h2>
            <p className="mb-0 mt-1 text-[12px]" style={{ color: "var(--app-text-faint)" }}>Accounts are entered by this business. No sample or default accounts are inserted.</p>
          </div>
          {canManage && <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-[120px_minmax(170px,1fr)_150px_auto] lg:w-auto">
            <input aria-label="Account code" value={accountCode} onChange={(event) => setAccountCode(event.target.value)} maxLength={64} placeholder="Code" style={fieldStyle} />
            <input aria-label="Account name" value={accountName} onChange={(event) => setAccountName(event.target.value)} maxLength={191} placeholder="Account name" style={fieldStyle} />
            <select aria-label="Account type" value={accountType} onChange={(event) => setAccountType(event.target.value as FinanceAccountType)} style={fieldStyle}>{ACCOUNT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
            <button type="button" onClick={() => addAccountMutation.mutate()} disabled={busy || !accountCode.trim() || !accountName.trim()} className="rounded-[8px] px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>Add account</button>
          </div>}
        </div>
        {accountQuery.isError && <p role="alert" className="mt-3 text-[12px]" style={{ color: "var(--app-danger-strong)" }}>{errorMessage(accountQuery.error, "Could not load accounts.")}</p>}
        <div className="mt-4 overflow-x-auto">
          {accountQuery.isPending ? <p className="text-[12px]" style={{ color: "var(--app-text-faint)" }}>Loading accounts…</p> : accounts.length === 0 ? <p className="rounded-[9px] border border-dashed p-4 text-[12px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text-faint)" }}>No accounts yet. Add the business’s real account codes and names before creating journal drafts.</p> : <table className="w-full min-w-[560px] text-left text-[12px]">
            <thead><tr className="border-b" style={{ borderColor: "var(--app-border)", color: "var(--app-text-faint)" }}><th className="py-2 pe-3">Code</th><th className="py-2 pe-3">Account</th><th className="py-2 pe-3">Type</th><th className="py-2">Status</th></tr></thead>
            <tbody>{accounts.map((account) => <tr key={account.id} className="border-b last:border-0" style={{ borderColor: "var(--app-border)" }}><td className="py-2.5 pe-3 font-mono">{account.code}</td><td className="py-2.5 pe-3 font-semibold">{account.name}</td><td className="py-2.5 pe-3 capitalize">{account.type}</td><td className="py-2.5">{account.active ? "Active" : "Inactive"}</td></tr>)}</tbody>
          </table>}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,.9fr)]">
        <section style={panelStyle}>
          <h2 className="m-0 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Prepare a journal draft</h2>
          <p className="mb-4 mt-1 text-[12px]" style={{ color: "var(--app-text-faint)" }}>Debits and credits must balance in the business currency ({journalQuery.data?.currencyCode ?? "…"}). Saving a draft does not post it.</p>
          {!canManage && <p role="note" className="rounded-[8px] p-3 text-[12px]" style={{ background: "var(--app-surface-2)", color: "var(--app-text-faint)" }}>Journal editing is limited to owners and managers.</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-[11px] font-semibold">Reference<input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={80} style={fieldStyle} /></label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold">Entry date<input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} style={fieldStyle} /></label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold sm:col-span-3">Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} style={fieldStyle} /></label>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[660px] text-left text-[11px]">
              <thead><tr className="border-b" style={{ borderColor: "var(--app-border)", color: "var(--app-text-faint)" }}><th className="py-2 pe-2">Account</th><th className="py-2 pe-2">Memo</th><th className="py-2 pe-2">Debit</th><th className="py-2 pe-2">Credit</th><th className="py-2"> </th></tr></thead>
              <tbody>{lines.map((line) => <tr key={line.localId} className="border-b last:border-0" style={{ borderColor: "var(--app-border)" }}>
                <td className="py-2 pe-2"><select aria-label="Journal account" value={line.accountId} onChange={(event) => updateLine(line.localId, { accountId: event.target.value })} style={{ ...fieldStyle, width: 200 }}><option value="">Choose account</option>{activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></td>
                <td className="py-2 pe-2"><input aria-label="Line memo" value={line.memo ?? ""} onChange={(event) => updateLine(line.localId, { memo: event.target.value })} maxLength={1000} style={{ ...fieldStyle, width: 160 }} /></td>
                <td className="py-2 pe-2"><input aria-label="Debit amount" inputMode="decimal" value={line.debit} onChange={(event) => updateLine(line.localId, { debit: event.target.value, ...(Number(event.target.value) > 0 ? { credit: "0.00" } : {}) })} style={{ ...fieldStyle, width: 100, textAlign: "right" }} /></td>
                <td className="py-2 pe-2"><input aria-label="Credit amount" inputMode="decimal" value={line.credit} onChange={(event) => updateLine(line.localId, { credit: event.target.value, ...(Number(event.target.value) > 0 ? { debit: "0.00" } : {}) })} style={{ ...fieldStyle, width: 100, textAlign: "right" }} /></td>
                <td className="py-2"><button type="button" disabled={lines.length <= 2} onClick={() => setLines((current) => current.filter((candidate) => candidate.localId !== line.localId))} className="text-[11px] font-semibold disabled:opacity-40" style={{ color: "var(--app-danger-strong)" }}>Remove</button></td>
              </tr>)}</tbody>
              <tfoot><tr style={{ color: "var(--app-text-muted)" }}><td className="pt-3 font-bold" colSpan={2}>Totals</td><td className="pt-3 text-right font-mono">{currentDebits.toFixed(2)}</td><td className="pt-3 text-right font-mono">{currentCredits.toFixed(2)}</td><td /></tr></tfoot>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => { setLines((current) => [...current, { localId: lineId, accountId: "", debit: "0.00", credit: "0.00" }]); setLineId((id) => id + 1); }} disabled={lines.length >= 100} className="rounded-[8px] border px-3 py-2 text-[11px] font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}>Add line</button>
            <button type="button" onClick={() => createJournalMutation.mutate()} disabled={!canManage || busy || activeAccounts.length === 0 || !reference.trim() || description.trim().length < 3 || lines.some((line) => !line.accountId) || Math.round(currentDebits * 100) !== Math.round(currentCredits * 100) || currentDebits <= 0} className="rounded-[8px] px-3.5 py-2 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>Save balanced draft</button>
          </div>
        </section>

        <section style={panelStyle}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="m-0 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Journal ledger</h2><p className="mb-0 mt-1 text-[12px]" style={{ color: "var(--app-text-faint)" }}>Only posted manual entries are part of this ledger.</p></div>
            <input type="month" aria-label="Journal month" value={month} onChange={(event) => setMonth(event.target.value)} style={fieldStyle} />
          </div>
          {journalQuery.error && <p role="alert" className="mt-3 text-[12px]" style={{ color: "var(--app-danger-strong)" }}>{errorMessage(journalQuery.error, "Could not load journals.")}</p>}
          {closedMonth ? <p className="mt-3 rounded-[8px] p-3 text-[12px]" style={{ background: "var(--app-danger-bg)", color: "var(--app-danger-strong)" }}>Journal posting is locked for {closedMonth.month}. Reason: {closedMonth.reason}</p> : isOwner && !journalQuery.isPending && <button type="button" onClick={requestPeriodLock} disabled={busy} className="mt-3 rounded-[8px] border px-3 py-2 text-[11px] font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)", color: "var(--app-danger-strong)" }}>Lock journal posting for {month}</button>}
          {journalQuery.data?.closedPeriods.filter((period) => period.month !== month).map((period) => <p key={period.month} className="mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Posting locked: {period.month} · {period.reason}</p>)}
          <p className="mt-3 text-[11px]" style={{ color: "var(--app-text-faint)" }}>{journalQuery.data?.disclosure}</p>
          {journalQuery.isPending ? <p className="mt-3 text-[12px]">Loading journal entries…</p> : (journalQuery.data?.entries.length ?? 0) === 0 ? <p className="mt-4 rounded-[9px] border border-dashed p-4 text-[12px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text-faint)" }}>No journals recorded for {month}.</p> : <div className="mt-3 flex flex-col gap-3">{journalQuery.data?.entries.map((entry) => <article key={entry.id} id={`journal-${entry.id}`} className="rounded-[10px] border p-3" style={{ borderColor: selectedEntryId === entry.id ? "var(--app-primary)" : "var(--app-border)", background: "var(--app-surface-2)" }}>
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="m-0 text-[13px] font-bold" style={{ color: "var(--app-text)" }}>{entry.reference} · {entry.entryDate.slice(0, 10)}</h3><p className="m-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>{entry.description}</p></div><span className="rounded-full px-2 py-1 text-[10px] font-bold capitalize" style={{ background: entry.status === "posted" ? "var(--app-success-bg)" : "var(--app-surface)", color: entry.status === "posted" ? "var(--app-success-text)" : "var(--app-text-muted)" }}>{entry.status.replaceAll("_", " ")}</span></div>
            {entry.reversalOf && <p className="mb-0 mt-2 text-[10px]" style={{ color: "var(--app-warning-text)" }}>Reversal of {entry.reversalOf.reference}</p>}
            {entry.reversal && <p className="mb-0 mt-2 text-[10px]" style={{ color: "var(--app-text-faint)" }}>Reversed by {entry.reversal.reference} · {entry.reversal.status.replaceAll("_", " ")}</p>}
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]"><span>Debits: {entry.currencyCode} {entry.totalDebits}</span><span>Credits: {entry.currencyCode} {entry.totalCredits}</span></div>
            <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[400px] text-left text-[10px]"><tbody>{entry.lines.map((line) => <tr key={line.id}><td className="py-1 pe-2">{line.accountCode} · {line.accountName}</td><td className="py-1 pe-2 text-right">{Number(line.debit) > 0 ? line.debit : "—"}</td><td className="py-1 text-right">{Number(line.credit) > 0 ? line.credit : "—"}</td></tr>)}</tbody></table></div>
            {entry.reviewReason && <p className="mb-0 mt-2 text-[10px]" style={{ color: "var(--app-text-faint)" }}>Review: {entry.reviewReason}</p>}
            {entry.status === "draft" && canManage && <button type="button" onClick={() => submitMutation.mutate(entry.id)} disabled={busy} className="mt-2 rounded-[7px] px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>Submit for approval</button>}
            {entry.status === "pending_approval" && <p className="mb-0 mt-2 text-[10px]" style={{ color: "var(--app-warning-text)" }}>Waiting in the Dashboard Action Center for another user to review.</p>}
            {entry.status === "approved" && entry.reviewedByUserId === activeUserId && canManage && <button type="button" onClick={() => postMutation.mutate(entry.id)} disabled={busy} className="mt-2 rounded-[7px] px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>Post approved journal</button>}
            {entry.status === "approved" && entry.reviewedByUserId !== activeUserId && <p className="mb-0 mt-2 text-[10px]" style={{ color: "var(--app-text-faint)" }}>Only the reviewer can post this approved journal.</p>}
            {entry.status === "posted" && !entry.reversal && canManage && <button type="button" onClick={() => requestReversal(entry.id)} disabled={busy} className="mt-2 rounded-[7px] border px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)", color: "var(--app-warning-text)" }}>Create reversal draft</button>}
          </article>)}</div>}
          <section aria-label="Cumulative posted journal balances" className="mt-5 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="m-0 text-[13px] font-bold" style={{ color: "var(--app-text)" }}>Partial trial balance</h3>
                <p className="mb-0 mt-1 max-w-[720px] text-[10px]" style={{ color: "var(--app-text-faint)" }}>{trialBalanceQuery.data?.disclosure ?? "Cumulative posted manual journal balances only. Opening balances and external/automatic postings are excluded."}</p>
              </div>
              <label className="flex items-center gap-2 text-[10px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
                As of
                <input aria-label="Trial balance as of date" type="date" value={trialBalanceAsOf} onChange={(event) => setTrialBalanceAsOf(event.target.value)} style={fieldStyle} />
              </label>
            </div>
            {trialBalanceQuery.error && <p role="alert" className="mb-0 mt-2 text-[11px]" style={{ color: "var(--app-danger-strong)" }}>{errorMessage(trialBalanceQuery.error, "Could not load posted journal balances.")}</p>}
            {trialBalanceQuery.isPending ? <p className="mb-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Loading cumulative balances…</p> : trialBalanceQuery.data?.currencies.length === 0 ? <p className="mb-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>No posted manual journal balances exist on or before {trialBalanceAsOf}.</p> : trialBalanceQuery.data?.currencies.map((currency) => <div key={currency.currencyCode} className="mt-3 overflow-x-auto">
              <div className="mb-2 flex flex-wrap justify-between gap-2 text-[10px] font-semibold" style={{ color: currency.balanced ? "var(--app-text-muted)" : "var(--app-danger-strong)" }}><span>{currency.currencyCode} · {currency.balanced ? "debit and credit balances agree" : "debit and credit balances differ"}</span><span>Debit balances {currency.totalDebitBalances} · Credit balances {currency.totalCreditBalances}</span></div>
              <table className="w-full min-w-[460px] text-left text-[10px]"><thead><tr className="border-b" style={{ borderColor: "var(--app-border)", color: "var(--app-text-faint)" }}><th className="py-1 pe-2">Account</th><th className="py-1 pe-2 text-right">Debit balance</th><th className="py-1 text-right">Credit balance</th></tr></thead><tbody>{currency.accounts.map((account) => <tr key={`${currency.currencyCode}-${account.accountId}`} className="border-b last:border-0" style={{ borderColor: "var(--app-border)" }}><td className="py-1.5 pe-2">{account.accountCode} · {account.accountName}</td><td className="py-1.5 pe-2 text-right">{account.debitBalance}</td><td className="py-1.5 text-right">{account.creditBalance}</td></tr>)}</tbody></table>
            </div>)}
          </section>
          <section aria-label="Posted journal activity" className="mt-5 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
            <h3 className="m-0 text-[13px] font-bold" style={{ color: "var(--app-text)" }}>Posted journal activity</h3>
            <p className="mb-0 mt-1 text-[10px]" style={{ color: "var(--app-text-faint)" }}>{activityQuery.data?.disclosure ?? "Period activity only; no ending balance is inferred."}</p>
            {activityQuery.error && <p role="alert" className="mt-2 text-[11px]" style={{ color: "var(--app-danger-strong)" }}>{errorMessage(activityQuery.error, "Could not load posted journal activity.")}</p>}
            {activityQuery.isPending ? <p className="mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Loading posted activity…</p> : activityQuery.data?.currencies.length === 0 ? <p className="mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>No posted manual journal activity for {month}.</p> : activityQuery.data?.currencies.map((currency) => <div key={currency.currencyCode} className="mt-3 overflow-x-auto">
              <div className="mb-2 flex flex-wrap justify-between gap-2 text-[10px] font-semibold" style={{ color: currency.balanced ? "var(--app-text-muted)" : "var(--app-danger-strong)" }}><span>{currency.currencyCode} · {currency.balanced ? "debits and credits balance" : "debits and credits do not balance"}</span><span>Total debits {currency.totalDebits} · Total credits {currency.totalCredits}</span></div>
              <table className="w-full min-w-[460px] text-left text-[10px]"><thead><tr className="border-b" style={{ borderColor: "var(--app-border)", color: "var(--app-text-faint)" }}><th className="py-1 pe-2">Account</th><th className="py-1 pe-2 text-right">Debits</th><th className="py-1 pe-2 text-right">Credits</th><th className="py-1 text-right">Net debit / credit</th></tr></thead><tbody>{currency.accounts.map((account) => <tr key={`${currency.currencyCode}-${account.accountId}`} className="border-b last:border-0" style={{ borderColor: "var(--app-border)" }}><td className="py-1.5 pe-2">{account.accountCode} · {account.accountName}</td><td className="py-1.5 pe-2 text-right">{account.debits}</td><td className="py-1.5 pe-2 text-right">{account.credits}</td><td className="py-1.5 text-right">{account.netDebit !== "0.00" ? `${account.netDebit} Dr` : account.netCredit !== "0.00" ? `${account.netCredit} Cr` : "—"}</td></tr>)}</tbody></table>
            </div>)}
          </section>
        </section>
      </div>
    </div>
  );
}
