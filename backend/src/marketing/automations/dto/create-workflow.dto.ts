import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import { WorkflowTriggerKey } from '@prisma/client';

const TRIGGER_KEYS = Object.values(WorkflowTriggerKey);

export class CreateWorkflowDto {
  @IsString()
  name!: string;

  @IsIn(TRIGGER_KEYS)
  triggerKey!: WorkflowTriggerKey;

  /** `{ field, operator, value }[]` — see `workflow-condition.util.ts`. Untyped: small, evolving shape. */
  @IsOptional()
  @IsArray()
  conditions?: Record<string, unknown>[];

  /** `{ type: 'send_customer_message'|'notify_owner', messageBody }[]` — see `workflow-action.util.ts`. */
  @IsOptional()
  @IsArray()
  actions?: Record<string, unknown>[];
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  conditions?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  actions?: Record<string, unknown>[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
