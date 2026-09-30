import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { WorkflowRunStatus } from '@prisma/client';

export class ListWorkflowRunsDto {
  @IsOptional()
  @IsEnum(WorkflowRunStatus)
  status?: WorkflowRunStatus;

  @IsOptional()
  @IsUUID()
  workflowId?: string;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}
