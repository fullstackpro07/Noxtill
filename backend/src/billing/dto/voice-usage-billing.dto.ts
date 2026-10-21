import {
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class VoiceBillingDecisionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class CreateVoiceBillingDraftDto {
  @IsUUID()
  rateVersionId!: string;

  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;
}

export class VoiceBillingCreditDto {
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,6})?$/)
  amount!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}
