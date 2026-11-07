import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { ProductValidationDecision } from '@prisma/client';

export class ProductValidationDecisionDto {
  @IsEnum(ProductValidationDecision)
  decision!: ProductValidationDecision;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  @MaxLength(2000)
  reason!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
