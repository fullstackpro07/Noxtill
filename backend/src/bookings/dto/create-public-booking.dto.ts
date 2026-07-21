import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreatePublicBookingDto {
  @IsString()
  serviceId!: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsISO8601()
  startsAt!: string;

  @IsString()
  customerPhone!: string;

  @IsString()
  customerName!: string;
}
