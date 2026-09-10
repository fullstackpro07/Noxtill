import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
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

  /** Per-zone SLA depth fix — `null` reverts this zone to the business default. */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  slaMinutes?: number | null;
}
