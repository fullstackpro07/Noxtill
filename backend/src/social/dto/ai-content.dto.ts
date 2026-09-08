import { IsOptional, IsString } from 'class-validator';

export class GenerateCaptionDto {
  @IsString()
  topic!: string;

  @IsOptional()
  @IsString()
  tone?: string;
}

/** Hashtag suggester fix. */
export class GenerateHashtagsDto {
  @IsString()
  caption!: string;
}
