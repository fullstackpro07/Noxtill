export interface CustomerLookup {
  id: string;
  name: string;
  phone: string;
  creditBalance: number;
}

/** Minimal mock set for the POS credit lookup — full CRM (search, tags, profile) is FE-020/FE-021. */
export const CUSTOMERS: CustomerLookup[] = [
  { id: "c1", name: "Priya Nair", phone: "+1 555 013 2210", creditBalance: 0 },
  { id: "c2", name: "Devon Marsh", phone: "+1 555 013 8842", creditBalance: 62 },
  { id: "c3", name: "Casey Nolan", phone: "+1 555 013 1190", creditBalance: 0 },
  { id: "c4", name: "Lena Fischer", phone: "+1 555 013 4471", creditBalance: 145 },
  { id: "c5", name: "Tariq Malik", phone: "+1 555 013 9902", creditBalance: 0 },
];

export function findCustomerByPhone(query: string): CustomerLookup | undefined {
  const q = query.trim();
  if (!q) return undefined;
  return CUSTOMERS.find((c) => c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")) || c.name.toLowerCase().includes(q.toLowerCase()));
}
