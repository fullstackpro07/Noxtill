export type CustomerTag = "VIP" | "Regular" | "New" | "Lapsed";

export const CUSTOMER_TAGS: CustomerTag[] = ["VIP", "Regular", "New", "Lapsed"];

export interface PurchaseHistoryEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
}

export interface CustomerReviewRef {
  id: string;
  type: "review" | "complaint";
  rating: number;
  date: string;
  snippet: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  tags: CustomerTag[];
  creditBalance: number;
  totalSpent: number;
  visitCount: number;
  lastVisit: string;
  notes: string;
  purchaseHistory: PurchaseHistoryEntry[];
  reviews: CustomerReviewRef[];
}

/** findCustomerByPhone callers (POS credit lookup) only ever read name/phone/creditBalance off this shape. */
export type CustomerLookup = Pick<Customer, "id" | "name" | "phone" | "creditBalance">;

/** Mock CRM book — real search/segments/erasure wire up in INT-006 (BE-040/041). */
export const CUSTOMERS: Customer[] = [
  {
    id: "c1",
    name: "Priya Nair",
    phone: "+1 555 013 2210",
    email: "priya.nair@example.com",
    tags: ["VIP", "Regular"],
    creditBalance: 0,
    totalSpent: 1240,
    visitCount: 18,
    lastVisit: "2026-07-24",
    notes: "Prefers Amara for color appointments. Allergic to sulfates.",
    purchaseHistory: [
      { id: "h1", date: "2026-07-24", description: "Signature Haircut", amount: 45 },
      { id: "h2", date: "2026-06-30", description: "Full Color & Highlights", amount: 120 },
      { id: "h3", date: "2026-06-02", description: "Deep Conditioning Treatment", amount: 35 },
    ],
    reviews: [{ id: "rv1", type: "review", rating: 5, date: "2026-06-30", snippet: "Best haircut in town!" }],
  },
  {
    id: "c2",
    name: "Devon Marsh",
    phone: "+1 555 013 8842",
    tags: ["Regular"],
    creditBalance: 62,
    totalSpent: 890,
    visitCount: 11,
    lastVisit: "2026-06-10",
    notes: "",
    purchaseHistory: [
      { id: "h4", date: "2026-06-10", description: "Full Color & Highlights", amount: 120 },
      { id: "h5", date: "2026-06-10", description: "Deep Conditioning Treatment", amount: 35 },
    ],
    reviews: [],
  },
  {
    id: "c3",
    name: "Casey Nolan",
    phone: "+1 555 013 1190",
    tags: ["New"],
    creditBalance: 0,
    totalSpent: 48,
    visitCount: 1,
    lastVisit: "2026-07-20",
    notes: "First visit — came in for retail only.",
    purchaseHistory: [{ id: "h6", date: "2026-07-20", description: "Argan Oil Shampoo ×2", amount: 48 }],
    reviews: [{ id: "rv2", type: "complaint", rating: 2, date: "2026-07-20", snippet: "Service was slow at checkout." }],
  },
  {
    id: "c4",
    name: "Lena Fischer",
    phone: "+1 555 013 4471",
    email: "lena.fischer@example.com",
    tags: ["VIP"],
    creditBalance: 145,
    totalSpent: 2100,
    visitCount: 6,
    lastVisit: "2026-05-28",
    notes: "Booking her bridal package for September — follow up in August.",
    purchaseHistory: [{ id: "h7", date: "2026-05-14", description: "Bridal Package (deposit)", amount: 220 }],
    reviews: [],
  },
  {
    id: "c5",
    name: "Tariq Malik",
    phone: "+1 555 013 9902",
    tags: ["Regular"],
    creditBalance: 0,
    totalSpent: 410,
    visitCount: 7,
    lastVisit: "2026-07-15",
    notes: "",
    purchaseHistory: [{ id: "h8", date: "2026-07-15", description: "Beard Trim", amount: 20 }],
    reviews: [{ id: "rv3", type: "review", rating: 4, date: "2026-07-15", snippet: "Quick and friendly." }],
  },
  {
    id: "c6",
    name: "Marcus Webb",
    phone: "+1 555 013 7723",
    tags: ["Lapsed"],
    creditBalance: 34,
    totalSpent: 560,
    visitCount: 9,
    lastVisit: "2026-04-16",
    notes: "Used to come in every 3 weeks — hasn't been back since April.",
    purchaseHistory: [{ id: "h9", date: "2026-04-16", description: "Deep Conditioning Treatment", amount: 34 }],
    reviews: [],
  },
  {
    id: "c7",
    name: "Jordan Blake",
    phone: "+1 555 013 5541",
    tags: ["Lapsed"],
    creditBalance: 0,
    totalSpent: 310,
    visitCount: 4,
    lastVisit: "2026-03-02",
    notes: "",
    purchaseHistory: [{ id: "h10", date: "2026-03-02", description: "Express Facial", amount: 55 }],
    reviews: [],
  },
  {
    id: "c8",
    name: "Amara Osei",
    phone: "+1 555 013 3305",
    tags: ["VIP", "Regular"],
    creditBalance: 0,
    totalSpent: 1580,
    visitCount: 22,
    lastVisit: "2026-07-26",
    notes: "Staff member — also a regular retail customer.",
    purchaseHistory: [{ id: "h11", date: "2026-07-26", description: "Classic Manicure", amount: 28 }],
    reviews: [],
  },
];

export function findCustomerByPhone(query: string): CustomerLookup | undefined {
  const q = query.trim();
  if (!q) return undefined;
  return CUSTOMERS.find(
    (c) => c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")) || c.name.toLowerCase().includes(q.toLowerCase()),
  );
}

export function findCustomerById(id: string): Customer | undefined {
  return CUSTOMERS.find((c) => c.id === id);
}
