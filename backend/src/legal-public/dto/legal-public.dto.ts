import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** Every public Legal & Trust form route, and the Noxtill inbox each one is delivered to. */
export const LEGAL_FORM_ROUTES = {
  support: { inbox: 'support@noxtill.com', label: 'Support request' },
  sales: { inbox: 'sales@noxtill.com', label: 'Sales & demo request' },
  privacy: { inbox: 'privacy@noxtill.com', label: 'Privacy request' },
  general: { inbox: 'contact@noxtill.com', label: 'General enquiry' },
  info: { inbox: 'info@noxtill.com', label: 'Information & press request' },
  accessibility: {
    inbox: 'support@noxtill.com',
    label: 'Accessibility barrier report',
  },
  'do-not-sell-or-share': {
    inbox: 'privacy@noxtill.com',
    label: 'Do Not Sell or Share opt-out request',
  },
  'subprocessor-updates': {
    inbox: 'privacy@noxtill.com',
    label: 'Subprocessor change-notice subscription',
  },
  newsletter: {
    inbox: 'info@noxtill.com',
    label: 'Noxtill updates subscription',
  },
} as const;

export type LegalFormRoute = keyof typeof LEGAL_FORM_ROUTES;

/** Public contact / privacy / accessibility / opt-out form submission from the Legal & Trust pages. */
export class LegalFormDto {
  @IsIn(Object.keys(LEGAL_FORM_ROUTES))
  route!: LegalFormRoute;

  /** Field id → value. Unknown ids are dropped server-side; values are length-capped. */
  @IsObject()
  fields!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  page?: string;

  @IsOptional()
  @IsBoolean()
  authorizedAgent?: boolean;

  @IsOptional()
  @IsBoolean()
  gpc?: boolean;

  /** Honeypot — real visitors never fill this in. */
  @IsOptional()
  @IsString()
  website?: string;
}

export const CONSENT_KINDS = [
  'cookie_preferences',
  'do_not_sell_or_share',
] as const;

/** A privacy choice made on the public website (cookie preference center or Do Not Sell opt-out). */
export class ConsentRecordDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{4,64}$/)
  consentId!: string;

  @IsIn(CONSENT_KINDS)
  kind!: (typeof CONSENT_KINDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  region?: string;

  @IsString()
  @MaxLength(20)
  policyVersion!: string;

  @IsOptional()
  @IsObject()
  categories?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  optedOut?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(35)
  language?: string;

  @IsString()
  @MaxLength(80)
  source!: string;

  @IsOptional()
  @IsBoolean()
  gpc?: boolean;
}
