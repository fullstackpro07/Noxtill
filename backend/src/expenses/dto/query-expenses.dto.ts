import { IsOptional, IsString, Matches } from 'class-validator';

export class QueryExpensesDto {
  /** YYYY-MM */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month?: string;

  @IsOptional()
  @IsString()
  category?: string;
}
