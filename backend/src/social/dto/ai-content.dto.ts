import { IsOptional, IsString } from 'class-validator';

export class GenerateCaptionDto {
  @IsString()
  topic!: string;

  @IsOptional()
  @IsString()
  tone?: string;
}
