import {
  ArrayMaxSize,
  ArrayMinSize,
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
  IsBoolean,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { VoiceAgentHours } from '../voice-agent-controls.util';

export const VOICE_REALTIME_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
] as const;

class VoiceAgentDialogueDto {
  @IsOptional()
  @IsString()
  @MaxLength(400)
  greeting?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  disclosures?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  requiredQuestions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(400)
  clarificationPrompt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  edgeCases?: string[];
}

class VoiceAgentHoursDto implements VoiceAgentHours {
  @IsInt()
  @Min(0)
  @Max(6)
  day!: number;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  opens!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closes!: string;
}

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
  'catalog',
  'slots',
  'customer_lookup',
  'reschedule',
  'support_ticket',
  'inbox_draft',
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

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(3, { each: true })
  @MaxLength(240, { each: true })
  exclusions?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => VoiceAgentDialogueDto)
  dialogue?: VoiceAgentDialogueDto;

  @IsOptional()
  @IsIn(VOICE_REALTIME_VOICES)
  realtimeVoice?: (typeof VOICE_REALTIME_VOICES)[number];

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
  @ArrayMaxSize(12)
  @IsIn(VOICE_AI_AGENT_TOOLS, { each: true })
  toolPermissions?: (typeof VOICE_AI_AGENT_TOOLS)[number][];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(191, { each: true })
  knowledgeSourceIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(191)
  assignedOwnerBusinessUserId?: string | null;

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

  @IsOptional()
  @IsIn(['recorded_turns', 'realtime'])
  runtimeMode?: 'recorded_turns' | 'realtime';

  @IsOptional()
  @IsBoolean()
  inboundEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  outboundEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timeZone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => VoiceAgentHoursDto)
  weeklyHours?: VoiceAgentHoursDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(366)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  holidays?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  rolloutPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxConcurrentCalls?: number;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  maxCallSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxToolCalls?: number;
}

export class PreviewVoiceAiAgentVoiceDto {
  @IsIn(VOICE_REALTIME_VOICES)
  voice!: (typeof VOICE_REALTIME_VOICES)[number];
}

export class TestVoiceAiAgentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  scenario!: string;
}

export const VOICE_AI_TEST_INTENTS = [
  'continue',
  'book',
  'message',
  'transfer',
  'end',
] as const;

class VoiceAiAgentScenarioChecksDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  mustInclude?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  mustNotInclude?: string[];

  @IsOptional()
  @IsIn(VOICE_AI_TEST_INTENTS)
  expectedIntent?: (typeof VOICE_AI_TEST_INTENTS)[number];
}

export class TestVoiceAiAgentScenariosDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(8)
  @MinLength(3, { each: true })
  @MaxLength(1000, { each: true })
  @IsString({ each: true })
  scenarios!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => VoiceAiAgentScenarioChecksDto)
  checks?: VoiceAiAgentScenarioChecksDto[];
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
