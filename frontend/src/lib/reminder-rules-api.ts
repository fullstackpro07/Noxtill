import { apiFetch } from "@/lib/api-client";

export type ReminderChannel = "whatsapp" | "sms" | "email";

export const REMINDER_TEMPLATE_OPTIONS: { key: string; label: string; preview: string }[] = [
  { key: "booking_reminder", label: "Standard", preview: "Reminder: {{customerName}}, your {{serviceName}} appointment is at {{dateTime}}." },
  {
    key: "booking_reminder_urgent",
    label: "Urgent (close to appointment)",
    preview: "Coming up soon: {{customerName}}, your {{serviceName}} appointment starts at {{dateTime}}. See you shortly!",
  },
];

export interface ReminderRule {
  id: string;
  offsetHours: number;
  channel: ReminderChannel | null;
  templateKey: string;
  customMessage: string | null;
  active: boolean;
  createdAt: string;
}

export function fetchReminderRules(): Promise<ReminderRule[]> {
  return apiFetch<ReminderRule[]>("/reminder-rules");
}

export interface CreateReminderRuleInput {
  offsetHours: number;
  channel?: ReminderChannel;
  templateKey?: string;
  customMessage?: string;
  active?: boolean;
}

export function createReminderRule(input: CreateReminderRuleInput): Promise<ReminderRule> {
  return apiFetch<ReminderRule>("/reminder-rules", { method: "POST", body: JSON.stringify(input) });
}

export function updateReminderRule(id: string, input: Partial<CreateReminderRuleInput>): Promise<ReminderRule> {
  return apiFetch<ReminderRule>(`/reminder-rules/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteReminderRule(id: string): Promise<void> {
  return apiFetch(`/reminder-rules/${id}`, { method: "DELETE" });
}

export function testSendReminderRule(id: string, target: { phone?: string; email?: string }): Promise<void> {
  return apiFetch(`/reminder-rules/${id}/test-send`, { method: "POST", body: JSON.stringify(target) });
}
