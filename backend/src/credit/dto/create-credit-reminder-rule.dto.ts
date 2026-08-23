import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCreditReminderRuleDto {
  @IsInt()
  @Min(1)
  daysOverdueTrigger!: number;

  @IsOptional()
  @IsIn(['gentle', 'firm', 'final'])
  tone?: 'gentle' | 'firm' | 'final';

  @IsOptional()
  @IsIn(['whatsapp', 'sms', 'email'])
  channel?: 'whatsapp' | 'sms' | 'email';

  /** Real custom wording — see `CreditReminderRule.customMessage` for the send-time rules. */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customMessage?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
