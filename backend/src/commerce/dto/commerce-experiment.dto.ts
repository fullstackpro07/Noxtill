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
import {
  CommerceExperimentMetric,
  CommerceExperimentStatus,
  CommerceExperimentType,
} from '@prisma/client';

export class CreateCommerceExperimentDto {
  @IsUUID()
  productId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  name!: string;

  @IsEnum(CommerceExperimentType)
  type!: CommerceExperimentType;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  hypothesis!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  changeDescription!: string;

  @IsEnum(CommerceExperimentMetric)
  primaryMetric!: CommerceExperimentMetric;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-100)
  @Max(100)
  minMarginPct?: number;

  @IsOptional()
  @IsInt()
  @Min(7)
  @Max(180)
  plannedDays?: number;
}

export class DecideCommerceExperimentDto {
  @IsEnum(CommerceExperimentStatus)
  decision!: CommerceExperimentStatus;

  @IsString()
  @MaxLength(2000)
  note!: string;
}
