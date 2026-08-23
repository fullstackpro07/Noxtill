import { apiFetch } from "@/lib/api-client";
import type { CreditReminderTone } from "@/lib/credit-api";

export const CREDIT_REMINDER_TEMPLATE_OPTIONS: { tone: CreditReminderTone; label: string; preview: string }[] = [
  { tone: "gentle", label: "Gentle", preview: "Hi {{customerName}}, a friendly reminder that you have an outstanding balance of {{balance}}." },
  { tone: "firm", label: "Firm", preview: "Hi {{customerName}}, your balance of {{balance}} is still outstanding — please settle it as soon as you can." },
  { tone: "final", label: "Final notice", preview: "Hi {{customerName}}, this is a final notice — your balance of {{balance}} remains unpaid. Please contact us immediately to settle it." },
];

export interface CreditReminderRule {
  id: string;
  daysOverdueTrigger: number;
  tone: CreditReminderTone;
  channel: "whatsapp" | "sms" | "email" | null;
  customMessage: string | null;
  active: boolean;
  createdAt: string;
}

export function fetchCreditReminderRules(): Promise<CreditReminderRule[]> {
  return apiFetch<CreditReminderRule[]>("/credit/reminder-rules");
}

export interface CreateCreditReminderRuleInput {
  daysOverdueTrigger: number;
  tone?: CreditReminderTone;
  channel?: "whatsapp" | "sms" | "email";
  customMessage?: string;
  active?: boolean;
}

export function createCreditReminderRule(input: CreateCreditReminderRuleInput): Promise<CreditReminderRule> {
  return apiFetch<CreditReminderRule>("/credit/reminder-rules", { method: "POST", body: JSON.stringify(input) });
}

export function updateCreditReminderRule(id: string, input: Partial<CreateCreditReminderRuleInput>): Promise<CreditReminderRule> {
  return apiFetch<CreditReminderRule>(`/credit/reminder-rules/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteCreditReminderRule(id: string): Promise<void> {
  return apiFetch(`/credit/reminder-rules/${id}`, { method: "DELETE" });
}

export function testSendCreditReminderRule(id: string, target: { phone?: string; email?: string }): Promise<void> {
  return apiFetch(`/credit/reminder-rules/${id}/test-send`, { method: "POST", body: JSON.stringify(target) });
}

export interface RecoveryStage {
  ruleId: string;
  daysOverdueTrigger: number;
  tone: CreditReminderTone;
  remindedCount: number;
  recoveredCount: number;
  recoveryRate: number;
}

export function fetchRecoveryRateByStage(): Promise<RecoveryStage[]> {
  return apiFetch<RecoveryStage[]>("/credit/reminder-rules/recovery-rate-by-stage");
}
