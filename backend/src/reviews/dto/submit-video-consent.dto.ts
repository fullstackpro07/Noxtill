import { Transform } from 'class-transformer';
import { IsBoolean } from 'class-validator';

/** Arrives as multipart form fields alongside the video file, so booleans come in as the literal
 * strings 'true'/'false' (or are simply omitted) — never trust a checkbox the customer didn't
 * actually check, so an omitted/blank field coerces to false, not undefined. */
function toBoolean({ value }: { value: unknown }): boolean {
  return value === true || value === 'true';
}

export class SubmitVideoConsentDto {
  @Transform(toBoolean)
  @IsBoolean()
  consentWebsite!: boolean;

  @Transform(toBoolean)
  @IsBoolean()
  consentSocial!: boolean;

  @Transform(toBoolean)
  @IsBoolean()
  consentPaidAds!: boolean;
}
