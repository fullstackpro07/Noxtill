import { IsIn, IsNumber, IsString, Min } from 'class-validator';

export class CreateDepositDto {
  @IsString()
  appointmentId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsIn(['cash', 'card', 'online'])
  method!: 'cash' | 'card' | 'online';
}
