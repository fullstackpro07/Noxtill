import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class VoiceQueueSlaDto {
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(3600)
  slaTargetSeconds?: number | null;
}
