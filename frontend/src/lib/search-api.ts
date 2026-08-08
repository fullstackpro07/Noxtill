import { apiFetch } from "@/lib/api-client";
import { formatDate, formatTime } from "@/lib/format";

export type SearchCategory = "customers" | "products" | "orders" | "appointments" | "credit";

export interface SearchResult {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string;
  href: string;
}

export const CATEGORY_LABELS: Record<SearchCategory, string> = {
  customers: "Customers",
  products: "Products",
  orders: "Orders",
  appointments: "Appointments",
  credit: "Credit",
};

interface RawSearchResponse {
  customers: { id: string; name: string; phone: string }[];
  products: { id: string; name: string }[];
  orders: { id: string; orderNo: number }[];
  appointments: { id: string; serviceName: string; customerName: string; startsAt: string }[];
  credit: { customerId: string; name: string; balance: number }[];
}

/** GET /search?q= — real pg_trgm cross-entity search (BE-070); categories differ from the old mock (no bookings/reviews/expenses groups, adds credit). */
export async function fetchSearch(query: string): Promise<SearchResult[]> {
  const raw = await apiFetch<RawSearchResponse>(`/search?q=${encodeURIComponent(query)}`);
  return [
    ...raw.customers.map((c) => ({
      id: c.id,
      category: "customers" as const,
      title: c.name,
      subtitle: c.phone,
      href: `/customers/${c.id}`,
    })),
    ...raw.products.map((p) => ({
      id: p.id,
      category: "products" as const,
      title: p.name,
      subtitle: "",
      href: "/products",
    })),
    ...raw.orders.map((o) => ({
      id: o.id,
      category: "orders" as const,
      title: `Order #${o.orderNo}`,
      subtitle: "",
      href: "/orders",
    })),
    ...raw.appointments.map((a) => ({
      id: a.id,
      category: "appointments" as const,
      title: a.customerName,
      subtitle: `${a.serviceName} — ${formatDate(a.startsAt)} ${formatTime(a.startsAt)}`,
      href: "/bookings",
    })),
    ...raw.credit.map((c) => ({
      id: c.customerId,
      category: "credit" as const,
      title: c.name,
      subtitle: `Balance: ${c.balance}`,
      href: "/credit",
    })),
  ];
}

export function groupResults(results: SearchResult[]): { category: SearchCategory; results: SearchResult[] }[] {
  const categories: SearchCategory[] = ["customers", "products", "orders", "appointments", "credit"];
  return categories
    .map((category) => ({ category, results: results.filter((r) => r.category === category) }))
    .filter((g) => g.results.length > 0);
}
