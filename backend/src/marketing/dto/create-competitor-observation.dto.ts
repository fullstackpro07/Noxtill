import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { COMPETITOR_OBSERVATION_KINDS } from '../marketing.constants';

export class CreateCompetitorObservationDto {
  @IsString()
  competitorId!: string;

  @IsIn(COMPETITOR_OBSERVATION_KINDS)
  kind!: (typeof COMPETITOR_OBSERVATION_KINDS)[number];

  /** The service/product name, or the offer's wording. */
  @IsString()
  @MinLength(1)
  @MaxLength(190)
  label!: string;

  /** Listed price — omit when the competitor lists the item without a price. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount?: number;

  /** Offers only — the end date if the competitor published one. */
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  /** Where it was seen — "Their website", "Instagram"… */
  @IsOptional()
  @IsString()
  @MaxLength(190)
  source?: string;

  /** When the owner saw it. Defaults to now; cannot be in the future. */
  @IsOptional()
  @IsDateString()
  observedAt?: string;
}
