import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { REMINDER_TEMPLATE_KEYS } from '../bookings.constants';

export class UpdateReminderRuleDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  offsetHours?: number;

  @IsOptional()
  @IsIn(['whatsapp', 'sms', 'email'])
  channel?: 'whatsapp' | 'sms' | 'email' | null;

  @IsOptional()
  @IsIn(REMINDER_TEMPLATE_KEYS)
  templateKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customMessage?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
