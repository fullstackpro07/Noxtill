import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateDeliveryZoneDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['flat', 'by_distance', 'by_order_value'])
  chargeType?: 'flat' | 'by_distance' | 'by_order_value';

  @IsOptional()
  @IsNumber()
  @Min(0)
  flatAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  perKmAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  freeAboveOrderValue?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
