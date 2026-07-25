import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  segment!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @IsISO8601()
  scheduledFor?: string;
}
