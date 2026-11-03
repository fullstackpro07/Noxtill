import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { WebsiteFormStatus, WebsitePageKind } from '@prisma/client';
import {
  BUILDER_GOALS,
  BUILDER_PAGES,
  BUILDER_TONES,
} from './website-builder.service';

export class ListPagesDto {
  @IsOptional()
  @IsEnum(WebsitePageKind)
  kind?: WebsitePageKind;
}

export class PageDto {
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(160) slug?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(40) blocks?: unknown[];
  @IsOptional() @IsString() @MaxLength(200) metaTitle?: string | null;
  @IsOptional() @IsString() @MaxLength(320) metaDescription?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) excerpt?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) heroImageUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(80) category?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
  @IsOptional() @IsBoolean() showInHeader?: boolean;
  @IsOptional() @IsString() @MaxLength(64) campaignId?: string | null;
  @IsOptional() @IsString() @MaxLength(20) goal?: string | null;
  @IsOptional() @IsString() @MaxLength(200) goalTarget?: string | null;
  @IsOptional() @IsString() @MaxLength(80) utmSource?: string | null;
  @IsOptional() @IsString() @MaxLength(80) utmMedium?: string | null;
  @IsOptional() @IsString() @MaxLength(120) utmCampaign?: string | null;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class CreatePageDto extends PageDto {
  @IsEnum(WebsitePageKind)
  kind!: WebsitePageKind;

  @IsString()
  @MaxLength(200)
  declare title: string;
}

export class SchedulePageDto {
  @IsOptional()
  @IsDateString()
  publishAt!: string | null;
}

export class RestoreVersionDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class JsonBodyDto {
  @IsObject()
  value!: Record<string, unknown>;
}

export class PublishSiteDto {
  @IsOptional() @IsBoolean() navigation?: boolean;
  @IsOptional() @IsBoolean() theme?: boolean;
  @IsOptional() @IsBoolean() settings?: boolean;
}

export class MaintenanceDto {
  @IsBoolean()
  enabled!: boolean;
}

export class FormDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(25) fields?: unknown[];
  @IsOptional() @IsString() @MaxLength(60) customerTag?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) consentText?: string | null;
  @IsOptional() @IsString() @MaxLength(1000) thankYouMessage?: string | null;
  @IsOptional() @IsEnum(WebsiteFormStatus) status?: WebsiteFormStatus;
}

export class TestFormDto {
  @IsObject()
  values!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}

export class PublicFormSubmitDto {
  @IsObject()
  values!: Record<string, unknown>;

  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsOptional() @IsBoolean() marketingConsent?: boolean;
  /** Honeypot: hidden from people, so any value means an automated submission. */
  @IsOptional() @IsString() @MaxLength(200) company?: string;
  @IsOptional() @IsString() @MaxLength(64) pageId?: string;
  @IsOptional() @IsObject() utm?: Record<string, string>;
}

export class DomainDto {
  @IsString()
  @MaxLength(260)
  hostname!: string;
}

export class RedirectDto {
  @IsString() @MaxLength(300) fromPath!: string;
  @IsString() @MaxLength(1000) toPath!: string;
  @IsOptional() @IsBoolean() permanent?: boolean;
}

export class ProductSettingDto {
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @IsInt() @Min(-1000) @Max(1000) sortPriority?: number;
  @IsOptional() @IsString() @MaxLength(40) badge?: string | null;
  @IsOptional() @IsString() @MaxLength(200) webTitle?: string | null;
  @IsOptional() @IsString() @MaxLength(500) webSummary?: string | null;
}

export class BulkVisibilityDto {
  @IsArray() @ArrayMaxSize(500) @IsString({ each: true }) productIds!: string[];
  @IsBoolean() visible!: boolean;
}

export class StorefrontOptionsDto {
  @IsOptional() @IsBoolean() showPrices?: boolean;
  @IsOptional() @IsIn(['hide', 'show_unavailable']) outOfStockBehavior?:
    'hide' | 'show_unavailable';
  @IsOptional() @IsBoolean() checkoutEnabled?: boolean;
}

export class CollectionDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  productIds?: string[];
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() visible?: boolean;
}

export class BuilderDto {
  @IsIn(BUILDER_GOALS)
  goal!: (typeof BUILDER_GOALS)[number];
  @IsOptional() @IsString() @MaxLength(300) audience?: string;
  @IsOptional()
  @IsIn(BUILDER_TONES)
  tone?: (typeof BUILDER_TONES)[number];
  @IsArray()
  @ArrayMaxSize(6)
  @IsIn(BUILDER_PAGES, { each: true })
  pages!: (typeof BUILDER_PAGES)[number][];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(48)
  @IsString({ each: true })
  productIds?: string[];
  @IsOptional() @IsBoolean() includeReviews?: boolean;
  @IsOptional() @IsBoolean() useAi?: boolean;
}

export class OverviewQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

export class RenderQueryDto {
  @IsOptional() @IsString() @MaxLength(400) path?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}
