import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
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

  /** Where a "caller asks for a person" transfer rings. Overrides the server-wide VOICE_TRANSFER_NUMBER when set. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'must be an international phone number, e.g. +15551234567',
  })
  transferNumber?: string | null;

  /** Whether the AI may read matching product/service price and stock to answer a caller's question. On by default. */
  @IsOptional()
  @IsBoolean()
  shareCatalog?: boolean;

  /** Whether the AI may read a VERIFIED caller's own recent order status. Off by default — caller ID isn't proof of identity. */
  @IsOptional()
  @IsBoolean()
  shareOrderStatus?: boolean;

  /** Whether the AI may read a VERIFIED caller's own credit balance. Off by default. */
  @IsOptional()
  @IsBoolean()
  shareCreditBalance?: boolean;
}
