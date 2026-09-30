import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { WORKFLOW_DATA_MAPPER_TRANSFORMS } from '../workflow-data-mapper.util';

const SOURCE_PATH =
  /^(?:[A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*)(?:\.(?:[A-Za-z_][A-Za-z0-9_-]*|0|[1-9][0-9]*))*$/;
const TARGET_PATH = /^[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*)*$/;
export class WorkflowDataMappingDto {
  @IsString()
  @MaxLength(256)
  @Matches(SOURCE_PATH)
  sourcePath!: string;

  @IsString()
  @MaxLength(256)
  @Matches(TARGET_PATH)
  targetPath!: string;

  @IsOptional()
  @IsIn(WORKFLOW_DATA_MAPPER_TRANSFORMS)
  transform?: (typeof WORKFLOW_DATA_MAPPER_TRANSFORMS)[number];

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  fallback?: unknown;
}

export class PreviewWorkflowDataMappingDto {
  @IsObject()
  source!: Record<string, unknown>;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WorkflowDataMappingDto)
  mappings!: WorkflowDataMappingDto[];
}
