export declare class CreateWastageDto {
    productId: string;
    qty: number;
    reason: 'Expired' | 'Damaged' | 'Other';
    note?: string;
}
