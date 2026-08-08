import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateWalkInAppointmentDto {
  @IsString()
  serviceId!: string;

  @IsOptional()
  @IsString()
  staffId?: string;

  @IsISO8601()
  startsAt!: string;

  @IsString()
  customerName!: string;

  @IsString()
  customerPhone!: string;
}
