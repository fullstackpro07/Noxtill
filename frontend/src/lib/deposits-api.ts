import { apiFetch } from "@/lib/api-client";

export type DepositStatus = "pending" | "captured" | "refunded" | "forfeited";
export type DepositMethod = "cash" | "card" | "online";

export interface Deposit {
  id: string;
  appointmentId: string;
  amount: string;
  method: DepositMethod;
  status: DepositStatus;
  createdAt: string;
}

export function fetchDeposits(appointmentId?: string): Promise<Deposit[]> {
  const query = appointmentId ? `?appointmentId=${appointmentId}` : "";
  return apiFetch<Deposit[]>(`/deposits${query}`);
}

export interface CreateDepositInput {
  appointmentId: string;
  amount: number;
  method: DepositMethod;
}

export function createDeposit(input: CreateDepositInput): Promise<Deposit> {
  return apiFetch<Deposit>("/deposits", { method: "POST", body: JSON.stringify(input) });
}

export function captureDeposit(id: string): Promise<Deposit> {
  return apiFetch<Deposit>(`/deposits/${id}/capture`, { method: "POST" });
}

export function refundDeposit(id: string): Promise<Deposit> {
  return apiFetch<Deposit>(`/deposits/${id}/refund`, { method: "POST" });
}

export type DepositAmountType = "flat" | "percent";

export interface DepositSettings {
  required: boolean;
  triggerAfterNoShows: number | null;
  amountType: DepositAmountType;
  amountValue: number | string;
  applicableServiceIds: string[];
}

export function fetchDepositSettings(): Promise<DepositSettings> {
  return apiFetch<DepositSettings>("/deposits/settings");
}

export function updateDepositSettings(input: Partial<DepositSettings>): Promise<DepositSettings> {
  return apiFetch<DepositSettings>("/deposits/settings", { method: "PATCH", body: JSON.stringify(input) });
}
