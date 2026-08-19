import { IsInt, IsOptional, Min } from 'class-validator';

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
}
