import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RecordPaymentDto {
  @IsString()
  customerId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsIn(['cash', 'card', 'online'])
  method!: 'cash' | 'card' | 'online';

  @IsOptional()
  @IsString()
  note?: string;
}
