import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class StockTransferItemDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

export class CreateStockTransferDto {
  @IsString()
  destBusinessId!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockTransferItemDto)
  items!: StockTransferItemDto[];
}

export class RejectStockTransferDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

/** Branches depth fix (UPD-INT-012): overriding an item here records a real partial receipt —
 * omit an item entirely to receive it in full (its originally shipped `qty`), same behavior as
 * before this DTO existed. */
export class ReceiveStockTransferItemDto {
  @IsString()
  itemId!: string;

  @IsInt()
  @Min(0)
  receivedQty!: number;
}

export class ReceiveStockTransferDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveStockTransferItemDto)
  items?: ReceiveStockTransferItemDto[];
}
