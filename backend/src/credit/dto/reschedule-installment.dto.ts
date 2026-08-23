import { IsISO8601, IsString } from 'class-validator';

export class RescheduleInstallmentDto {
  @IsISO8601()
  dueDate!: string;

  @IsString()
  reason!: string;
}
