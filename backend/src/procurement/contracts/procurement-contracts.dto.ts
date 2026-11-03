import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ContractTermsDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) documentUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(10) effectiveFrom?: string;
  @IsOptional() @IsString() @MaxLength(10) expiresAt?: string | null;
  @IsOptional() @IsBoolean() autoRenew?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(730) noticeDays?: number | null;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsString() @MaxLength(200) paymentTerms?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(20) discountTiers?: unknown[];
  @IsOptional() @IsString() @MaxLength(10) priceValidUntil?: string | null;
  @IsOptional() @IsInt() @Min(1) minimumOrderQty?: number | null;
  @IsOptional() @IsString() @MaxLength(2000) sla?: string | null;
  @IsOptional() @IsString() @MaxLength(300) deliveryTerms?: string | null;
  @IsOptional() @IsString() @MaxLength(20) incoterms?: string | null;
  @IsOptional() @IsString() @MaxLength(300) warranty?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  complianceRequirements?: string[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  categories?: string[];
  @IsOptional() @IsString() @MaxLength(64) ownerUserId?: string | null;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class CreateContractDto extends ContractTermsDto {
  @IsString() @MaxLength(64) supplierId!: string;
  @IsString() @MaxLength(80) reference!: string;
  @IsString() @MaxLength(200) declare title: string;
  @IsString() @MaxLength(10) declare effectiveFrom: string;
}

export class ContractStatusDto {
  @IsIn(['active', 'terminated']) status!: 'active' | 'terminated';
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class AnalyticsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(7) @Max(730) days?: number;
  @IsOptional() @IsString() @MaxLength(64) supplierId?: string;
  @IsOptional() @IsString() @MaxLength(120) department?: string;
}
