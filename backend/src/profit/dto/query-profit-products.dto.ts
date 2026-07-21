import { IsIn, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryProfitProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([30, 90])
  window?: 30 | 90;
}
