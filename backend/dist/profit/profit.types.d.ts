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
export interface CoPurchaseRow {
    product_a: string;
    product_b: string;
    name_a: string;
    name_b: string;
    together_count: bigint;
}
