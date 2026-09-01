import { IsIn, IsOptional, IsString } from 'class-validator';
import { StockMovementKind } from '@prisma/client';

const MOVEMENT_KINDS: StockMovementKind[] = [
  'purchase',
  'sale',
  'wastage',
  'adjustment',
  'return',
  'transfer_out',
  'transfer_in',
];

export class QueryMovementsDto {
  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsIn(MOVEMENT_KINDS)
  kind?: StockMovementKind;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
