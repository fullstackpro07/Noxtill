import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpdateSocialSettingsDto {
  @IsOptional()
  @IsObject()
  autoPostRules?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  hashtagSets?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  brandVoice?: string;
}
