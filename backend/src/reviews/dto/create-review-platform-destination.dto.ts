import { IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateReviewPlatformDestinationDto {
  /** Freeform key, e.g. 'trustpilot', 'tripadvisor', or a custom slug the owner types in — no fixed enum, since the design's own "+ Add custom…" affordance means the platform list can't be closed. */
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  platform!: string;

  @IsString()
  @IsUrl({ require_protocol: true })
  url!: string;
}
