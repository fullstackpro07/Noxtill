import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReturnItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

export class CreateReturnDto {
  @IsString()
  orderId!: string;

  @IsString()
  reason!: string;

  @IsIn(['cash', 'card', 'online', 'credit', 'store_credit'])
  refundMethod!: 'cash' | 'card' | 'online' | 'credit' | 'store_credit';

  /** Defaults to true — set false for a damaged/unsellable item that shouldn't go back into stock. */
  @IsOptional()
  @IsBoolean()
  restock?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[];
}
