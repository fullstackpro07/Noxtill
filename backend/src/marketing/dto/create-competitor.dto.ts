import { IsIn, IsOptional, IsString } from 'class-validator';
import { COMPETITOR_PRIORITIES } from '../marketing.constants';

export class CreateCompetitorDto {
  /** Real display name (UPD-BE-128) — from the selected Google Place's own name, or the owner's free-text entry when Places search isn't used. */
  @IsString()
  name!: string;

  /** A Google Place ID from the search-and-select flow (or, as a fallback, any stable reference the owner recognizes). */
  @IsString()
  platformRef!: string;

  /** Defaults to `keep_an_eye` when omitted. */
  @IsOptional()
  @IsIn(COMPETITOR_PRIORITIES)
  priority?: (typeof COMPETITOR_PRIORITIES)[number];
}
