export declare class BulkPriceDto {
    productIds?: string[];
    category?: string;
    mode: 'percent' | 'amount';
    value: number;
    dryRun?: boolean;
}
