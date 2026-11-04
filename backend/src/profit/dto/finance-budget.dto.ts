import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class QueryFinanceBudgetsDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be in YYYY-MM format',
  })
  month!: string;
}

export class SaveFinanceBudgetDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month must be in YYYY-MM format',
  })
  month!: string;

  @IsString()
  @MaxLength(191)
  @MinLength(1)
  category!: string;

  @IsString()
  @Matches(/^\d{1,10}(\.\d{1,2})?$/, {
    message:
      'amount must be a non-negative decimal with at most two decimal places',
  })
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class FinanceBudgetDecisionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}
