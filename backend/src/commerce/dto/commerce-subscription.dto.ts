import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CommerceSubscriptionInterval } from '@prisma/client';

export class CreateCommerceSubscriptionPlanDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  qtyPerCycle!: number;

  @IsEnum(CommerceSubscriptionInterval)
  interval!: CommerceSubscriptionInterval;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  intervalCount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerUnit?: number | null;

  @IsOptional()
  @IsBoolean()
  allowSkip?: boolean;
}

export class SubscribeCommerceCustomerDto {
  @IsString()
  planId!: string;

  @IsString()
  customerId!: string;

  @IsDateString()
  firstRenewalAt!: string;
}

export class CommerceReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class CreateCommercePreorderCampaignDto {
  @IsString()
  productId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsDateString()
  promisedDate!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxUnits?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ChangeCommercePromiseDateDto {
  @IsDateString()
  promisedDate!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReserveCommercePreorderDto {
  @IsString()
  customerId!: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  qty!: number;
}
