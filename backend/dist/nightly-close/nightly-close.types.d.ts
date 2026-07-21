export interface DailyCloseRow {
    business_id: string;
    close_date: Date;
    orders_count: bigint;
    revenue: string | null;
    cogs: string | null;
    gross_profit: string | null;
}
export interface LowStockRow {
    id: string;
    name: string;
    stock_qty: number;
    low_stock_threshold: number;
}
export interface NightlyCloseData {
    businessId: string;
    businessName: string;
    dateLabel: string;
    ordersCount: number;
    revenue: number;
    grossProfit: number;
    appointmentsTomorrowCount: number;
    newReviewsCount: number;
    openFeedbackCount: number;
    creditPaymentsTodayTotal: number;
    lowStockProducts: LowStockRow[];
}
