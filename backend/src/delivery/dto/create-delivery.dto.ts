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
}
