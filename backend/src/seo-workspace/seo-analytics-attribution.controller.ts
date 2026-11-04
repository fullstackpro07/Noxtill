import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { Audited } from '../common/decorators/audited.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SeoAnalyticsAttributionService } from './seo-analytics-attribution.service';

class SelectAnalyticsPropertyDto {
  @IsString()
  @MaxLength(64)
  property!: string;
}

@Controller('seo-autopilot/analytics')
export class SeoAnalyticsAttributionController {
  constructor(private readonly analytics: SeoAnalyticsAttributionService) {}

  @Get()
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.summary(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Audited('refresh', 'seo-ga4-properties')
  @Post('properties/refresh')
  refreshProperties(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.refreshProperties(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Audited('select', 'seo-ga4-property')
  @Post('property')
  selectProperty(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SelectAnalyticsPropertyDto,
  ) {
    return this.analytics.selectProperty(user.businessId, dto.property);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Audited('sync', 'seo-ga4-organic-search')
  @Post('sync')
  syncOrganicSearch(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.syncOrganicSearch(user.businessId);
  }
}
