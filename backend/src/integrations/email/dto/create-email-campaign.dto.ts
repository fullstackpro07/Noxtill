import { IsString, MinLength } from 'class-validator';

export class CreateEmailCampaignDto {
  @IsString()
  @MinLength(1)
  subject!: string;

  @IsString()
  @MinLength(1)
  body!: string;

  @IsString()
  segment!: string;
}
