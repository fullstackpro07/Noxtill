import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateReturnDto } from '../orders/dto/create-return.dto';
import {
  CUSTOMER_PORTAL_FEATURES,
  CUSTOMER_PORTAL_HOME_CARDS,
} from './customer-portal.constants';

export class CustomerPortalLoginDto {
  @IsOptional()
  @IsString()
  businessSlug?: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class CustomerPortalPaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  appointmentsCursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  waitlistCursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  queueCursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  quotesCursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  ordersCursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  returnsCursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  eligibleOrdersCursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  loyaltyCursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  membershipsCursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  subscriptionsCursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  preordersCursor?: string;
}

export class CustomerPortalAcceptInviteDto {
  @IsString()
  @MinLength(32)
  token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class CustomerPortalSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsArray()
  @ArrayUnique()
  @IsIn(CUSTOMER_PORTAL_FEATURES, { each: true })
  enabledFeatures!: string[];

  @IsInt()
  @Min(24)
  @Max(720)
  inviteExpiryHours!: number;

  @IsOptional()
  @IsUrl({ require_tld: true })
  termsUrl?: string | null;

  @IsOptional()
  @IsUrl({ require_tld: true })
  privacyUrl?: string | null;
}

export class CustomerPortalLayoutDto {
  @IsArray()
  @ArrayMaxSize(CUSTOMER_PORTAL_HOME_CARDS.length)
  @ArrayUnique()
  @IsIn(CUSTOMER_PORTAL_HOME_CARDS, { each: true })
  cards!: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CUSTOMER_PORTAL_HOME_CARDS.length)
  @ValidateNested({ each: true })
  @Type(() => CustomerPortalCardLabelDto)
  labels?: CustomerPortalCardLabelDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => CustomerPortalAnnouncementDto)
  announcements?: CustomerPortalAnnouncementDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => CustomerPortalQuickActionDto)
  quickActions?: CustomerPortalQuickActionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CUSTOMER_PORTAL_HOME_CARDS.length)
  @ValidateNested({ each: true })
  @Type(() => CustomerPortalVisibilityRuleDto)
  visibilityRules?: CustomerPortalVisibilityRuleDto[];
}

export class CustomerPortalCardLabelDto {
  @IsIn(CUSTOMER_PORTAL_HOME_CARDS)
  card!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  label!: string;
}

export class CustomerPortalAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  body!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class CustomerPortalQuickActionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  label!: string;

  @IsIn(CUSTOMER_PORTAL_HOME_CARDS)
  destination!: string;
}

export class CustomerPortalVisibilityRuleDto {
  @IsIn(CUSTOMER_PORTAL_HOME_CARDS)
  card!: string;

  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  customerTags!: string[];
}

export class CustomerPortalProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @IsBoolean()
  consentMarketing?: boolean;
}

export class CustomerPortalRescheduleDto {
  @IsDateString()
  startsAt!: string;
}

export class CustomerPortalBookAppointmentDto {
  @IsString()
  serviceId!: string;

  @IsDateString()
  startsAt!: string;
}

export class CustomerPortalWaitlistDto {
  @IsString()
  serviceId!: string;

  @IsOptional()
  @IsDateString()
  preferredFrom?: string;

  @IsOptional()
  @IsDateString()
  preferredTo?: string;
}

export class CustomerPortalQueueDto {
  @IsOptional()
  @IsString()
  serviceId?: string;
}

export class CustomerPortalQuoteResponseDto {
  @IsIn(['accept', 'decline'])
  response!: 'accept' | 'decline';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CustomerPortalCommerceSubscriptionActionDto {
  @IsIn(['pause', 'resume', 'cancel', 'skip_next', 'keep_next'])
  action!: 'pause' | 'resume' | 'cancel' | 'skip_next' | 'keep_next';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CustomerPortalMembershipCancelDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class CustomerPortalReturnDto extends CreateReturnDto {}

export class CustomerPortalAccountStatusDto {
  @IsBoolean()
  active!: boolean;
}
