export interface CreditLedgerEntry {
  id: string;
  date: string;
  description: string;
  /** Positive = charge added to balance, negative = payment reducing it. */
  amount: number;
  runningBalance: number;
}

export interface Debtor {
  customerId: string;
  name: string;
  phone: string;
  balance: number;
  lastActivity: string;
  optedOutOfReminders: boolean;
  entries: CreditLedgerEntry[];
}

/** Mock debtor book — real ledger (from v_credit_balances) wires up in INT-004. */
export const DEBTORS: Debtor[] = [
  {
    customerId: "c2",
    name: "Devon Marsh",
    phone: "+1 555 013 8842",
    balance: 62,
    lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
    optedOutOfReminders: false,
    entries: [
      { id: "e1", date: "2026-06-01", description: "Full Color & Highlights", amount: 120, runningBalance: 120 },
      { id: "e2", date: "2026-06-10", description: "Payment received", amount: -58, runningBalance: 62 },
    ],
  },
  {
    customerId: "c4",
    name: "Lena Fischer",
    phone: "+1 555 013 4471",
    balance: 145,
    lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 24 * 21).toISOString(),
    optedOutOfReminders: false,
    entries: [
      { id: "e3", date: "2026-05-14", description: "Bridal Package", amount: 220, runningBalance: 220 },
      { id: "e4", date: "2026-05-28", description: "Payment received", amount: -75, runningBalance: 145 },
    ],
  },
  {
    customerId: "c6",
    name: "Marcus Webb",
    phone: "+1 555 013 7723",
    balance: 34,
    lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 24 * 42).toISOString(),
    optedOutOfReminders: true,
    entries: [{ id: "e5", date: "2026-04-16", description: "Deep Conditioning Treatment", amount: 34, runningBalance: 34 }],
  },
];

export function totalReceivable(debtors: Debtor[]): number {
  return debtors.reduce((sum, d) => sum + d.balance, 0);
}
