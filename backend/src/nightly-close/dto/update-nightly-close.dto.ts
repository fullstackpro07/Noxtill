import { IsIn, IsOptional, Matches } from 'class-validator';

export class UpdateNightlyCloseDto {
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'time must be in HH:mm 24h format',
  })
  time?: string;

  @IsOptional()
  @IsIn(['whatsapp', 'sms', 'email'])
  channel?: 'whatsapp' | 'sms' | 'email';
}
