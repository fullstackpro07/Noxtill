import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class RecordCustomerChannelConsentDto {
  @IsIn(['email', 'sms', 'whatsapp'])
  channel!: 'email' | 'sms' | 'whatsapp';

  @IsIn(['granted', 'revoked'])
  state!: 'granted' | 'revoked';

  @IsIn([
    'customer_portal',
    'website_form',
    'paper_form',
    'recorded_call',
    'in_person',
    'other',
  ])
  source!:
    | 'customer_portal'
    | 'website_form'
    | 'paper_form'
    | 'recorded_call'
    | 'in_person'
    | 'other';

  /** An internal evidence ID only, never a phone number, email address or evidence text. */
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  evidenceReference!: string;
}
