import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { SPECIALIST_AGENT_ACTION_STATES } from '../../common/agents/specialist-agent-action.util';
import { SPECIALIST_AGENT_REGISTRY } from '../../common/agents/specialist-agent-registry';

const SPECIALIST_AGENT_KEYS = SPECIALIST_AGENT_REGISTRY.map(
  (agent) => agent.agentKey,
);
const ACTION_STATES = Object.keys(SPECIALIST_AGENT_ACTION_STATES);
const SPECIALIST_MODULE_IDS = [
  ...new Set(SPECIALIST_AGENT_REGISTRY.map((agent) => agent.moduleId)),
];

export class ListSpecialistAgentActionsDto {
  @IsOptional()
  @IsIn(SPECIALIST_AGENT_KEYS)
  agentKey?: string;

  @IsOptional()
  @IsIn(ACTION_STATES)
  state?: string;

  @IsOptional()
  @IsIn(SPECIALIST_MODULE_IDS)
  moduleId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{0,63}$/)
  actionType?: string;

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

export const SPECIALIST_AGENT_ACTION_PAGE_MAX = 100;
export const SPECIALIST_AGENT_ACTION_TYPE_MAX_LENGTH = 64;
