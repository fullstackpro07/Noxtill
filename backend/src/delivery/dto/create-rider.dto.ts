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

export class CreateRiderDto {
  @IsString()
  name!: string;

  @IsString()
  phone!: string;

  /** Riders screen depth fix (UPD-FE-127) — real fields, not part of the original model. */
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
