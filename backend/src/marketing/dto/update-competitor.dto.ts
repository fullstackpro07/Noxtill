import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { COMPETITOR_PRIORITIES } from '../marketing.constants';

export class UpdateCompetitorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  metaPageId?: string;

  /** How closely the owner wants this competitor watched. */
  @IsOptional()
  @IsIn(COMPETITOR_PRIORITIES)
  priority?: (typeof COMPETITOR_PRIORITIES)[number];

  /**
   * Public Instagram username. A leading `@` and an instagram.com URL are tolerated and stripped;
   * an empty string clears it.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .trim()
          .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
          .replace(/[/?#].*$/, '')
          .replace(/^@/, '')
          .toLowerCase()
      : value,
  )
  @Matches(/^([a-z0-9._]{1,30})?$/, {
    message: 'instagramHandle must be a valid Instagram username',
  })
  instagramHandle?: string;
}
