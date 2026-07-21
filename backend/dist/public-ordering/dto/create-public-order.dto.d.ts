import { SaleItemDto } from '../../orders/dto/create-sale.dto';
export declare class CreatePublicOrderDto {
    items: SaleItemDto[];
    orderType?: 'online' | 'dine_in' | 'takeaway' | 'delivery';
    tableNo?: string;
    customerPhone?: string;
    customerName?: string;
}
