import { IsOptional, IsString } from 'class-validator';

export class DeclineAppointmentRequestDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
