import { apiFetch } from "@/lib/api-client";

export type DepositStatus = "pending" | "captured" | "refunded" | "forfeited";
export type DepositMethod = "cash" | "card" | "online";

interface RawDeposit {
  id: string;
  appointmentId: string;
  amount: string;
  method: DepositMethod;
  status: DepositStatus;
  createdAt: string;
  appointment: {
    startsAt: string;
    customer: { name: string };
    service: { name: string };
  };
}

export interface Deposit {
  id: string;
  appointmentId: string;
  amount: string;
  method: DepositMethod;
  status: DepositStatus;
  createdAt: string;
  customerName: string;
  serviceName: string;
  appointmentStartsAt: string;
}

function toDeposit(raw: RawDeposit): Deposit {
  return {
    id: raw.id,
    appointmentId: raw.appointmentId,
    amount: raw.amount,
    method: raw.method,
    status: raw.status,
    createdAt: raw.createdAt,
    customerName: raw.appointment.customer.name,
    serviceName: raw.appointment.service.name,
    appointmentStartsAt: raw.appointment.startsAt,
  };
}

export async function fetchDeposits(appointmentId?: string): Promise<Deposit[]> {
  const query = appointmentId ? `?appointmentId=${appointmentId}` : "";
  const raw = await apiFetch<RawDeposit[]>(`/deposits${query}`);
  return raw.map(toDeposit);
}

export interface CreateDepositInput {
  appointmentId: string;
  amount: number;
  method: DepositMethod;
}

/** These three write endpoints don't include the appointment→customer/service relation the way
 * `list()` does — callers invalidate the `deposits` query and re-fetch the full row rather than
 * reading customer/service off this minimal result. */
export interface DepositActionResult {
  id: string;
  appointmentId: string;
  amount: string;
  method: DepositMethod;
  status: DepositStatus;
  createdAt: string;
}

export function createDeposit(input: CreateDepositInput): Promise<DepositActionResult> {
  return apiFetch<DepositActionResult>("/deposits", { method: "POST", body: JSON.stringify(input) });
}

export function captureDeposit(id: string): Promise<DepositActionResult> {
  return apiFetch<DepositActionResult>(`/deposits/${id}/capture`, { method: "POST" });
}

export function refundDeposit(id: string): Promise<DepositActionResult> {
  return apiFetch<DepositActionResult>(`/deposits/${id}/refund`, { method: "POST" });
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
