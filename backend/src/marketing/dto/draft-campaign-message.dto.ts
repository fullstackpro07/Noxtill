import { IsOptional, IsString, MinLength } from 'class-validator';

export class DraftCampaignMessageDto {
  @IsString()
  @MinLength(1)
  objective!: string;

  @IsString()
  @MinLength(1)
  audienceLabel!: string;

  /** Real coupon code, if the builder has one attached — re-validated server-side, never trusted as-is. */
  @IsOptional()
  @IsString()
  couponCode?: string;
}
