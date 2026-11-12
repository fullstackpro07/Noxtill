import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PURCHASABLES } from '../usage.constants';

export class ChangePlanDto {
  @IsString()
  @MaxLength(32)
  planKey!: string;

  @IsIn(['month', 'year'])
  interval!: 'month' | 'year';

  /** The customer ticked "I authorize Noxtill to charge…" (required for an immediate upgrade). */
  @IsOptional()
  @IsBoolean()
  authorized?: boolean;
}

export class PurchaseDto {
  @IsIn(Object.keys(PURCHASABLES))
  key!: keyof typeof PURCHASABLES;

  /** "I approve this purchase at the price shown." */
  @IsBoolean()
  approved!: boolean;

  /** Required for phone numbers: the country the number is for (price is per country). */
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;
}

export class SpendCapDto {
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100000)
  capUsd!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  maxCallMinutes?: number;
}

export class PaymentSetupDto {
  @IsString()
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsBoolean()
  makeDefault?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  replaceId?: string;
}

export class PasswordDto {
  @IsString()
  @MaxLength(200)
  password!: string;
}

export class ReserveDto {
  @IsString()
  @MaxLength(96)
  operationCode!: string;

  @IsString()
  @MaxLength(150)
  idempotencyKey!: string;
}

export class CommitDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  actualQuantity?: number;
}

export class ReleaseDto {
  @IsString()
  @MaxLength(150)
  reason!: string;
}
