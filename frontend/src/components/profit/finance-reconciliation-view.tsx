"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Download, FileUp, RefreshCw, RotateCcw, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { askText } from "@/lib/ask-dialog";
import { useSession } from "@/lib/session";
import { FinancialAgentQuickReview } from "@/components/profit/financial-agent-quick-review";
import {
  acceptFinanceReconciliationMatch,
  downloadFinanceStatementImport,
  fetchFinanceReconciliationAccounts,
  fetchFinanceStatementImport,
  fetchFinanceStatementImports,
  importFinanceStatement,
  rejectFinanceReconciliationSuggestions,
  reopenFinanceReconciliationLine,
} from "@/lib/finance-reconciliation-api";

const panelStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 14,
  background: "var(--app-surface)",
  padding: 18,
};
const fieldStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 8,
  padding: "9px 10px",
  background: "var(--app-surface)",
  color: "var(--app-text)",
  fontSize: 12,
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function FinanceReconciliationView() {
  const session = useSession();
  const queryClient = useQueryClient();
  const [selectedImportId, setSelectedImportId] = useState("");
  const [page, setPage] = useState(1);
  const [financeAccountId, setFinanceAccountId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const [exporting, setExporting] = useState(false);
  const canManage = session.user.role === "owner" || session.user.role === "manager";
  const accountsQuery = useQuery({ queryKey: ["finance-reconciliation-accounts"], queryFn: fetchFinanceReconciliationAccounts });
  const importsQuery = useQuery({ queryKey: ["finance-reconciliation-imports"], queryFn: fetchFinanceStatementImports });
  const detailQuery = useQuery({
    queryKey: ["finance-reconciliation-import", selectedImportId, page],
    queryFn: () => fetchFinanceStatementImport(selectedImportId, page),
    enabled: Boolean(selectedImportId),
  });
  const accounts = accountsQuery.data ?? [];
  const imports = importsQuery.data?.imports ?? [];
  const detail = detailQuery.data;
  const totalPages = detail ? Math.max(1, Math.ceil(detail.total / detail.pageSize)) : 1;

  function refresh(importId = selectedImportId) {
    void queryClient.invalidateQueries({ queryKey: ["finance-reconciliation-imports"] });
    if (importId) void queryClient.invalidateQueries({ queryKey: ["finance-reconciliation-import", importId] });
  }
  function fail(error: unknown, fallback: string) {
    toast.error(errorMessage(error, fallback));
  }

  async function exportSelectedImport() {
    if (!selectedImportId) return;
    setExporting(true);
    try {
      await downloadFinanceStatementImport(selectedImportId);
      toast.success("Reconciliation review CSV downloaded.");
    } catch (error) {
      fail(error, "Could not export this statement review.");
    } finally {
      setExporting(false);
    }
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file || !financeAccountId || !/^[A-Za-z]{3}$/.test(currencyCode.trim())) {
        throw new Error("Choose an account, enter a 3-letter currency, and select a CSV file.");
      }
      if (file.size > 500_000) throw new Error("CSV files must be 500 KB or smaller.");
      return importFinanceStatement({ financeAccountId, currencyCode: currencyCode.trim().toUpperCase(), csv: await file.text() });
    },
    onSuccess: (created) => {
      setFile(null);
      setFormError("");
      setSelectedImportId(created.id);
      setPage(1);
      refresh(created.id);
      toast.success(`${created.rowCount} statement lines imported for human review.`);
    },
    onError: (error) => {
      const message = errorMessage(error, "Could not import this statement.");
      setFormError(message);
      toast.error(message);
    },
  });

  const acceptMutation = useMutation({
    mutationFn: ({ lineId, journalLineId, reason }: { lineId: string; journalLineId: string; reason: string }) =>
      acceptFinanceReconciliationMatch(lineId, { journalLineId, reason }),
    onSuccess: () => { refresh(); toast.success("Match accepted and recorded in the audit log."); },
    onError: (error) => fail(error, "Could not accept this match."),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ lineId, reason }: { lineId: string; reason: string }) => rejectFinanceReconciliationSuggestions(lineId, reason),
    onSuccess: () => { refresh(); toast.success("Suggestions rejected with a reason."); },
    onError: (error) => fail(error, "Could not reject these suggestions."),
  });
  const reopenMutation = useMutation({
    mutationFn: ({ lineId, reason }: { lineId: string; reason: string }) => reopenFinanceReconciliationLine(lineId, reason),
    onSuccess: () => { refresh(); toast.success("Statement line reopened for review."); },
    onError: (error) => fail(error, "Could not reopen this line."),
  });

  async function accept(lineId: string, journalLineId: string) {
    const reason = await askText({
      title: "Accept this suggested match",
      description: "This records your decision only. The posted journal will not be edited.",
      placeholder: "Why does this statement line match?",
      minLength: 8,
      confirmLabel: "Accept match",
    });
    if (reason) acceptMutation.mutate({ lineId, journalLineId, reason });
  }
  async function reject(lineId: string) {
    const reason = await askText({
      title: "Reject all suggestions for this line",
      description: "The line will remain unresolved as no match. Add a reason for the audit trail.",
      placeholder: "Why are these suggestions incorrect?",
      minLength: 8,
      confirmLabel: "Reject suggestions",
      tone: "danger",
    });
    if (reason) rejectMutation.mutate({ lineId, reason });
  }
  async function reopen(lineId: string) {
    const reason = await askText({
      title: "Reopen this matched line",
      description: "This removes the Noxtill match record only. It does not change the journal.",
      placeholder: "Why should this match be reopened?",
      minLength: 8,
      confirmLabel: "Reopen line",
    });
    if (reason) reopenMutation.mutate({ lineId, reason });
  }

  return (
    <main className="flex flex-col gap-4 px-[22px] pb-8 pt-5">
      <section style={panelStyle}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="m-0 text-[19px] font-extrabold" style={{ color: "var(--app-text)" }}>Bank Statement Review</h1>
            <p className="mb-0 mt-1 max-w-[800px] text-[13px]" style={{ color: "var(--app-text-muted)" }}>
              Review possible matches between an imported bank statement and posted Noxtill manual journal lines. Each suggestion needs a human decision.
            </p>
          </div>
          <button type="button" onClick={() => refresh()} className="flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-bold" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}>
            <RefreshCw size={14} aria-hidden /> Refresh
          </button>
        </div>
        <div className="mt-4 rounded-[9px] p-3 text-[11.5px] leading-5" style={{ background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>
          {importsQuery.data?.disclosure ?? "No bank statement has been imported yet. Suggestions will use exact account, currency and signed-amount matches within three calendar days. They are not reconciled until a person accepts them."}
        </div>
      </section>

      <section style={panelStyle}>
        <h2 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Import a statement CSV</h2>
        <p className="mb-0 mt-1 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>Required columns: date and amount. Dates must be YYYY-MM-DD. Amounts must be signed decimals. Other columns are ignored and not saved.</p>
        {canManage ? <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[200px] flex-col gap-1 text-[10.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>
            Finance account
            <select value={financeAccountId} onChange={(event) => setFinanceAccountId(event.target.value)} style={fieldStyle}>
              <option value="">Select active account</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name} · {account.type}</option>)}
            </select>
          </label>
          <label className="flex w-[118px] flex-col gap-1 text-[10.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>
            Currency
            <input value={currencyCode} maxLength={3} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} placeholder="USD" style={fieldStyle} />
          </label>
          <label className="flex min-w-[210px] flex-col gap-1 text-[10.5px] font-bold" style={{ color: "var(--app-text-muted)" }}>
            CSV file
            <input type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="max-w-[280px] text-[11px]" />
          </label>
          <button type="button" disabled={importMutation.isPending || accounts.length === 0} onClick={() => importMutation.mutate()} className="flex h-[37px] items-center gap-2 rounded-lg px-3 text-xs font-extrabold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
            <FileUp size={14} aria-hidden /> {importMutation.isPending ? "Importing…" : "Import for review"}
          </button>
        </div> : <p className="mb-0 mt-3 text-[12px]" style={{ color: "var(--app-text-muted)" }}>Only owners and managers with Finance journal access can import or decide matches.</p>}
        {(formError || accountsQuery.error) && <p role="alert" className="mb-0 mt-2 text-[11.5px]" style={{ color: "var(--app-danger-strong)" }}>{formError || errorMessage(accountsQuery.error, "Could not load finance accounts.")}</p>}
        {!accountsQuery.isPending && accounts.length === 0 && <p className="mb-0 mt-3 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>No active finance accounts exist. Add the business’s real chart of accounts in Journals & Accounts before importing a statement.</p>}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.7fr)]">
        <section style={panelStyle}>
          <h2 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Imports</h2>
          {importsQuery.isPending ? <p className="mb-0 mt-3 text-[12px]">Loading statement imports…</p> : imports.length === 0 ? <p className="mb-0 mt-3 rounded-lg border border-dashed p-3 text-[12px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text-faint)" }}>No statement imports recorded for this business.</p> : <div className="mt-3 flex flex-col gap-2">
            {imports.map((item) => <button key={item.id} type="button" onClick={() => { setSelectedImportId(item.id); setPage(1); }} className="rounded-lg border p-3 text-left" style={{ borderColor: selectedImportId === item.id ? "var(--app-primary)" : "var(--app-border)", background: selectedImportId === item.id ? "var(--app-primary-soft)" : "var(--app-surface)" }}>
              <span className="block text-[12px] font-bold" style={{ color: "var(--app-text)" }}>{item.account.code} · {item.account.name}</span>
              <span className="mt-1 block text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>{item.periodStart.slice(0, 10)} — {item.periodEnd.slice(0, 10)} · {item.currencyCode}</span>
              <span className="mt-1 block text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>{item.rowCount} lines · {item.counts.matched ?? 0} matched · {item.counts.unmatched ?? 0} awaiting review · {item.counts.no_match ?? 0} no match</span>
            </button>)}
          </div>}
          {importsQuery.error && <p role="alert" className="mb-0 mt-3 text-[11px]" style={{ color: "var(--app-danger-strong)" }}>{errorMessage(importsQuery.error, "Could not load statement imports.")}</p>}
        </section>

        <section style={panelStyle}>
          {!selectedImportId ? <div className="py-8 text-center text-[12px]" style={{ color: "var(--app-text-faint)" }}>Select an import to review its statement lines and match suggestions.</div> : detailQuery.isPending ? <p className="mb-0 text-[12px]">Loading statement lines…</p> : detailQuery.error ? <p role="alert" className="mb-0 text-[12px]" style={{ color: "var(--app-danger-strong)" }}>{errorMessage(detailQuery.error, "Could not load this import.")}</p> : detail && <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="m-0 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>{detail.statement.account.code} · {detail.statement.account.name}</h2>
                <p className="mb-0 mt-1 text-[11px]" style={{ color: "var(--app-text-muted)" }}>{detail.statement.rowCount} lines · {detail.statement.currencyCode} · imported {new Date(detail.statement.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={exportSelectedImport} disabled={exporting} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[10px] font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}>
                  <Download size={12} aria-hidden /> {exporting ? "Exporting…" : "Export review CSV"}
                </button>
                <span className="text-[10px]" style={{ color: "var(--app-text-faint)" }}>Page {detail.page} of {totalPages}</span>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {detail.lines.map((line) => <article key={line.id} className="rounded-lg border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[12px] font-extrabold" style={{ color: "var(--app-text)" }}>{line.statementDate.slice(0, 10)} · {line.amount} {detail.statement.currencyCode}</span>
                    <span className="ml-2 text-[10px]" style={{ color: "var(--app-text-faint)" }}>Statement line {line.lineNumber}</span>
                  </div>
                  <span className="rounded-full px-2 py-1 text-[9.5px] font-bold uppercase" style={{ background: line.status === "matched" ? "var(--app-success-bg)" : line.status === "no_match" ? "var(--app-warning-bg)" : "var(--app-surface)" , color: line.status === "matched" ? "var(--app-success-text)" : line.status === "no_match" ? "var(--app-warning-text)" : "var(--app-text-muted)" }}>{line.status === "no_match" ? "No match recorded" : line.status}</span>
                </div>
                {line.matchedJournalLine && <div className="mt-2 rounded-md p-2 text-[10.5px]" style={{ background: "var(--app-success-bg)", color: "var(--app-success-text)" }}>
                  Matched to {line.matchedJournalLine.journalEntry.reference} · {line.matchedJournalLine.journalEntry.entryDate.slice(0, 10)} · {line.matchedJournalLine.accountCode} {line.matchedJournalLine.accountName} · debit {line.matchedJournalLine.debit} / credit {line.matchedJournalLine.credit}
                  {line.decisionReason && <span className="block mt-1">Decision reason: {line.decisionReason}</span>}
                  {canManage && <button type="button" onClick={() => reopen(line.id)} disabled={reopenMutation.isPending} className="mt-2 inline-flex items-center gap-1 rounded border px-2 py-1 font-bold" style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}><RotateCcw size={12} aria-hidden /> Reopen</button>}
                </div>}
                {line.status === "no_match" && <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  {line.decisionReason && <p className="mb-0 text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>Decision reason: {line.decisionReason}</p>}
                  {canManage && <button type="button" onClick={() => reopen(line.id)} disabled={reopenMutation.isPending} className="inline-flex items-center gap-1 rounded border px-2 py-1 font-bold" style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}><RotateCcw size={12} aria-hidden /> Reopen</button>}
                </div>}
                {line.status === "unmatched" && <>
                  {line.candidates.length ? <div className="mt-2 flex flex-col gap-2">
                    {line.candidates.map((candidate) => <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
                      <span className="text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>{candidate.reference} · {candidate.entryDate.slice(0, 10)} · debit {candidate.debit} / credit {candidate.credit}</span>
                      {canManage && <button type="button" onClick={() => accept(line.id, candidate.id)} disabled={acceptMutation.isPending} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-extrabold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}><Check size={12} aria-hidden /> Accept</button>}
                    </div>)}
                  </div> : <p className="mb-0 mt-2 text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>No eligible posted journal line found with this exact amount, account and currency within three days.</p>}
                  {canManage && line.candidates.length > 0 && <button type="button" onClick={() => reject(line.id)} disabled={rejectMutation.isPending} className="mt-2 inline-flex items-center gap-1 rounded border px-2 py-1.5 text-[10px] font-bold" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}><X size={12} aria-hidden /> None of these match</button>}
                </>}
              </article>)}
              {!detail.lines.length && <p className="mb-0 rounded-lg border border-dashed p-4 text-center text-[12px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text-faint)" }}>This import has no lines on this page.</p>}
            </div>
            <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--app-border)" }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="flex items-center gap-1 rounded border px-2 py-1.5 text-[10.5px] disabled:opacity-40" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}><ChevronLeft size={13} aria-hidden /> Previous</button>
              <span className="text-[10.5px]" style={{ color: "var(--app-text-faint)" }}>{detail.total} statement lines</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="flex items-center gap-1 rounded border px-2 py-1.5 text-[10.5px] disabled:opacity-40" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}>Next <ChevronRight size={13} aria-hidden /></button>
            </div>
          </>}
        </section>
      </div>

      <FinancialAgentQuickReview month={new Date().toISOString().slice(0, 7)} />
    </main>
  );
}
