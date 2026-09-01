import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateWastageDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsIn(['Expired', 'Damaged', 'Theft', 'Other'])
  reason!: 'Expired' | 'Damaged' | 'Theft' | 'Other';

  @IsOptional()
  @IsString()
  note?: string;
}
