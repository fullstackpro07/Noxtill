import { apiFetch } from "@/lib/api-client";

export interface TodayTransaction {
  id: string;
  time: string;
  items: string;
  staffName: string | null;
  method: string | null;
  amount: number;
  status: string;
}

export interface LiveTodayBusiness {
  cards: {
    salesCount: number;
    revenue: number;
    avgTicket: number;
    customersServed: number;
    staffOnDuty: number;
    openOrders: number;
  };
  hourlyRevenue: { hour: number; revenue: number }[];
  paymentMethodSplit: { method: string; amount: number; count: number }[];
  transactions: TodayTransaction[];
}

export interface TodayBusinessFilters {
  staffUserId?: string;
  paymentMethod?: string;
  orderType?: string;
}

/** GET /dashboard/today/detail — staff get only their own transactions (server-enforced). */
export function fetchTodayBusiness(filters?: TodayBusinessFilters): Promise<LiveTodayBusiness> {
  const params = new URLSearchParams();
  if (filters?.staffUserId) params.set("staffUserId", filters.staffUserId);
  if (filters?.paymentMethod) params.set("paymentMethod", filters.paymentMethod);
  if (filters?.orderType) params.set("orderType", filters.orderType);
  const query = params.size ? `?${params.toString()}` : "";
  return apiFetch<LiveTodayBusiness>(`/dashboard/today/detail${query}`);
}
