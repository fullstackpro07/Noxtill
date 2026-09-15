import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsNumber,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { SaleItemDto } from './create-sale.dto';

/** "New Order" (Orders module) — creates a real, committed order directly at a chosen status,
 * distinct from `POST /sales` (always completed, always paid now) and `POST /orders/draft`
 * (never decrements stock). Payment is optional: omit it (or pass "unpaid") to record the order
 * without collecting money yet, matching the design's own "Unpaid" option. */
export class CreateOrderDto {
  @IsOptional()
  @IsIn(['counter', 'online', 'dine_in', 'takeaway', 'delivery'])
  orderType?: 'counter' | 'online' | 'dine_in' | 'takeaway' | 'delivery';

  @IsOptional()
  @IsString()
  tableNo?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  staffUserId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsIn(['unpaid', 'cash', 'card', 'online', 'credit'])
  paymentMethod?: 'unpaid' | 'cash' | 'card' | 'online' | 'credit';

  @IsOptional()
  @IsString()
  notes?: string;
}
