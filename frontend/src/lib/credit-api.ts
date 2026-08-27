import { apiFetch } from "@/lib/api-client";

export interface LiveDebtor {
  customerId: string;
  name: string;
  phone: string;
  balance: number;
  daysOutstanding: number;
  optedOutOfReminders: boolean;
}

/** GET /credit — from v_credit_balances, only customers with balance > 0. `sort=overdue` for the Outstanding screen's urgency ordering. */
export function fetchDebtors(sort?: "balance" | "overdue"): Promise<LiveDebtor[]> {
  const query = sort ? `?sort=${sort}` : "";
  return apiFetch<LiveDebtor[]>(`/credit${query}`);
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

export type CreditReminderTone = "gentle" | "firm" | "final";

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

/** Outstanding/Overdue screens' bulk-remind-selected, with an optional real escalation tone. */
export function bulkRemindDebtors(customerIds: string[], tone?: CreditReminderTone): Promise<RemindResult> {
  return apiFetch<RemindResult>("/credit/bulk-remind", {
    method: "POST",
    body: JSON.stringify({ customerIds, tone }),
  });
}

export interface LedgerEntry {
  id: string;
  date: string;
  kind: "credit" | "payment" | "write_off";
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

/** GET /credit/:customer/statement — renders+uploads the Record Book-style PDF and hands back a signed URL. */
export function generateStatement(customerId: string): Promise<{ url: string }> {
  return apiFetch<{ url: string }>(`/credit/${customerId}/statement`);
}

/** POST /credit/:customer/statement/send — generates the PDF and sends the link via the customer's own channel preference. */
export function sendStatement(customerId: string): Promise<unknown> {
  return apiFetch(`/credit/${customerId}/statement/send`, { method: "POST" });
}

export interface BulkStatementResult {
  customerId: string;
  url: string | null;
}

export function bulkGenerateStatements(customerIds: string[]): Promise<BulkStatementResult[]> {
  return apiFetch<BulkStatementResult[]>("/credit/bulk-statements", {
    method: "POST",
    body: JSON.stringify({ customerIds }),
  });
}

export interface OverdueBucket {
  key: "current" | "thirtyPlus" | "sixtyPlus" | "ninetyPlus";
  count: number;
  total: number;
}

export interface OverdueAgeing {
  buckets: OverdueBucket[];
  atRisk: { count: number; total: number; debtors: LiveDebtor[] };
}

export function fetchOverdueAgeing(): Promise<OverdueAgeing> {
  return apiFetch<OverdueAgeing>("/credit/overdue");
}

export function fetchCollectedToday(): Promise<number> {
  return apiFetch<number>("/credit/collected-today");
}

export interface RecoveryReportTrendPoint {
  month: string;
  extended: number;
  recovered: number;
  writtenOff: number;
  recoveryRate: number;
}

export interface RecoveryReport {
  months: number;
  extended: number;
  recovered: number;
  recoveryRate: number;
  writtenOff: number;
  netExposure: number;
  trend: RecoveryReportTrendPoint[];
}

export function fetchRecoveryReport(months?: number): Promise<RecoveryReport> {
  const query = months ? `?months=${months}` : "";
  return apiFetch<RecoveryReport>(`/credit/recovery-report${query}`);
}

export interface InstallmentLine {
  id: string;
  seq: number;
  amount: string;
  dueDate: string;
  status: "pending" | "paid" | "cancelled";
  paidAt: string | null;
}

export interface InstallmentPlan {
  id: string;
  customerId: string;
  totalAmount: string;
  status: "active" | "completed" | "cancelled";
  note: string | null;
  installments: InstallmentLine[];
  createdAt: string;
}

export interface CreatePlanInput {
  totalAmount: number;
  note?: string;
  installments: { amount: number; dueDate: string }[];
}

export function createInstallmentPlan(customerId: string, input: CreatePlanInput): Promise<InstallmentPlan> {
  return apiFetch<InstallmentPlan>(`/credit/${customerId}/installment-plan`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchInstallmentPlans(customerId: string): Promise<InstallmentPlan[]> {
  return apiFetch<InstallmentPlan[]>(`/credit/${customerId}/installment-plans`);
}

interface RawDueInstallment {
  id: string;
  seq: number;
  amount: string;
  dueDate: string;
  status: "pending" | "paid" | "cancelled";
  plan: { customer: { id: string; name: string; phone: string } };
}

export interface DueInstallment {
  id: string;
  seq: number;
  amount: number;
  dueDate: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
}

function toDueInstallment(raw: RawDueInstallment): DueInstallment {
  return {
    id: raw.id,
    seq: raw.seq,
    amount: Number(raw.amount),
    dueDate: raw.dueDate,
    customerId: raw.plan.customer.id,
    customerName: raw.plan.customer.name,
    customerPhone: raw.plan.customer.phone,
  };
}

export async function fetchInstallments(due?: "today"): Promise<DueInstallment[]> {
  const query = due ? `?due=${due}` : "";
  const raw = await apiFetch<RawDueInstallment[]>(`/installments${query}`);
  return raw.map(toDueInstallment);
}

export function payInstallment(id: string): Promise<unknown> {
  return apiFetch(`/installments/${id}/pay`, { method: "POST" });
}

export function rescheduleInstallment(id: string, dueDate: string, reason: string): Promise<unknown> {
  return apiFetch(`/installments/${id}/reschedule`, {
    method: "PATCH",
    body: JSON.stringify({ dueDate, reason }),
  });
}

export interface CreditShareLink {
  id: string;
  token: string;
  revoked: boolean;
  createdAt: string;
}

export function createShareLink(customerId: string): Promise<CreditShareLink> {
  return apiFetch<CreditShareLink>(`/credit/${customerId}/share-link`, { method: "POST" });
}

export function fetchShareLinks(customerId: string): Promise<CreditShareLink[]> {
  return apiFetch<CreditShareLink[]>(`/credit/${customerId}/share-links`);
}

export function revokeShareLink(id: string): Promise<CreditShareLink> {
  return apiFetch<CreditShareLink>(`/credit/share-link/${id}/revoke`, { method: "POST" });
}

export interface WriteOffInput {
  amount: number;
  reason: string;
  confirm: string;
}

export interface WriteOffResult {
  balanceBefore: number;
  balanceAfter: number;
}

export function writeOffCredit(customerId: string, input: WriteOffInput): Promise<WriteOffResult> {
  return apiFetch<WriteOffResult>(`/credit/${customerId}/write-off`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
