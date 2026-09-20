import { Matches, IsString } from 'class-validator';

export class MarkCommissionPaidDto {
  @IsString()
  staffUserId!: string;

  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month!: string;
}
