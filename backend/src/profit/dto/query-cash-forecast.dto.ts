import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CASH_FORECAST_MAX_DAYS } from '../cash-forecast.constants';

export class QueryCashForecastDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CASH_FORECAST_MAX_DAYS)
  days?: number;
}
