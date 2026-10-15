import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsIn,
  IsOptional,
  IsNumber,
  IsString,
  MaxLength,
  Max,
  Min,
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

export const VOICE_AI_AGENT_TOOLS = [
  'book',
  'message',
  'transfer',
  'end',
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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(VOICE_AI_AGENT_TOOLS, { each: true })
  toolPermissions?: (typeof VOICE_AI_AGENT_TOOLS)[number][];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(191, { each: true })
  knowledgeSourceIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(32)
  @Max(1000)
  maxTokensPerResponse?: number;

  /** Monthly AI cost ceiling for calls handled by this immutable version, in USD. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100_000)
  monthlyBudgetUsd?: number;
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
