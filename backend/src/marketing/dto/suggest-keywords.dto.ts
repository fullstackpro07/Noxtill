import { IsOptional, IsString } from 'class-validator';

/** AI keyword suggestions (UPD-BE-128) — seedTopic is optional; falls back to the business's own name/categories. */
export class SuggestKeywordsDto {
  @IsOptional()
  @IsString()
  seedTopic?: string;
}
