import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
} from '../notification-preferences.constants';

export class NotificationPreferenceEntryDto {
  @IsIn(NOTIFICATION_EVENTS)
  event!: (typeof NOTIFICATION_EVENTS)[number];

  @IsIn(NOTIFICATION_CHANNELS)
  channel!: (typeof NOTIFICATION_CHANNELS)[number];

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateNotificationPreferencesDto {
  /** Omitted (or `null`) writes/reads the business-wide default; a real staff userId writes a per-staff override — owner/manager only, and only for someone else, self-management needs no extra capability. */
  @IsOptional()
  @IsString()
  userId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceEntryDto)
  preferences!: NotificationPreferenceEntryDto[];
}
