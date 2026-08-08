import { apiFetch } from "@/lib/api-client";

export interface LiveDebtor {
  customerId: string;
  name: string;
  phone: string;
  balance: number;
  daysOutstanding: number;
  optedOutOfReminders: boolean;
}

/** GET /credit — from v_credit_balances, only customers with balance > 0. */
export function fetchDebtors(): Promise<LiveDebtor[]> {
  return apiFetch<LiveDebtor[]>("/credit");
}

export interface RecordPaymentInput {
  customerId: string;
  amount: number;
  method: "cash" | "card" | "online";
  note?: string;
}

export interface RecordPaymentResult {
  balanceBefore: number;
  balanceAfter: number;
}

export function recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
  return apiFetch<RecordPaymentResult>("/credit/payments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface RemindResult {
  sent: number;
  skipped: number;
}

export function remindCustomer(customerId: string): Promise<RemindResult> {
  return apiFetch<RemindResult>("/credit/remind", {
    method: "POST",
    body: JSON.stringify({ customerId }),
  });
}

export function remindAllDebtors(): Promise<RemindResult> {
  return apiFetch<RemindResult>("/credit/remind", {
    method: "POST",
    body: JSON.stringify({ all: true }),
  });
}

export interface LedgerEntry {
  id: string;
  date: string;
  kind: "credit" | "payment";
  amount: number;
  note: string | null;
  runningBalance: number;
}

export interface Ledger {
  customerId: string;
  name: string;
  phone: string;
  balance: number;
  entries: LedgerEntry[];
}

/** GET /credit/:customer/entries — same rows the PDF statement renders, as JSON, for the inline preview. */
export function fetchLedger(customerId: string): Promise<Ledger> {
  return apiFetch<Ledger>(`/credit/${customerId}/entries`);
}

/** GET /credit/:customer/statement — renders+uploads the khata-style PDF and hands back a signed URL. */
export function generateStatement(customerId: string): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(`/credit/${customerId}/statement`);
}
