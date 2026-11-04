import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { SPECIALIST_AGENT_REGISTRY } from '../../common/agents/specialist-agent-registry';

const AGENT_KEYS = SPECIALIST_AGENT_REGISTRY.map((agent) => agent.agentKey);
const RUN_STATUSES = [
  'queued',
  'running',
  'completed',
  'partial',
  'failed',
  'cancel_requested',
  'cancelled',
] as const;

export class ListSpecialistAgentRunsDto {
  @IsOptional()
  @IsIn(AGENT_KEYS)
  agentKey?: string;

  @IsOptional()
  @IsIn(RUN_STATUSES)
  status?: (typeof RUN_STATUSES)[number];

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
