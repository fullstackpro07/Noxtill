import { apiFetch } from "@/lib/api-client";

export interface FinanceReconciliationAccount {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface FinanceStatementImport {
  id: string;
  currencyCode: string;
  periodStart: string;
  periodEnd: string;
  rowCount: number;
  createdAt: string;
  account: { id: string; code: string; name: string };
  counts: Record<string, number>;
}

export interface FinanceReconciliationCandidate {
  id: string;
  reference: string;
  entryDate: string;
  debit: string;
  credit: string;
}

export interface FinanceStatementLine {
  id: string;
  lineNumber: number;
  statementDate: string;
  amount: string;
  status: "unmatched" | "matched" | "no_match";
  decisionAt: string | null;
  decisionReason: string | null;
  matchedJournalLine: null | {
    id: string;
    accountCode: string;
    accountName: string;
    debit: string;
    credit: string;
    journalEntry: { reference: string; entryDate: string; currencyCode: string };
  };
  candidates: FinanceReconciliationCandidate[];
}

export interface FinanceStatementDetail {
  statement: Omit<FinanceStatementImport, "counts">;
  lines: FinanceStatementLine[];
  page: number;
  pageSize: number;
  total: number;
  disclosure: string;
}

export function fetchFinanceReconciliationAccounts(): Promise<FinanceReconciliationAccount[]> {
  return apiFetch("/profit/reconciliation/accounts");
}

export function fetchFinanceStatementImports(): Promise<{ imports: FinanceStatementImport[]; disclosure: string }> {
  return apiFetch("/profit/reconciliation/imports");
}

export function fetchFinanceStatementImport(id: string, page: number): Promise<FinanceStatementDetail> {
  return apiFetch(`/profit/reconciliation/imports/${encodeURIComponent(id)}?page=${page}`);
}

export async function downloadFinanceStatementImport(id: string): Promise<void> {
  const result = await apiFetch<{ filename: string; csv: string }>(
    `/profit/reconciliation/imports/${encodeURIComponent(id)}/export`,
  );
  const href = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = href;
  link.download = result.filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function importFinanceStatement(input: { financeAccountId: string; currencyCode: string; csv: string }) {
  return apiFetch<{ id: string; rowCount: number; periodStart: string; periodEnd: string; currencyCode: string }>(
    "/profit/reconciliation/imports",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function acceptFinanceReconciliationMatch(lineId: string, input: { journalLineId: string; reason: string }) {
  return apiFetch(`/profit/reconciliation/lines/${encodeURIComponent(lineId)}/accept`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function rejectFinanceReconciliationSuggestions(lineId: string, reason: string) {
  return apiFetch(`/profit/reconciliation/lines/${encodeURIComponent(lineId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function reopenFinanceReconciliationLine(lineId: string, reason: string) {
  return apiFetch(`/profit/reconciliation/lines/${encodeURIComponent(lineId)}/reopen`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
