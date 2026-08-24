import {
  ArrayMinSize,
  IsArray,
  IsHexColor,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** UPD-BE-104. Everything optional — a PATCH only touches the fields it sends, same convention as UpdateFeedbackDto. */
export class UpdateReviewSettingsDto {
  /** Writes through to `Business.publicReviewUrl` (already a dedicated column) — send `''` to clear it. */
  @IsOptional()
  @IsString()
  publicReviewUrl?: string;

  @IsOptional()
  @IsIn(['google', 'facebook', 'yelp', 'other'])
  publicReviewPlatform?: string;

  /** Overrides REVIEW_REMINDER_DAY_OFFSETS for this business, e.g. `[3, 7]` or `[2, 5, 10]`. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(30, { each: true })
  reminderDayOffsets?: number[];

  /** Per-language default reply text, e.g. `{"en":"Thanks so much!","es":"..."}` — pre-fills the reply box, never auto-sent. */
  @IsOptional()
  @IsObject()
  replyTemplates?: Record<string, string>;

  /** UPD-FE-086's branding editor — actually rendered on the public rating page, the review widget, and the QR poster (not just stored). Same `<input type="color">`-fed hex-string shape as `BookingLinkSettings.brandColor`. */
  @IsOptional()
  @IsHexColor()
  brandColor?: string;
}
