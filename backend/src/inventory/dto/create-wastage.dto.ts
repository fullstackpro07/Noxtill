import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateWastageDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsIn(['Expired', 'Damaged', 'Other'])
  reason!: 'Expired' | 'Damaged' | 'Other';

  @IsOptional()
  @IsString()
  note?: string;
}
