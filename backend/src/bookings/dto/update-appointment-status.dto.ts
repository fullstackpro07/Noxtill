import { IsIn } from 'class-validator';

export class UpdateAppointmentStatusDto {
  @IsIn(['confirmed', 'completed', 'no_show', 'cancelled'])
  status!: 'confirmed' | 'completed' | 'no_show' | 'cancelled';
}
