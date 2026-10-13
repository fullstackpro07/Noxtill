import { VoiceAgentPresenceStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SaveVoiceHumanAgentProfileDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  skillTags!: string[];

  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  languages!: string[];

  @IsInt()
  @Min(1)
  @Max(10)
  maxConcurrentCalls!: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class VoicePresenceHeartbeatDto {
  @IsEnum(VoiceAgentPresenceStatus)
  status!: VoiceAgentPresenceStatus;
}
