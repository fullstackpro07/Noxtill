import { IsIn, IsOptional, IsString } from 'class-validator';
import { IntegrationProvider } from '@prisma/client';

export class CreateAdCreativeDto {
  @IsIn(Object.values(IntegrationProvider))
  provider!: IntegrationProvider;

  @IsOptional()
  @IsString()
  campaignId?: string;

  @IsString()
  headline!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  mediaKey?: string;

  /** A/B-test setup depth fix — creatives sharing this real, user-chosen key are variants of one experiment. */
  @IsOptional()
  @IsString()
  experimentKey?: string;
}
