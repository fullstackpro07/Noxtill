import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const VEHICLE_TYPES = ['bike', 'motorcycle', 'car', 'van', 'on_foot'] as const;

export class UpdateRiderDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @IsOptional()
  @IsIn(VEHICLE_TYPES)
  vehicleType?: (typeof VEHICLE_TYPES)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  zoneIds?: string[];
}
