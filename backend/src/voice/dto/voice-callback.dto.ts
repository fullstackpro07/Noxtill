import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class PlaceVoiceCallbackDto {
  /**
   * Staff attest the caller asked to be called back; recorded as consent evidence tied to the
   * call. Without it, eligibility relies on consent already on file.
   */
  @IsOptional()
  @IsBoolean()
  callerRequestedCallback?: boolean;
}

export const VOICE_CALLBACK_OUTCOMES = [
  'resolved',
  'booked',
  'no_longer_needed',
  'unreachable',
  'wrong_number',
  'do_not_call',
] as const;

export class CompleteVoiceCallbackDto {
  @IsIn(VOICE_CALLBACK_OUTCOMES)
  outcome!: (typeof VOICE_CALLBACK_OUTCOMES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
