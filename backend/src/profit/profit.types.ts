export interface ProductProfitRow {
  product_id: string;
  name: string;
  units: bigint;
  revenue: string;
  cost: string;
}

export interface HourlyRow {
  // MySQL migration: HOUR(created_at) is a raw date/time function call — mysql2/Prisma deserialize it as `bigint`, not `number`.
  hour: bigint;
  revenue: string;
}

export interface WeekdayRow {
  // Same bigint quirk as HourlyRow.hour — DAYOFWEEK(created_at) - 1 is a raw expression, not a plain column.
  dow: bigint;
  revenue: string;
}

export interface CoPurchaseRow {
  product_a: string;
  product_b: string;
  name_a: string;
  name_b: string;
  together_count: bigint;
}
