import { IsNumber, IsString, Min } from 'class-validator';

export class PreviewVoucherDto {
  @IsString()
  code!: string;

  @IsNumber()
  @Min(0)
  requestedAmount!: number;

  @IsNumber()
  @Min(0)
  orderTotal!: number;
}
