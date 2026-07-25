import { IsIn, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  planKey!: string;

  @IsOptional()
  @IsIn(['stripe', 'jazzcash'])
  gateway?: string;

  @IsUrl({ require_tld: false })
  successUrl!: string;

  @IsUrl({ require_tld: false })
  cancelUrl!: string;
}
