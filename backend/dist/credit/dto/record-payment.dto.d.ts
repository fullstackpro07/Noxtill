export declare class RecordPaymentDto {
    customerId: string;
    amount: number;
    method: 'cash' | 'card' | 'online';
    note?: string;
}
