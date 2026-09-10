import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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
}
