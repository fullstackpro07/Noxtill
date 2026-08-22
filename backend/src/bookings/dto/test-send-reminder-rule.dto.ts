import { IsOptional, IsString } from 'class-validator';

/** Test send (UPD-FE-074) — an owner test send needs somewhere to deliver to when they aren't
 * testing against a real customer/appointment. Both optional: omit both to no-op with a clear error. */
export class TestSendReminderRuleDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;
}
