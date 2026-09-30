import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateValidationProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string | null;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice!: number;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
