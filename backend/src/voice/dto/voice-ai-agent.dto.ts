import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const VOICE_AI_AGENT_TEMPLATES = [
  'receptionist',
  'sales',
  'booking',
  'support',
  'follow_up',
  'lead_qualification',
  'routing',
  'quality_analyst',
] as const;

export class SaveVoiceAiAgentDraftDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsIn(VOICE_AI_AGENT_TEMPLATES)
  template!: (typeof VOICE_AI_AGENT_TEMPLATES)[number];

  @IsString()
  @MinLength(8)
  @MaxLength(240)
  purpose!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  voiceStyle!: string;

  @IsString()
  @MaxLength(2000)
  instructions!: string;

  @IsString()
  @MaxLength(500)
  escalationGuidance!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  languages?: string[];
}

export class TestVoiceAiAgentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  scenario!: string;
}

export class RollbackVoiceAiAgentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  versionId!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}
