import { IsEmail, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateCompetitiveSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  scanFrequencyDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  keywordRankAlertThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  reviewFreshnessAlertDays?: number;

  /** Full spec parity (UPD-FE-048e) — null clears it (no weekly email sent). */
  @IsOptional()
  @IsEmail()
  weeklyReportRecipient?: string | null;
}
