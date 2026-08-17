export interface DebtorRow {
  customer_id: string;
  name: string;
  phone: string;
  balance: string;
  last_entry_at: Date;
  days_outstanding: number;
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
