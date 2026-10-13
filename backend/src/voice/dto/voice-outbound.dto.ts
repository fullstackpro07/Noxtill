import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const PURPOSES = ['service', 'callback', 'marketing'] as const;
const CALLER_TYPES = ['ai_voice', 'live_agent'] as const;

export class CreateVoiceOutboundCampaignDto {
  @IsString()
  @MinLength(3)
  @MaxLength(191)
  name!: string;

  @IsIn(PURPOSES)
  purpose!: (typeof PURPOSES)[number];

  @IsIn(CALLER_TYPES)
  callerType!: (typeof CALLER_TYPES)[number];

  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  timeZone!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  openingScript!: string;

  @IsOptional()
  @IsUUID()
  aiAgentId?: string | null;

  @IsOptional()
  @IsUUID()
  humanAgentProfileId?: string | null;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  maxAttemptsPerContact?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  retryCooldownHours?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  customerIds!: string[];
}

export class UpdateVoiceOutboundCampaignDto extends PartialType(
  CreateVoiceOutboundCampaignDto,
) {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  customerIds?: string[];
}

export class VoiceDialerAttemptDto {
  @IsUUID()
  memberId!: string;
}

export class VoiceDialerDispositionDto {
  @IsIn([
    'interested',
    'not_interested',
    'callback_requested',
    'wrong_number',
    'do_not_call',
    'completed',
  ])
  disposition!:
    | 'interested'
    | 'not_interested'
    | 'callback_requested'
    | 'wrong_number'
    | 'do_not_call'
    | 'completed';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
