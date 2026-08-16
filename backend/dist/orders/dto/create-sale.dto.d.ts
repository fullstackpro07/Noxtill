export declare class SaleItemDto {
    productId: string;
    qty: number;
    priceOverride?: number;
}
export declare class SalePaymentDto {
    method: 'cash' | 'card' | 'online' | 'credit';
    amount?: number;
    note?: string;
}
export declare class CreateSaleDto {
    orderType?: 'counter' | 'online' | 'dine_in' | 'takeaway' | 'delivery';
    tableNo?: string;
    customerId?: string;
    customerPhone?: string;
    customerName?: string;
    staffUserId?: string;
    items: SaleItemDto[];
    discount?: number;
    couponCode?: string;
    voucherCode?: string;
    voucherAmount?: number;
    payment: SalePaymentDto;
}
