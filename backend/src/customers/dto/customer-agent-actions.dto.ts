import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const CUSTOMER_FOLLOW_UP_OUTCOMES = [
  'contacted',
  'no_answer',
  'customer_response_recorded',
  'follow_up_scheduled',
  'no_contact_needed',
] as const;

export type CustomerFollowUpOutcome =
  (typeof CUSTOMER_FOLLOW_UP_OUTCOMES)[number];

export class CompleteCustomerFollowUpDto {
  @IsOptional()
  @IsIn(CUSTOMER_FOLLOW_UP_OUTCOMES)
  outcome?: CustomerFollowUpOutcome;
}

export class CreateCustomerFollowUpTaskDto {
  @IsString()
  @MinLength(3)
  @MaxLength(191)
  title!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason!: string;

  @IsOptional()
  @IsIn(['urgent', 'normal', 'low'])
  priority?: 'urgent' | 'normal' | 'low';

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  assigneeStaffId?: string | null;

  @IsString()
  @MinLength(8)
  @MaxLength(96)
  idempotencyKey!: string;
}

export class CreateCustomerMessageDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(96)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  followUpTaskId?: string | null;
}

export type CustomerMessageDraftPurpose =
  | 'booking_follow_up'
  | 'order_follow_up'
  | 'support_follow_up'
  | 'winback_follow_up'
  | 'feedback_request'
  | 'general_follow_up';

export class GenerateCustomerMessageDraftDto {
  @IsIn([
    'booking_follow_up',
    'order_follow_up',
    'support_follow_up',
    'winback_follow_up',
    'feedback_request',
    'general_follow_up',
  ])
  purpose!: CustomerMessageDraftPurpose;

  @IsString()
  @MinLength(8)
  @MaxLength(96)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  followUpTaskId?: string | null;
}

export class UpdateCustomerMessageDraftDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}
