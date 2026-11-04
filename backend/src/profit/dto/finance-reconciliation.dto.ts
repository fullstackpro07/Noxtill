import {
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ImportFinanceBankStatementDto {
  @IsUUID()
  financeAccountId!: string;

  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currencyCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500_000)
  csv!: string;
}

export class FinanceReconciliationMatchDto {
  @IsUUID()
  journalLineId!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  reason!: string;
}

export class FinanceReconciliationDecisionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  reason!: string;
}
