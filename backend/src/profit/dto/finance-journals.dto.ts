import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const MONEY_PATTERN = /^\d{1,14}(\.\d{1,2})?$/;

export class CreateFinanceAccountDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,64}$/)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(191)
  name!: string;

  @IsString()
  @Matches(/^(asset|liability|equity|revenue|expense)$/)
  type!: string;
}

export class CreateFinanceJournalLineDto {
  @IsString()
  @MinLength(1)
  accountId!: string;

  @IsString()
  @Matches(MONEY_PATTERN)
  debit!: string;

  @IsString()
  @Matches(MONEY_PATTERN)
  credit!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  memo?: string;
}

export class CreateFinanceJournalDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._/-]{1,80}$/)
  reference!: string;

  @IsDateString()
  entryDate!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  description!: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateFinanceJournalLineDto)
  lines!: CreateFinanceJournalLineDto[];
}

export class FinanceJournalDecisionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  reason!: string;
}

export class FinanceJournalReversalDto {
  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  reason!: string;
}

export class FinancePeriodLockDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  reason!: string;
}
