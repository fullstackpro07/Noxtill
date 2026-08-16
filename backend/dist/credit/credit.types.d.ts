export interface DebtorRow {
    customer_id: string;
    name: string;
    phone: string;
    balance: string;
    last_entry_at: Date;
    days_outstanding: number;
    opted_out: boolean;
}
export interface LedgerRow {
    id: string;
    date: Date;
    kind: 'credit' | 'payment' | 'write_off';
    amount: number;
    note: string | null;
    runningBalance: number;
}
export declare function buildLedgerRows(entries: {
    id: string;
    kind: 'credit' | 'payment' | 'write_off';
    amount: unknown;
    note: string | null;
    createdAt: Date;
}[]): LedgerRow[];
