import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class OverrideVoiceCallAttributionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  source!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  channel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  campaignId?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(4000)
  evidence!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(1000)
  reason!: string;
}

class TrackingAssignmentFields {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  source!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  channel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  campaignId?: string | null;
}

export class AddVoiceTrackingNumberDto extends TrackingAssignmentFields {
  @IsIn(['purchase', 'connect'])
  mode!: 'purchase' | 'connect';

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label!: string;

  /** `connect` only: a number that already exists in the connected Twilio account. */
  @IsOptional()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneNumber?: string;

  /** `purchase` only. */
  @IsOptional()
  @Matches(/^[A-Za-z]{2}$/)
  countryCode?: string;

  @IsOptional()
  @Matches(/^\d{3}$/)
  areaCode?: string;
}

export class AssignVoiceTrackingNumberDto extends TrackingAssignmentFields {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class DeactivateVoiceTrackingNumberDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}
