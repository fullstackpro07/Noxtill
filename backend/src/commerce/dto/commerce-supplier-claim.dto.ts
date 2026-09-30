import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  CommerceSupplierClaimCommunicationChannel,
  CommerceSupplierClaimCommunicationDirection,
  CommerceSupplierClaimEvidenceType,
  CommerceSupplierClaimSettlementType,
} from '@prisma/client';

export class CommerceSupplierClaimItemDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  purchaseOrderItemId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @IsInt()
  @Min(1)
  quantityAffected!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  productLossAmount!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  freightLossAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otherLossAmount?: number;
}

export class CreateCommerceSupplierClaimDto {
  @IsString()
  supplierId!: string;

  @IsOptional()
  @IsString()
  purchaseOrderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  reasonCode!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  reason!: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CommerceSupplierClaimItemDto)
  items!: CommerceSupplierClaimItemDto[];
}

export class CommerceSupplierClaimVersionDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CommerceSupplierClaimActionDto extends CommerceSupplierClaimVersionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;
}

export class AddCommerceSupplierClaimEvidenceDto {
  @IsEnum(CommerceSupplierClaimEvidenceType)
  evidenceType!: CommerceSupplierClaimEvidenceType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class RecordCommerceSupplierClaimCommunicationDto {
  @IsEnum(CommerceSupplierClaimCommunicationChannel)
  channel!: CommerceSupplierClaimCommunicationChannel;

  @IsEnum(CommerceSupplierClaimCommunicationDirection)
  direction!: CommerceSupplierClaimCommunicationDirection;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  summary!: string;

  @IsDateString()
  occurredAt!: string;
}

export class RecordCommerceSupplierClaimSettlementDto extends CommerceSupplierClaimVersionDto {
  @IsEnum(CommerceSupplierClaimSettlementType)
  settlementType!: CommerceSupplierClaimSettlementType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  financialReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsDateString()
  settledAt?: string;
}
