import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RecordCashMovementDto {
  @IsIn(['cash_in', 'cash_out'])
  type!: 'cash_in' | 'cash_out';

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
