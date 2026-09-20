import { IsIn, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryProfitProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([30, 90])
  window?: 30 | 90;

  /** UPD-BE-114 — see `QueryPnlDto.branchId`. */
  @IsOptional()
  @IsString()
  branchId?: string;
}
