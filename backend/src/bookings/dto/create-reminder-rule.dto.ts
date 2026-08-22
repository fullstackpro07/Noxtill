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

export class CreateReminderRuleDto {
  @IsInt()
  @Min(1)
  offsetHours!: number;

  @IsOptional()
  @IsIn(['whatsapp', 'sms', 'email'])
  channel?: 'whatsapp' | 'sms' | 'email';

  @IsOptional()
  @IsIn(REMINDER_TEMPLATE_KEYS)
  templateKey?: string;

  /** Real custom wording (UPD-BE-092 fix-it) — see `ReminderRule.customMessage` for the send-time rules. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customMessage?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
