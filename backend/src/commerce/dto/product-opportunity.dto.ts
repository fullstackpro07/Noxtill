import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { ProductOpportunityRisk } from '@prisma/client';

export class CreateProductOpportunityDto {
  @IsString()
  title!: string;

  /** Human-readable provenance, for example "Manual research" or a configured provider name. */
  @IsString()
  source!: string;

  @IsOptional()
  @IsString()
  sourceReference?: string | null;

  @IsOptional()
  @IsString()
  externalEntityId?: string | null;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsString()
  market?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  observedPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedLandedCost?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  demandSignal?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  competitionScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  trendVelocity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  storeFitScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  marginEstimate?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  supplierCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  shippingEstimate?: number;

  @IsOptional()
  @IsEnum(ProductOpportunityRisk)
  risk?: ProductOpportunityRisk;

  @IsOptional()
  @IsString()
  evidence?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  confidence?: number;

  @IsOptional()
  @IsDateString()
  sourceFreshAt?: string | null;
}

export class UpdateProductOpportunityDto extends PartialType(
  CreateProductOpportunityDto,
) {
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class ProductOpportunityActionDto {
  @IsOptional()
  @IsString()
  reason?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
