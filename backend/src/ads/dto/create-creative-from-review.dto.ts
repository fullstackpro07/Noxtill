import { IsIn, IsOptional, IsString } from 'class-validator';
import { IntegrationProvider } from '@prisma/client';

export class CreateCreativeFromReviewDto {
  @IsString()
  reviewId!: string;

  @IsIn(Object.values(IntegrationProvider))
  provider!: IntegrationProvider;

  @IsOptional()
  @IsString()
  campaignId?: string;
}
