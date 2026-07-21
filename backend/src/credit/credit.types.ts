export interface DebtorRow {
  customer_id: string;
  name: string;
  phone: string;
  balance: string;
  last_entry_at: Date;
  days_outstanding: number;
}
