import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CommerceFulfillmentMappingRole,
  CommerceFulfillmentNodeType,
} from '@prisma/client';

const COUNTRY_CODE = /^[A-Za-z]{2}$/;
const CUTOFF_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CommerceFulfillmentNodeFieldsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  branchBusinessId?: string | null;

  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @IsOptional()
  @Matches(COUNTRY_CODE, { message: 'country must be a 2-letter ISO code' })
  country?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
  @Matches(COUNTRY_CODE, {
    each: true,
    message: 'serviceMarkets must contain 2-letter ISO codes',
  })
  serviceMarkets?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  processingDays?: number | null;

  @IsOptional()
  @Matches(CUTOFF_TIME, { message: 'cutoffTime must be HH:MM (24h)' })
  cutoffTime?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPerOrder?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  dailyCapacity?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class CreateCommerceFulfillmentNodeDto extends CommerceFulfillmentNodeFieldsDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  declare name: string;

  @IsEnum(CommerceFulfillmentNodeType)
  type!: CommerceFulfillmentNodeType;
}

export class UpdateCommerceFulfillmentNodeDto extends CommerceFulfillmentNodeFieldsDto {}

export class DisableCommerceFulfillmentNodeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class UpsertCommerceFulfillmentMappingDto {
  @IsString()
  nodeId!: string;

  @IsString()
  productId!: string;

  @IsEnum(CommerceFulfillmentMappingRole)
  role!: CommerceFulfillmentMappingRole;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  priority?: number;
}

export class CommerceRoutingAllocationDto {
  @IsString()
  orderItemId!: string;

  @IsString()
  nodeId!: string;
}

export class CommerceRoutingCandidatesQueryDto {
  @IsOptional()
  @Matches(COUNTRY_CODE, {
    message: 'destinationCountry must be a 2-letter ISO code',
  })
  destinationCountry?: string;
}

export class AssignCommerceRouteDto {
  @IsOptional()
  @Matches(COUNTRY_CODE, {
    message: 'destinationCountry must be a 2-letter ISO code',
  })
  destinationCountry?: string;

  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CommerceRoutingAllocationDto)
  allocations!: CommerceRoutingAllocationDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CancelCommerceRouteDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
