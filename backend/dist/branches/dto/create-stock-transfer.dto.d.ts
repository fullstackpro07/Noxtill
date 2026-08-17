export declare class StockTransferItemDto {
    productId: string;
    qty: number;
}
export declare class CreateStockTransferDto {
    destBusinessId: string;
    note?: string;
    items: StockTransferItemDto[];
}
export declare class RejectStockTransferDto {
    reason?: string;
}
