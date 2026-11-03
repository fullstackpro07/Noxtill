import { IsIn, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export const KEYWORD_INTENTS = [
  'informational',
  'navigational',
  'commercial',
  'transactional',
  'local',
] as const;

export type KeywordIntent = (typeof KEYWORD_INTENTS)[number];

export class UpdateTrackedKeywordDto {
  @IsOptional()
  @IsIn(KEYWORD_INTENTS)
  intent?: KeywordIntent | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  targetPageUrl?: string | null;
}
