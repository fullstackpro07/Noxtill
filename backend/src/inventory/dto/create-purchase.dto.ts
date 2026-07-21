import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePurchaseDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  qty!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsString()
  supplier?: string;
}
