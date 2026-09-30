import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CommerceBomItemDto {
  @IsString()
  componentProductId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  qtyPerUnit!: number;
}

export class CreateCommerceBomDto {
  @IsString()
  productId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CommerceBomItemDto)
  items!: CommerceBomItemDto[];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  scrapAllowancePct?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  laborCostPerUnit?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  overheadCostPerUnit?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateCommerceWorkOrderDto {
  @IsString()
  bomId!: string;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  qtyPlanned!: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  facility?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  demandSource?: string;
}

export class CompleteCommerceWorkOrderDto {
  @IsInt()
  @Min(0)
  qtyGood!: number;

  @IsInt()
  @Min(0)
  qtyScrap!: number;

  @IsBoolean()
  qualityPassed!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  qualityNotes?: string;
}

export class ReleaseCommerceWorkOrderDto {
  @IsInt()
  @Min(0)
  qtyReleased!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class CancelCommerceWorkOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
