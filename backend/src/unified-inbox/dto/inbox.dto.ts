import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  ASSIGN_MODES,
  LANGUAGES,
  RULE_TRIGGERS,
  TONES,
} from '../inbox.constants';

export const CONVERSATION_VIEWS = [
  'open',
  'unassigned',
  'assigned',
  'waiting',
  'unread',
  'snoozed',
  'closed',
  'mine',
  'starred',
] as const;
export const CONVERSATION_SORTS = [
  'newest',
  'oldest',
  'waiting',
  'money',
] as const;

export class ListConversationsQueryDto {
  @IsOptional()
  @IsIn(CONVERSATION_VIEWS)
  view?: (typeof CONVERSATION_VIEWS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(CONVERSATION_SORTS)
  sort?: (typeof CONVERSATION_SORTS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  @IsOptional()
  @IsString()
  assignee?: string;
}

export class ReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;

  @IsOptional()
  @IsString()
  savedReplyId?: string;
}

export class NoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}

export class AssignDto {
  @ValidateIf((_, v) => v !== null)
  @IsString()
  userId!: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class SnoozeDto {
  @IsInt()
  @Min(5)
  @Max(60 * 24 * 14)
  minutes!: number;
}

export class StarDto {
  @IsBoolean()
  starred!: boolean;
}

export class TagsDto {
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags!: string[];
}

export class ComposeDto {
  @IsIn(['whatsapp', 'sms', 'email'])
  channel!: 'whatsapp' | 'sms' | 'email';

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  name?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}

export class TranslateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}

export class SendDraftDto {
  /** Present when the person changed the draft before sending — recorded as "edited". */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text?: string;
}

export class SavedReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  folder!: string;

  @IsString()
  @Matches(/^[a-z0-9-]{1,40}$/, {
    message: 'Shortcut can only use lowercase letters, numbers and dashes.',
  })
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class UpdateSavedReplyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  folder?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{1,40}$/, {
    message: 'Shortcut can only use lowercase letters, numbers and dashes.',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body?: string;
}

export class FolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;
}

export class FillReplyDto {
  @IsString()
  conversationId!: string;
}

export class RuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsIn(RULE_TRIGGERS)
  trigger!: (typeof RULE_TRIGGERS)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  keywords?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60 * 24 * 7)
  minutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tag?: string;

  @IsOptional()
  @IsBoolean()
  pinToTop?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  assigneeUserId?: string | null;

  @IsOptional()
  @IsBoolean()
  flag?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  keywords?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60 * 24 * 7)
  minutes?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(40)
  tag?: string | null;

  @IsOptional()
  @IsBoolean()
  pinToTop?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  assigneeUserId?: string | null;

  @IsOptional()
  @IsBoolean()
  flag?: boolean;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  message?: string | null;
}

export class UpdateInboxSettingsDto {
  @IsOptional()
  @IsIn(TONES)
  tone?: string;

  @IsOptional()
  @IsIn(LANGUAGES)
  language?: string;

  @IsOptional()
  @IsIn(ASSIGN_MODES)
  assignMode?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsObject()
  workingHours?: Record<string, unknown> | null;

  @IsOptional()
  @IsBoolean()
  aiReadRecords?: boolean;

  @IsOptional()
  @IsBoolean()
  aiAutoDraft?: boolean;

  @IsOptional()
  @IsBoolean()
  aiFactsOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  aiNextAction?: boolean;

  @IsOptional()
  @IsBoolean()
  aiSummarise?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyUnassigned?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyMoney?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  firstReplyTargetMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  emailReplyTargetMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  moneyReplyTargetMin?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  unassignedTargetMin?: number;
}

export class TimelineQueryDto {
  @IsOptional()
  @IsIn(['Everything', 'Messages', 'Orders', 'Payments', 'Bookings', 'Reviews'])
  filter?: string;
}
