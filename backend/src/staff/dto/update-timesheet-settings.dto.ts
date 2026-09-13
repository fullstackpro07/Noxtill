import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';

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

  /** Staff depth fix (UPD-INT-011): multiplies `hourlyRate` for overtime hours — 1.5 is the
   * standard "time-and-a-half" default. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  overtimeRateMultiplier?: number;
}
