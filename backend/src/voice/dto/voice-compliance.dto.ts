import {
  Equals,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { VoicePolicyCallerType } from '@prisma/client';

export class VoiceCompliancePolicyFieldsDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  aiDisclosureText!: string;

  @IsBoolean()
  recordingAllowed!: boolean;

  @ValidateIf((value: VoiceCompliancePolicyFieldsDto) => value.recordingAllowed)
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  recordingNoticeText?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  recordingRetentionDays?: number | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  allowedWindowStart?: string | null;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  allowedWindowEnd?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timeZone?: string | null;
}

export class CreateVoiceCompliancePolicyDto extends VoiceCompliancePolicyFieldsDto {
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;

  @Matches(/^[a-z][a-z0-9_]{1,39}$/)
  purpose!: string;

  @IsEnum(VoicePolicyCallerType)
  callerType!: VoicePolicyCallerType;
}

export class CreateVoiceCompliancePolicyVersionDto extends VoiceCompliancePolicyFieldsDto {}

export class PublishVoiceCompliancePolicyDto {
  @IsString()
  @MinLength(4)
  @MaxLength(191)
  legalReviewReference!: string;

  @Equals(true)
  confirmLegalReview!: true;
}

export class DisableVoiceCompliancePolicyDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class CreateVoiceConsentEvidenceDto {
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @Matches(/^[a-z][a-z0-9_]{1,39}$/)
  purpose!: string;

  @IsOptional()
  @IsEnum(VoicePolicyCallerType)
  callerType?: VoicePolicyCallerType;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  source!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(5000)
  noticeText!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  evidenceReference!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  legalBasis!: string;

  @IsDateString()
  grantedAt!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @Equals(true)
  evidenceReviewed!: true;
}

export class RevokeVoiceConsentDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class CreateVoiceSuppressionDto {
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164!: string;

  @IsOptional()
  @Matches(/^[a-z][a-z0-9_]{1,39}$/)
  purpose?: string | null;

  @IsString()
  @MinLength(2)
  @MaxLength(40)
  source!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;

  @IsDateString()
  effectiveAt!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}

export class RevokeVoiceSuppressionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class CheckVoiceEligibilityDto {
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164!: string;

  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;

  @Matches(/^[a-z][a-z0-9_]{1,39}$/)
  purpose!: string;

  @IsEnum(VoicePolicyCallerType)
  callerType!: VoicePolicyCallerType;
}
