import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDeliveryDto {
  @IsString()
  orderId!: string;

  @IsString()
  addressLine!: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  /** Per-zone SLA depth fix — real zone, manually chosen (this app's zones carry no geofence). */
  @IsOptional()
  @IsString()
  zoneId?: string;

  /** Free-text instruction for the rider (gate code, "ring twice"). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryNote?: string;
}
