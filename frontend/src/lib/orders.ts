export type OrderStatus = "pending" | "preparing" | "ready" | "completed" | "cancelled";
export type PaymentMethod = "cash" | "card" | "wallet" | "credit";

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export interface Order {
  id: string;
  orderNo: string;
  customerName: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  tableId?: string;
  createdAt: string;
}

export interface DineTable {
  id: string;
  label: string;
  seats: number;
  status: "free" | "occupied" | "reserved";
  currentOrderId?: string;
}

export type QuotationStatus = "draft" | "sent" | "accepted" | "expired";

export interface Quotation {
  id: string;
  quoteNo: string;
  customerName: string;
  items: OrderItem[];
  total: number;
  status: QuotationStatus;
  createdAt: string;
}

export const ORDER_STATUS_COLUMNS: { key: OrderStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "completed", label: "Completed" },
];

/** Mock order book — real live wiring (incl. row-level slot lock, atomic sale transaction) is INT-003. */
export const ORDERS: Order[] = [
  {
    id: "o1",
    orderNo: "1042",
    customerName: "Priya Nair",
    items: [{ productId: "p1", name: "Signature Haircut", price: 45, qty: 1 }],
    total: 45,
    status: "pending",
    paymentMethod: "card",
    createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
  },
  {
    id: "o2",
    orderNo: "1041",
    customerName: "Devon Marsh",
    items: [
      { productId: "p3", name: "Full Color & Highlights", price: 120, qty: 1 },
      { productId: "p4", name: "Deep Conditioning Treatment", price: 35, qty: 1 },
    ],
    total: 155,
    status: "preparing",
    paymentMethod: "cash",
    createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
  },
  {
    id: "o3",
    orderNo: "1040",
    customerName: "Casey Nolan",
    items: [{ productId: "p7", name: "Argan Oil Shampoo", price: 24, qty: 2 }],
    total: 48,
    status: "ready",
    paymentMethod: "wallet",
    createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
  },
  {
    id: "o4",
    orderNo: "1039",
    customerName: "Amara Osei",
    items: [{ productId: "p5", name: "Classic Manicure", price: 28, qty: 1 }],
    total: 28,
    status: "completed",
    paymentMethod: "card",
    createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
  },
  {
    id: "o5",
    orderNo: "1038",
    customerName: "Jordan Blake",
    items: [{ productId: "p6", name: "Express Facial", price: 55, qty: 1 }],
    total: 55,
    status: "completed",
    paymentMethod: "credit",
    createdAt: new Date(Date.now() - 1000 * 60 * 200).toISOString(),
  },
];

export const DINE_TABLES: DineTable[] = [
  { id: "t1", label: "T1", seats: 2, status: "occupied", currentOrderId: "o1" },
  { id: "t2", label: "T2", seats: 4, status: "free" },
  { id: "t3", label: "T3", seats: 4, status: "reserved" },
  { id: "t4", label: "T4", seats: 2, status: "free" },
  { id: "t5", label: "T5", seats: 6, status: "occupied", currentOrderId: "o2" },
  { id: "t6", label: "T6", seats: 2, status: "free" },
];

export const QUOTATIONS: Quotation[] = [
  {
    id: "q1",
    quoteNo: "Q-204",
    customerName: "Lena Fischer",
    items: [{ productId: "p12", name: "Bridal Package", price: 220, qty: 1 }],
    total: 220,
    status: "sent",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "q2",
    quoteNo: "Q-203",
    customerName: "Tariq Malik",
    items: [
      { productId: "p3", name: "Full Color & Highlights", price: 120, qty: 1 },
      { productId: "p11", name: "Scalp Massage Add-on", price: 15, qty: 1 },
    ],
    total: 135,
    status: "draft",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
];
