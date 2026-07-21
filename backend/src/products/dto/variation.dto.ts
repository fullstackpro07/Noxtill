import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class VariationOptionDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  priceOverride?: number;
}

export class VariationDto {
  @IsString()
  label!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariationOptionDto)
  options!: VariationOptionDto[];
}
