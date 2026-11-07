import { BiScenarioType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateBiScenarioDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEnum(BiScenarioType)
  scenarioType!: BiScenarioType;

  @IsOptional()
  @IsUUID()
  seriesId?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(500)
  priceChangePercent?: number;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  additionalStockUnits?: number;

  @IsOptional()
  @IsInt()
  @Min(-100)
  @Max(100)
  staffCountChange?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1_000_000)
  @Max(1_000_000)
  marketingBudgetChange?: number;
}
