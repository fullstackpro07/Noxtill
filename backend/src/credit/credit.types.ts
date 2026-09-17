export interface DebtorRow {
  customer_id: string;
  name: string;
  phone: string;
  balance: string;
  last_entry_at: Date;
  // Credit aging fix (UPD-INT-006): computed through v_credit_balances's window-function CTE,
  // mysql2 decodes this as a real JS `bigint`, not `number` — callers must wrap in `Number(...)`.
  days_outstanding: bigint;
  // MySQL migration: a raw SQL query's Boolean column comes back as a JS `number` (0/1, MySQL's
  // native TINYINT(1) representation) — mysql2 doesn't coerce it to a real boolean the way
  // Prisma's typed model API does. Callers must wrap this in `Boolean(...)`.
  opted_out: number;
}

export interface LedgerRow {
  id: string;
  date: Date;
  kind: 'credit' | 'payment' | 'write_off';
  amount: number;
  note: string | null;
  runningBalance: number;
}

/** Shared by the JSON ledger endpoint (BE-030 statement preview) and the PDF statement (BE-032) so the running-balance math lives in one place. */
export function buildLedgerRows(
  entries: {
    id: string;
    kind: 'credit' | 'payment' | 'write_off';
    amount: unknown;
    note: string | null;
    createdAt: Date;
  }[],
): LedgerRow[] {
  let running = 0;
  return entries.map((entry) => {
    const amount = Number(entry.amount);
    running += entry.kind === 'credit' ? amount : -amount;
    return {
      id: entry.id,
      date: entry.createdAt,
      kind: entry.kind,
      amount,
      note: entry.note,
      runningBalance: running,
    };
  });
}

/**
 * Credit Sales screen (per-sale paid/remaining) — the schema only tracks one aggregate balance
 * per customer, never which specific sale a payment settled, so there's no stored per-sale
 * allocation to read. This applies each customer's own payments/write-offs to their OLDEST open
 * credit entries first (a standard, disclosed FIFO convention for display only) — never persisted,
 * recomputed fresh on every read, and clearly labeled as an approximation wherever it's shown.
 */
export function allocateFifoForCustomer(
  entries: {
    id: string;
    kind: 'credit' | 'payment' | 'write_off';
    amount: number;
    createdAt: Date;
  }[],
): Map<string, { paid: number; remaining: number }> {
  const lots: { id: string; remaining: number }[] = [];
  const result = new Map<string, { paid: number; remaining: number }>();

  for (const entry of entries) {
    if (entry.kind === 'credit') {
      lots.push({ id: entry.id, remaining: entry.amount });
      result.set(entry.id, { paid: 0, remaining: entry.amount });
      continue;
    }
    let toConsume = entry.amount;
    for (const lot of lots) {
      if (toConsume <= 0) break;
      if (lot.remaining <= 0) continue;
      const consumed = Math.min(lot.remaining, toConsume);
      lot.remaining -= consumed;
      toConsume -= consumed;
      const row = result.get(lot.id)!;
      row.paid += consumed;
      row.remaining -= consumed;
    }
  }
  return result;
}
