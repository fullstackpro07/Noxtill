export interface OrderTotals {
    subtotal: number;
    tax: number;
    total: number;
    cogs: number;
}
export declare function computeOrderTotals(items: {
    price: number;
    cost: number;
    qty: number;
}[], discount: number, taxRatePercent: number): OrderTotals;
