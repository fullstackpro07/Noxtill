import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { SaleItemDto } from '../../orders/dto/create-sale.dto';

export class CreatePublicOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

  @IsOptional()
  @IsIn(['online', 'dine_in', 'takeaway', 'delivery'])
  orderType?: 'online' | 'dine_in' | 'takeaway' | 'delivery';

  @IsOptional()
  @IsString()
  tableNo?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  customerName?: string;
}
