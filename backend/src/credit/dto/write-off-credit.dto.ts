import { IsNumber, IsString, Min } from 'class-validator';

export class WriteOffCreditDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  reason!: string;

  /** Must exactly equal WRITE_OFF_CONFIRM_PHRASE — a typed-confirmation gate for an irreversible action. */
  @IsString()
  confirm!: string;
}
