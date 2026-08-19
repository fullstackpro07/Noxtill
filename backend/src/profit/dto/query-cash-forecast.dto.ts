import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CASH_FORECAST_MAX_DAYS } from '../cash-forecast.constants';

export class QueryCashForecastDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CASH_FORECAST_MAX_DAYS)
  days?: number;
}
