import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  CommerceComplianceDocType,
  CommerceMarketEligibilityStatus,
  CommerceRiskCaseStatus,
} from '@prisma/client';

const COUNTRY_CODE = /^[A-Za-z]{2}$/;

export class UpdateCommerceRiskRuleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  threshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(730)
  windowDays?: number;
}

export class SetCommerceRiskCaseStatusDto {
  @IsEnum(CommerceRiskCaseStatus)
  status!: CommerceRiskCaseStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class CommerceComplianceDocumentFieldsDto {
  @IsOptional()
  @IsString()
  productId?: string | null;

  @IsOptional()
  @IsEnum(CommerceComplianceDocType)
  docType?: CommerceComplianceDocType;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuer?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
  @Matches(COUNTRY_CODE, {
    each: true,
    message: 'markets must contain 2-letter ISO codes',
  })
  markets?: string[];

  @IsOptional()
  @IsDateString()
  issuedAt?: string | null;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class CreateCommerceComplianceDocumentDto extends CommerceComplianceDocumentFieldsDto {
  @IsEnum(CommerceComplianceDocType)
  declare docType: CommerceComplianceDocType;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  declare title: string;
}

export class SetCommerceMarketEligibilityDto {
  @IsString()
  productId!: string;

  @Matches(COUNTRY_CODE, { message: 'market must be a 2-letter ISO code' })
  market!: string;

  @IsEnum(CommerceMarketEligibilityStatus)
  status!: CommerceMarketEligibilityStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
