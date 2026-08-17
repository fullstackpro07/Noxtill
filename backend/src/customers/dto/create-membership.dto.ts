import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateMembershipDto {
  @IsString()
  customerId!: string;

  @IsString()
  planId!: string;

  @IsIn(['cash', 'online'])
  method!: 'cash' | 'online';

  /** Required when method is 'online' — where Stripe Checkout should redirect after. */
  @IsOptional()
  @IsString()
  successUrl?: string;

  @IsOptional()
  @IsString()
  cancelUrl?: string;
}
