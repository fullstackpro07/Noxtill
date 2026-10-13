import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class OverrideVoiceCallAttributionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  source!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  channel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  campaignId?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  evidence!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  reason!: string;
}
