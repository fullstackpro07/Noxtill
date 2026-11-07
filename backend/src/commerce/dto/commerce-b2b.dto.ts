import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
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
import { CommerceB2bPriceListStatus } from '@prisma/client';

export class CommerceB2bTierFieldsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  defaultDiscountPct?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minOrderValue?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number | null;
}

export class CreateCommerceB2bTierDto extends CommerceB2bTierFieldsDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  declare name: string;
}

export class CommerceB2bPriceListItemDto {
  @IsString()
  productId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minQty?: number;
}

export class CreateCommerceB2bPriceListDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CommerceB2bPriceListItemDto)
  items?: CommerceB2bPriceListItemDto[];
}

export class UpdateCommerceB2bPriceListDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @IsOptional()
  @IsEnum(CommerceB2bPriceListStatus)
  status?: CommerceB2bPriceListStatus;
}

export class CommerceB2bAccountFieldsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  taxId?: string | null;

  @IsOptional()
  @IsString()
  tierId?: string | null;

  @IsOptional()
  @IsString()
  priceListId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minOrderValue?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class CreateCommerceB2bAccountDto extends CommerceB2bAccountFieldsDto {
  @IsString()
  customerId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  declare companyName: string;
}

export class SuspendCommerceB2bAccountDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class CommerceB2bQuoteLineDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

export class PreviewCommerceB2bQuoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CommerceB2bQuoteLineDto)
  lines!: CommerceB2bQuoteLineDto[];
}
