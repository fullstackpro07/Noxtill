import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CustomIntentDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  priority!: number;
}

export class UpdateVoiceSettingsDto {
  @IsOptional()
  @IsString()
  voiceId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(20)
  responseTimeoutSeconds?: number;

  @IsOptional()
  @IsString()
  queueHoldMessage?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CustomIntentDto)
  customIntents?: CustomIntentDto[];
}
