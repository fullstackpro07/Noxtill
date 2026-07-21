export interface ProductProfitRow {
  product_id: string;
  name: string;
  units: bigint;
  revenue: string;
  cost: string;
}

export interface HourlyRow {
  hour: number;
  revenue: string;
}

export interface WeekdayRow {
  dow: number;
  revenue: string;
}
