import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class VariantOptionInputDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  priceOverride?: number;
}

export class CreateVariantSetDto {
  @IsString()
  name!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantOptionInputDto)
  options!: VariantOptionInputDto[];
}
