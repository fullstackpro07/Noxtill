import { IsString, MaxLength, MinLength } from 'class-validator';

export class SendDeadHoursOfferDto {
  /** Real Segment id, or one of the legacy hardcoded keys (vip/new/lapsed/all/tag) — see `SegmentsService.getSegment`. */
  @IsString()
  segment!: string;

  /** The owner's approved (possibly edited) offer text — never auto-sent without this explicit round-trip. */
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  offerText!: string;
}
