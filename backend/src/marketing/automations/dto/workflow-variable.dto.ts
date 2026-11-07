import { PartialType } from '@nestjs/mapped-types';
import {
  Allow,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  WorkflowVariableEnvironment,
  WorkflowVariableScope,
  WorkflowVariableType,
} from '@prisma/client';

const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;
const ENVIRONMENT_SECRET_REFERENCE = /^env:[A-Z][A-Z0-9_]{0,127}$/;

export class CreateWorkflowVariableDto {
  @IsEnum(WorkflowVariableScope)
  scope!: WorkflowVariableScope;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  scopeId?: string | null;

  @IsOptional()
  @IsEnum(WorkflowVariableEnvironment)
  environment?: WorkflowVariableEnvironment;

  @IsString()
  @Matches(VARIABLE_NAME)
  name!: string;

  @IsEnum(WorkflowVariableType)
  valueType!: WorkflowVariableType;

  @IsOptional()
  @Allow()
  value?: unknown;

  @IsOptional()
  @IsString()
  @Matches(ENVIRONMENT_SECRET_REFERENCE)
  secretReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;
}

export class UpdateWorkflowVariableDto extends PartialType(
  CreateWorkflowVariableDto,
) {}

export class ListWorkflowVariablesDto {
  @IsOptional()
  @IsEnum(WorkflowVariableScope)
  scope?: WorkflowVariableScope;

  @IsOptional()
  @IsEnum(WorkflowVariableEnvironment)
  environment?: WorkflowVariableEnvironment;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  scopeId?: string;
}
