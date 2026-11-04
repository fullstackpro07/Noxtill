import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class AiFeatureTogglesDto {
  @IsOptional()
  @IsBoolean()
  voiceEntry?: boolean;

  @IsOptional()
  @IsBoolean()
  voiceQualityAssist?: boolean;

  @IsOptional()
  @IsBoolean()
  voiceMeetingSummary?: boolean;

  @IsOptional()
  @IsBoolean()
  photoDigitizer?: boolean;

  @IsOptional()
  @IsBoolean()
  reviewReplies?: boolean;

  @IsOptional()
  @IsBoolean()
  campaignCopy?: boolean;

  @IsOptional()
  @IsBoolean()
  insights?: boolean;

  @IsOptional()
  @IsBoolean()
  whatIf?: boolean;

  @IsOptional()
  @IsBoolean()
  assistant?: boolean;

  @IsOptional()
  @IsBoolean()
  workflowAgents?: boolean;

  @IsOptional()
  @IsBoolean()
  inventoryAgent?: boolean;

  @IsOptional()
  @IsBoolean()
  financeAgent?: boolean;

  @IsOptional()
  @IsBoolean()
  customerAgent?: boolean;

  @IsOptional()
  @IsBoolean()
  seoAgent?: boolean;

  @IsOptional()
  @IsBoolean()
  commerceAgent?: boolean;
}

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  aiMonthlyCostCapUsd?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  aiRateLimitPerMinute?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  aiQueryQuota?: number;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AiFeatureTogglesDto)
  featureToggles?: AiFeatureTogglesDto;
}
