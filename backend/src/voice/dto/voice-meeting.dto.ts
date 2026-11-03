import {
  IsDateString,
  IsBoolean,
  IsEmail,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateVoiceMeetingDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsDateString()
  scheduledAt!: string;

  @IsInt()
  @Min(15)
  @Max(240)
  durationMin!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  timeZone!: string;

  @IsString()
  hostBusinessUserId!: string;

  @IsOptional()
  @IsString()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  appointmentId?: string | null;

  @IsOptional()
  @IsString()
  recordingPolicyVersionId?: string | null;
}

export class RescheduleVoiceMeetingDto {
  @IsDateString()
  scheduledAt!: string;

  @IsInt()
  @Min(15)
  @Max(240)
  durationMin!: number;
}

export class CreateVoiceMeetingInviteDto {
  @IsEmail()
  @MaxLength(191)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  guestName?: string | null;
}

export class VoiceMeetingReasonDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  reason!: string;
}

export class VoiceMeetingAdmissionDto extends VoiceMeetingReasonDto {
  @IsIn(['admitted', 'denied'])
  admission!: 'admitted' | 'denied';
}

export class VoiceMeetingModerationDto extends VoiceMeetingReasonDto {
  @IsIn(['mute', 'remove'])
  action!: 'mute' | 'remove';
}

export class VoiceMeetingRecordingConsentDto {
  @IsBoolean()
  accepted!: boolean;
}
