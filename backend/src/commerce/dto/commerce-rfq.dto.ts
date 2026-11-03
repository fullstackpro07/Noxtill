import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CommerceRfqItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minimumQty?: number;

  @IsOptional()
  @IsString()
  specifications?: string;
}

export class CreateCommerceRfqDto {
  @IsString()
  @MinLength(3)
  requirement!: string;

  @IsOptional()
  @IsString()
  market?: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsOptional()
  @IsString()
  destination?: string;

  @IsOptional()
  @IsString()
  terms?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsString()
  sourceOpportunityId?: string | null;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CommerceRfqItemDto)
  items!: CommerceRfqItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  supplierIds?: string[];
}

export class UpdateCommerceRfqDto extends PartialType(CreateCommerceRfqDto) {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CommerceRfqVersionDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class MarkRfqSuppliersSentDto extends CommerceRfqVersionDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  supplierIds!: string[];
}

export class CommerceSupplierQuoteItemDto {
  @IsString()
  rfqItemId!: string;

  @IsInt()
  @Min(1)
  quotedQty!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minimumQty?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;
}

export class RecordCommerceSupplierQuoteDto {
  @IsString()
  invitationId!: string;

  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  freight!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  duties!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CommerceSupplierQuoteItemDto)
  items!: CommerceSupplierQuoteItemDto[];
}

export class AwardCommerceRfqDto extends CommerceRfqVersionDto {
  @IsString()
  quoteId!: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}

export class CloseCommerceRfqDto extends CommerceRfqVersionDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
