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
  @IsObject()
  @ValidateNested()
  @Type(() => AiFeatureTogglesDto)
  featureToggles?: AiFeatureTogglesDto;
}
