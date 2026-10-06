import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ProcurementRequestLineType,
  ProcurementRequestStatus,
  ProcurementRequestUrgency,
} from '@prisma/client';

export class CreateProcurementRequestItemDto {
  @IsOptional()
  @IsEnum(ProcurementRequestLineType)
  lineType?: ProcurementRequestLineType;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsString()
  @MaxLength(1000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  category?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedUnitCost!: number;
}

export class CreateProcurementRequestDto {
  @IsOptional()
  @IsString()
  branchBusinessId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  costCenter?: string;

  @IsOptional()
  @IsDateString()
  neededBy?: string;

  @IsString()
  @MaxLength(4000)
  reason!: string;

  @IsOptional()
  @IsEnum(ProcurementRequestUrgency)
  urgency?: ProcurementRequestUrgency;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  budgetCode?: string;

  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({ require_protocol: true }, { each: true })
  attachmentUrls?: string[];

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateProcurementRequestItemDto)
  items!: CreateProcurementRequestItemDto[];
}

export class UpdateProcurementRequestDto extends CreateProcurementRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ListProcurementRequestsDto {
  @IsOptional()
  @IsEnum(ProcurementRequestStatus)
  status?: ProcurementRequestStatus;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class DecideProcurementRequestDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reason?: string;
}
