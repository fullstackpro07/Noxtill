import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const VOICE_IVR_NODE_TYPES = [
  'start',
  'greeting',
  'disclosure',
  'get_dtmf',
  'speech_intent',
  'business_hours',
  'branch',
  'condition',
  'lookup',
  'queue',
  'ai_agent',
  'human_agent',
  'voicemail',
  'callback',
  'transfer',
  'end',
] as const;

export class VoiceIvrNodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  id!: string;

  @IsIn(VOICE_IVR_NODE_TYPES)
  type!: (typeof VOICE_IVR_NODE_TYPES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class VoiceIvrEdgeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  from!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  to!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  condition!: string;
}

export class VoiceIvrGraphDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => VoiceIvrNodeDto)
  nodes!: VoiceIvrNodeDto[];

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => VoiceIvrEdgeDto)
  edges!: VoiceIvrEdgeDto[];
}

export class CreateVoiceIvrFlowDto {
  @IsString()
  @MinLength(2)
  @MaxLength(191)
  name!: string;
}

export class SaveVoiceIvrDraftDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @ValidateNested()
  @Type(() => VoiceIvrGraphDto)
  graph!: VoiceIvrGraphDto;
}

export class PublishVoiceIvrFlowDto {
  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsString()
  @MinLength(4)
  @MaxLength(500)
  changeSummary!: string;
}

export class RollbackVoiceIvrFlowDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsInt()
  @Min(0)
  expectedRevision!: number;

  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class SimulateVoiceIvrFlowDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  dtmf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  intent?: string;

  @IsOptional()
  @IsIn(['open', 'closed'])
  businessHours?: 'open' | 'closed';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  value?: string;
}
