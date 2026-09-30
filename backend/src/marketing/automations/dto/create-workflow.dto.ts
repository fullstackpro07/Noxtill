import {
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsDateString,
  Max,
  IsOptional,
  IsObject,
  IsString,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';
import { WorkflowConditionMode, WorkflowTriggerKey } from '@prisma/client';
import {
  MAX_WORKFLOW_SCHEDULE_MINUTES,
  MIN_WORKFLOW_SCHEDULE_MINUTES,
} from '../workflows.constants';

const TRIGGER_KEYS = Object.values(WorkflowTriggerKey);
const CONDITION_MODES = Object.values(WorkflowConditionMode);

export class InstallWorkflowTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(191)
  name?: string;
}

export class CreateWorkflowDto {
  @IsString()
  name!: string;

  @IsIn(TRIGGER_KEYS)
  triggerKey!: WorkflowTriggerKey;

  /** `{ field, operator, value }[]` — see `workflow-condition.util.ts`. Untyped: small, evolving shape. */
  @IsOptional()
  @IsArray()
  conditions?: Record<string, unknown>[];

  @IsOptional()
  @IsIn(CONDITION_MODES)
  conditionMode?: WorkflowConditionMode;

  @IsOptional()
  @IsInt()
  @Min(MIN_WORKFLOW_SCHEDULE_MINUTES)
  @Max(MAX_WORKFLOW_SCHEDULE_MINUTES)
  scheduleEveryMinutes?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  scheduleCronExpression?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  scheduleTimezone?: string;

  /** Message, owner-notification and customer-tag actions — see `workflow-action.util.ts`. */
  @IsOptional()
  @IsArray()
  actions?: Record<string, unknown>[];

  /** Optional connected trigger/condition/action graph; when supplied it is authoritative. */
  @IsOptional()
  @IsObject()
  graph?: Record<string, unknown>;
}

export class UpdateWorkflowDto {
  /** Current definition version from the workflow list; stale edits are rejected. */
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  /** Current row timestamp protects non-definition changes such as pause/resume. */
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  conditions?: Record<string, unknown>[];

  @IsOptional()
  @IsIn(CONDITION_MODES)
  conditionMode?: WorkflowConditionMode;

  @IsOptional()
  @IsInt()
  @Min(MIN_WORKFLOW_SCHEDULE_MINUTES)
  @Max(MAX_WORKFLOW_SCHEDULE_MINUTES)
  scheduleEveryMinutes?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  scheduleCronExpression?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  scheduleTimezone?: string;

  @IsOptional()
  @IsArray()
  actions?: Record<string, unknown>[];

  /** Null clears a graph and returns to the legacy linear editor. */
  @IsOptional()
  @IsObject()
  graph?: Record<string, unknown> | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class WorkflowSchedulePreviewDto {
  @IsOptional()
  @IsInt()
  @Min(MIN_WORKFLOW_SCHEDULE_MINUTES)
  @Max(MAX_WORKFLOW_SCHEDULE_MINUTES)
  scheduleEveryMinutes?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  scheduleCronExpression?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  scheduleTimezone?: string;
}
