export declare class ReturnItemDto {
    productId: string;
    qty: number;
}
export declare class CreateReturnDto {
    orderId: string;
    reason: string;
    refundMethod: 'cash' | 'card' | 'online' | 'credit' | 'store_credit';
    restock?: boolean;
    items: ReturnItemDto[];
}
