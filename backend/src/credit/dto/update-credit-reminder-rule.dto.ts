import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateCreditReminderRuleDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  daysOverdueTrigger?: number;

  @IsOptional()
  @IsIn(['gentle', 'firm', 'final'])
  tone?: 'gentle' | 'firm' | 'final';

  @IsOptional()
  @IsIn(['whatsapp', 'sms', 'email'])
  channel?: 'whatsapp' | 'sms' | 'email' | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customMessage?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
