import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class PreviewCouponDto {
  @IsString()
  code!: string;

  @IsNumber()
  @Min(0)
  subtotal!: number;

  @IsOptional()
  @IsString()
  customerId?: string;
}
