import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateTimesheetSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  overtimeThresholdHoursPerWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  breakThresholdHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  breakMinutesPerShift?: number;
}
