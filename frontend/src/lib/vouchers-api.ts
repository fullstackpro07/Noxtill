import { apiFetch } from "@/lib/api-client";

export type VoucherStatus = "active" | "redeemed" | "cancelled";

export interface Voucher {
  id: string;
  code: string;
  customerId: string | null;
  initialValue: string;
  balance: string;
  status: VoucherStatus;
  expiresAt: string | null;
  createdAt: string;
}

export interface IssueVoucherInput {
  code?: string;
  customerId?: string;
  value: number;
  expiresAt?: string;
}

export function fetchVouchers(): Promise<Voucher[]> {
  return apiFetch<Voucher[]>("/vouchers");
}

export function issueVoucher(input: IssueVoucherInput): Promise<Voucher> {
  return apiFetch<Voucher>("/vouchers", { method: "POST", body: JSON.stringify(input) });
}

export function cancelVoucher(id: string): Promise<Voucher> {
  return apiFetch<Voucher>(`/vouchers/${id}/cancel`, { method: "PATCH" });
}
