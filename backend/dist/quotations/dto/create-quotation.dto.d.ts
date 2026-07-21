import { SaleItemDto } from '../../orders/dto/create-sale.dto';
export declare class CreateQuotationDto {
    customerId?: string;
    customerPhone?: string;
    customerName?: string;
    items: SaleItemDto[];
    discount?: number;
}
