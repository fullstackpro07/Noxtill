import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateAdSettingsDto {
  /** `null` clears the cap. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  defaultDailyBudgetCap?: number | null;

  /** `null` disables the real auto-pause job for this business. */
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  autoPauseCostPerResult?: number | null;

  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;
}
