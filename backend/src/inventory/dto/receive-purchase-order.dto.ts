import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';

export class ReceivePurchaseOrderLineDto {
  @IsString()
  itemId!: string;

  @IsInt()
  @Min(0)
  qtyReceived!: number;
}

export class ReceivePurchaseOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderLineDto)
  items!: ReceivePurchaseOrderLineDto[];
}
