import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SaleItemDto } from '../../orders/dto/create-sale.dto';

export class CreatePublicOrderDto {
  @IsArray()
  @ArrayNotEmpty()
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
  @MaxLength(50)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  customerName?: string;

  /** Delivery orders only — where to deliver, and which of the business's zones it falls in. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  deliveryZoneId?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  deliveryLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  deliveryLng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryNote?: string;
}
