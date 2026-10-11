import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DiscountCalculateDto {
  @IsNumber()
  @Min(0)
  originalUnitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number = 1;

  @IsOptional()
  @IsString()
  currency?: string = 'USD';

  @IsIn(['percent', 'fixed', 'stacked'])
  discountMode: 'percent' | 'fixed' | 'stacked';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsArray()
  stackedDiscounts?: number[];

  @IsOptional()
  @IsIn(['none', 'exclusive', 'inclusive'])
  taxMode?: 'none' | 'exclusive' | 'inclusive' = 'none';

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercent?: number = 0;
}

export class MarginCalculateDto {
  @IsNumber()
  @Min(0)
  salePrice: number;

  @IsNumber()
  @Min(0)
  costOfGoods: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  laborCost?: number = 0;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overheadCost?: number = 0;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  paymentFeePercent?: number = 0;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99.9)
  targetGrossMargin?: number;

  @IsOptional()
  @IsString()
  currency?: string = 'USD';
}

export class BreakEvenCalculateDto {
  @IsNumber()
  @Min(0)
  fixedCosts: number;

  @IsNumber()
  @Min(0.01)
  sellingPricePerUnit: number;

  @IsNumber()
  @Min(0)
  variableCostPerUnit: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  targetProfit?: number = 0;

  @IsOptional()
  @IsIn(['month', 'year', 'quarter'])
  period?: 'month' | 'year' | 'quarter' = 'month';

  @IsOptional()
  @IsString()
  currency?: string = 'USD';
}

export class InvoiceLineDto {
  @IsString()
  description: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercent?: number = 0;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number = 0;
}

export class InvoicePartyDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  taxId?: string;
}

export class InvoiceCalculateDto {
  @IsOptional()
  @IsString()
  currency?: string = 'USD';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => InvoicePartyDto)
  seller?: InvoicePartyDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => InvoicePartyDto)
  buyer?: InvoicePartyDto;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  issueDate?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class QrWifiDto {
  @IsString()
  ssid: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsIn(['WPA', 'WEP', 'nopass'])
  encryption?: 'WPA' | 'WEP' | 'nopass' = 'WPA';

  @IsOptional()
  @IsBoolean()
  hidden?: boolean = false;
}

export class QrVcardDto {
  @IsString()
  firstName: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  org?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  url?: string;
}

export class QrEncodeDto {
  @IsIn(['url', 'text', 'wifi', 'sms', 'phone', 'email', 'vcard'])
  qrType: 'url' | 'text' | 'wifi' | 'sms' | 'phone' | 'email' | 'vcard';

  @IsOptional()
  @IsString()
  payload?: string;

  @IsOptional()
  @IsIn(['L', 'M', 'Q', 'H'])
  errorCorrection?: 'L' | 'M' | 'Q' | 'H' = 'M';

  @IsOptional()
  @IsString()
  foregroundColor?: string = '#000000';

  @IsOptional()
  @IsString()
  backgroundColor?: string = '#FFFFFF';

  @IsOptional()
  @IsNumber()
  size?: number = 256;

  @IsOptional()
  @ValidateNested()
  @Type(() => QrWifiDto)
  wifi?: QrWifiDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => QrVcardDto)
  vcard?: QrVcardDto;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  smsMessage?: string;

  @IsOptional()
  @IsString()
  emailAddress?: string;

  @IsOptional()
  @IsString()
  emailSubject?: string;

  @IsOptional()
  @IsString()
  emailBody?: string;
}

export class ReviewKitComposeDto {
  @IsString()
  reviewLink: string;

  @IsString()
  businessDisplayName: string;

  @IsOptional()
  @IsString()
  tagline?: string;

  @IsOptional()
  @IsString()
  language?: string = 'en-US';
}

export class WhatsappComposeDto {
  @IsString()
  internationalNumber: string;

  @IsOptional()
  @IsString()
  prefilledMessage?: string;
}

export class UtmComposeDto {
  @IsString()
  destinationUrl: string;

  @IsString()
  utmSource: string;

  @IsString()
  utmMedium: string;

  @IsString()
  utmCampaign: string;

  @IsOptional()
  @IsString()
  utmTerm?: string;

  @IsOptional()
  @IsString()
  utmContent?: string;

  @IsOptional()
  @IsBoolean()
  lowercase?: boolean = false;
}

export class SignatureRenderDto {
  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsString()
  companyName: string;

  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsIn(['modern', 'minimal', 'corporate', 'compact'])
  template?: 'modern' | 'minimal' | 'corporate' | 'compact' = 'modern';

  @IsOptional()
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    facebook?: string;
    instagram?: string;
  };
}

export class MissedCallCalculateDto {
  @IsNumber()
  @Min(0)
  missedCalls: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  eligibleSharePct?: number = 80;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  contactRatePct?: number = 50;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  bookingRatePct?: number = 40;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  saleClosePct?: number = 60;

  @IsNumber()
  @Min(0)
  averageSaleValue: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  grossMarginPct?: number = 45;

  @IsOptional()
  @IsString()
  currency?: string = 'USD';
}
