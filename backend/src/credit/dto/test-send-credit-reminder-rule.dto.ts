import { IsOptional, IsString } from 'class-validator';

export class TestSendCreditReminderRuleDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;
}
