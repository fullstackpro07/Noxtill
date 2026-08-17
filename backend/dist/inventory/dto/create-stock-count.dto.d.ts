export declare class StockCountLineDto {
    productId: string;
    countedQty: number;
}
export declare class CreateStockCountDto {
    note?: string;
    lines: StockCountLineDto[];
}
