import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class RescheduleInternalAppointmentDto {
  @IsISO8601()
  startsAt!: string;

  @IsOptional()
  @IsString()
  staffUserId?: string;
}
