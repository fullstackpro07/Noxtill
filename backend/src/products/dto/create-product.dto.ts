import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { VariationDto } from './variation.dto';

export class CreateProductDto {
  @IsIn(['product', 'service'])
  kind!: 'product' | 'service';

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariationDto)
  variations?: VariationDto[];

  @IsNumber()
  @Min(0)
  costPrice!: number;

  @IsNumber()
  @Min(0)
  sellingPrice!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMin?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Services, formal fields (UPD-BE-087) — only meaningful for `kind: 'service'`. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eligibleStaffIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  bufferBeforeMin?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bufferAfterMin?: number;

  @IsOptional()
  @IsBoolean()
  depositRequired?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  depositAmount?: number;
}
