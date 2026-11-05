import { apiFetch } from "@/lib/api-client";

export type FinanceAccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface FinanceAccount {
  id: string;
  code: string;
  name: string;
  type: FinanceAccountType;
  active: boolean;
}

export interface FinanceJournalLineInput {
  accountId: string;
  debit: string;
  credit: string;
  memo?: string;
}

export interface FinanceJournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  memo: string | null;
  debit: string;
  credit: string;
}

export interface FinanceJournalEntry {
  id: string;
  reference: string;
  entryDate: string;
  currencyCode: string;
  description: string;
  status: "draft" | "pending_approval" | "approved" | "rejected" | "posted";
  totalDebits: string;
  totalCredits: string;
  createdByUserId: string;
  submittedAt: string | null;
  reviewedByUserId: string | null;
  reviewReason: string | null;
  reviewedAt: string | null;
  postedByUserId: string | null;
  postedAt: string | null;
  reversalOfId: string | null;
  reversalOf: { id: string; reference: string; status: string } | null;
  reversal: { id: string; reference: string; status: string } | null;
  lines: FinanceJournalLine[];
}

export interface FinanceJournalList {
  currencyCode: string;
  entries: FinanceJournalEntry[];
  closedPeriods: { month: string; reason: string; closedAt: string }[];
  coverage: "manual_journals_only";
  disclosure: string;
}

export interface FinanceJournalActivity {
  month: string;
  coverage: "posted_manual_journal_activity";
  disclosure: string;
  currencies: Array<{
    currencyCode: string;
    totalDebits: string;
    totalCredits: string;
    balanced: boolean;
    accounts: Array<{
      accountId: string;
      accountCode: string;
      accountName: string;
      debits: string;
      credits: string;
      netDebit: string;
      netCredit: string;
    }>;
  }>;
}

export interface FinanceTrialBalance {
  asOf: string;
  coverage: "posted_manual_journals_only";
  disclosure: string;
  currencies: Array<{
    currencyCode: string;
    totalDebitBalances: string;
    totalCreditBalances: string;
    balanced: boolean;
    accounts: Array<{
      accountId: string;
      accountCode: string;
      accountName: string;
      debits: string;
      credits: string;
      debitBalance: string;
      creditBalance: string;
    }>;
  }>;
}

export function fetchFinanceAccounts(): Promise<FinanceAccount[]> {
  return apiFetch("/profit/journals/accounts");
}

export function createFinanceAccount(input: { code: string; name: string; type: FinanceAccountType }): Promise<FinanceAccount> {
  return apiFetch("/profit/journals/accounts", { method: "POST", body: JSON.stringify(input) });
}

export function fetchFinanceJournals(month: string): Promise<FinanceJournalList> {
  return apiFetch(`/profit/journals?month=${encodeURIComponent(month)}`);
}

export function fetchFinanceJournalActivity(month: string): Promise<FinanceJournalActivity> {
  return apiFetch(`/profit/journals/activity?month=${encodeURIComponent(month)}`);
}

export function fetchFinanceTrialBalance(asOf: string): Promise<FinanceTrialBalance> {
  return apiFetch(`/profit/journals/trial-balance?asOf=${encodeURIComponent(asOf)}`);
}

export function createFinanceJournal(input: {
  reference: string;
  entryDate: string;
  description: string;
  lines: FinanceJournalLineInput[];
}): Promise<FinanceJournalEntry> {
  return apiFetch("/profit/journals", { method: "POST", body: JSON.stringify(input) });
}

export function submitFinanceJournal(id: string): Promise<FinanceJournalEntry> {
  return apiFetch(`/profit/journals/${encodeURIComponent(id)}/submit`, { method: "POST" });
}

export function postFinanceJournal(id: string): Promise<FinanceJournalEntry> {
  return apiFetch(`/profit/journals/${encodeURIComponent(id)}/post`, { method: "POST" });
}

export function createFinanceJournalReversal(id: string, reason: string): Promise<FinanceJournalEntry> {
  return apiFetch(`/profit/journals/${encodeURIComponent(id)}/reversal`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function lockFinancePeriod(input: { month: string; reason: string }): Promise<unknown> {
  return apiFetch("/profit/journals/periods/lock", { method: "POST", body: JSON.stringify(input) });
}
