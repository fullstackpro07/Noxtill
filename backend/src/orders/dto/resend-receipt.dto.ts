import { IsIn } from 'class-validator';

export class ResendReceiptDto {
  @IsIn(['digital', 'print'])
  channel!: 'digital' | 'print';
}
