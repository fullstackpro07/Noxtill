import { SaleItemDto } from './create-sale.dto';
export declare class HoldSaleDto {
    orderType?: 'counter' | 'online' | 'dine_in' | 'takeaway' | 'delivery';
    tableNo?: string;
    customerId?: string;
    customerPhone?: string;
    customerName?: string;
    staffUserId?: string;
    items: SaleItemDto[];
    discount?: number;
    note?: string;
}
