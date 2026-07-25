import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class SaleItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceOverride?: number;
}

export class SalePaymentDto {
  @IsIn(['cash', 'card', 'online', 'credit'])
  method!: 'cash' | 'card' | 'online' | 'credit';

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateSaleDto {
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

  @ValidateNested()
  @Type(() => SalePaymentDto)
  payment!: SalePaymentDto;
}
