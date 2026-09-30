import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const LISTING_CHANNELS = [
  'shopify',
  'woocommerce',
  'amazon',
  'ebay',
  'etsy',
  'tiktok_shop',
  'google_merchant',
  'other',
] as const;

export class ListingMerchantEvidenceDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  statement!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reference!: string;
}

export class GenerateCommerceListingDraftDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @IsIn(LISTING_CHANNELS)
  channel!: (typeof LISTING_CHANNELS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  market?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(?:-[A-Z]{2})?$/)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  brandVoice?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ListingMerchantEvidenceDto)
  merchantEvidence?: ListingMerchantEvidenceDto[];
}

export class RegenerateCommerceListingDraftDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ListingMerchantEvidenceDto)
  merchantEvidence?: ListingMerchantEvidenceDto[];
}

export class EditCommerceListingDraftDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsObject()
  content!: Record<string, unknown>;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ListingMerchantEvidenceDto)
  merchantEvidence?: ListingMerchantEvidenceDto[];
}

export class ApproveCommerceListingDraftDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @IsBoolean()
  confirmedSourceAccuracy!: boolean;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class CommerceListingDraftQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(LISTING_CHANNELS)
  channel?: (typeof LISTING_CHANNELS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  market?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  productId?: string;

  @IsOptional()
  @IsIn(['draft', 'review_required', 'approved'])
  status?: 'draft' | 'review_required' | 'approved';
}
