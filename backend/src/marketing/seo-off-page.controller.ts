import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  OFF_PAGE_KINDS,
  SeoOffPageService,
  type OffPageKind,
  type OffPageLinkStatus,
  type OffPagePipeline,
} from './seo-off-page.service';

class CreateOffPageLinkDto {
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  sourceUrl!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  targetUrl!: string;

  @IsOptional() @IsString() @MaxLength(1000) anchorText?: string;
  @IsOptional()
  @IsIn(['follow', 'nofollow', 'sponsored', 'ugc', 'unknown'])
  linkType?: 'follow' | 'nofollow' | 'sponsored' | 'ugc' | 'unknown';
  @IsOptional()
  @IsIn(['active', 'lost', 'unverified'])
  status?: OffPageLinkStatus;
  @IsOptional() @IsDateString() firstSeenAt?: string;
  @IsOptional() @IsDateString() lastSeenAt?: string;
  @IsString() @MaxLength(10000) evidenceNote!: string;
  @IsOptional() @IsString() @MaxLength(10000) relevanceNote?: string;
  @IsOptional() @IsString() @MaxLength(10000) qualityNote?: string;
  @IsOptional() @IsString() @MaxLength(10000) riskNote?: string;
}

class UpdateOffPageLinkDto {
  @IsOptional()
  @IsIn(['active', 'lost', 'unverified'])
  status?: OffPageLinkStatus;
  @IsOptional() @IsBoolean() tracked?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

class CreateOffPageOpportunityDto {
  @IsIn(OFF_PAGE_KINDS)
  kind!: OffPageKind;
  @IsString() @MaxLength(191) title!: string;
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  prospectUrl!: string;
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(2048)
  targetUrl?: string;
  @IsString() @MaxLength(10000) evidenceNote!: string;
  @IsString() @MaxLength(10000) relevanceNote!: string;
  @IsOptional() @IsString() @MaxLength(10000) qualityNote?: string;
  @IsOptional() @IsString() @MaxLength(10000) riskNote?: string;
}

class UpdateOffPageOpportunityDto {
  @IsOptional()
  @IsIn(['unassigned', 'guest_posting', 'link_building'])
  pipeline?: OffPagePipeline;
  @IsOptional()
  @IsIn(['open', 'dismissed'])
  status?: 'open' | 'dismissed';
  @IsOptional() @IsBoolean() tracked?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

@Controller('seo-autopilot/off-page')
export class SeoOffPageController {
  constructor(private readonly offPage: SeoOffPageService) {}

  @Get()
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.offPage.overview(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('links')
  createLink(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOffPageLinkDto,
  ) {
    return this.offPage.createLink(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Patch('links/:id')
  updateLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOffPageLinkDto,
  ) {
    return this.offPage.updateLink(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('opportunities')
  createOpportunity(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOffPageOpportunityDto,
  ) {
    return this.offPage.createOpportunity(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Patch('opportunities/:id')
  updateOpportunity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateOffPageOpportunityDto,
  ) {
    return this.offPage.updateOpportunity(user.businessId, user.sub, id, dto);
  }
}
