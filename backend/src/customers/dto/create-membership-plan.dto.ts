import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMembershipPlanDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(0.01)
  price!: number;

  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  interval?: 'monthly' | 'yearly';

  @IsOptional()
  @IsString()
  benefits?: string;

  @IsOptional()
  @IsString()
  stripePriceId?: string;
}
