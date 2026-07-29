import { CUSTOMERS } from "@/lib/customers";
import { ORDERS } from "@/lib/orders";
import { PRODUCTS } from "@/lib/products";
import { APPOINTMENTS } from "@/lib/bookings";
import { EXTERNAL_REVIEWS, PRIVATE_FEEDBACK } from "@/lib/reviews";
import { DEBTORS } from "@/lib/credit";
import { EXPENSES } from "@/lib/expenses";

export type SearchCategory = "customers" | "orders" | "products" | "bookings" | "reviews" | "credit" | "expenses";

export interface SearchResult {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string;
  href: string;
}

export const CATEGORY_LABELS: Record<SearchCategory, string> = {
  customers: "Customers",
  orders: "Orders",
  products: "Products",
  bookings: "Bookings",
  reviews: "Reviews",
  credit: "Credit",
  expenses: "Expenses",
};

/** Flattens every module's mock records into one searchable index — real search is GET /search (BE-070, pg_trgm, 150ms budget). */
function buildIndex(): SearchResult[] {
  return [
    ...CUSTOMERS.map((c) => ({ id: c.id, category: "customers" as const, title: c.name, subtitle: c.phone, href: `/customers/${c.id}` })),
    ...ORDERS.map((o) => ({ id: o.id, category: "orders" as const, title: `Order #${o.orderNo}`, subtitle: o.customerName, href: "/orders" })),
    ...PRODUCTS.map((p) => ({ id: p.id, category: "products" as const, title: p.name, subtitle: p.category, href: "/products" })),
    ...APPOINTMENTS.map((a) => ({
      id: a.id,
      category: "bookings" as const,
      title: a.customerName,
      subtitle: `${a.serviceName} — ${a.date}`,
      href: "/bookings",
    })),
    ...EXTERNAL_REVIEWS.map((r) => ({ id: r.id, category: "reviews" as const, title: r.author, subtitle: r.text, href: "/reviews" })),
    ...PRIVATE_FEEDBACK.map((f) => ({ id: f.id, category: "reviews" as const, title: f.customerName, subtitle: f.text, href: "/reviews" })),
    ...DEBTORS.map((d) => ({ id: d.customerId, category: "credit" as const, title: d.name, subtitle: d.phone, href: "/credit" })),
    ...EXPENSES.map((e) => ({ id: e.id, category: "expenses" as const, title: e.description, subtitle: e.category, href: "/expenses" })),
  ];
}

const INDEX = buildIndex();

export function searchAll(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return INDEX.filter((r) => r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q));
}

export function groupResults(results: SearchResult[]): { category: SearchCategory; results: SearchResult[] }[] {
  const categories: SearchCategory[] = ["customers", "orders", "products", "bookings", "reviews", "credit", "expenses"];
  return categories
    .map((category) => ({ category, results: results.filter((r) => r.category === category) }))
    .filter((g) => g.results.length > 0);
}
