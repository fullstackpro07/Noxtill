import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateTaxRuleDto {
  /** Omitted/null = catch-all override applying to any product with no more specific rule. */
  @IsOptional()
  @IsString()
  @MaxLength(191)
  category?: string;

  @IsString()
  @MaxLength(191)
  label!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  rate!: number;

  @IsOptional()
  @IsBoolean()
  taxInclusive?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
