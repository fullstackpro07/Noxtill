import { IsIn, IsNumber, IsString, Matches, Min } from 'class-validator';
import { PayrollLineItemType } from '@prisma/client';

export class CreatePayrollLineItemDto {
  @IsString()
  staffUserId!: string;

  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month!: string;

  @IsString()
  label!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsIn(['add', 'deduct'])
  type!: PayrollLineItemType;
}
