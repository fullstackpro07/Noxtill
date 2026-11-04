import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { Audited } from '../common/decorators/audited.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SeoSearchConsoleService } from './seo-search-console.service';

class SelectSearchConsolePropertyDto {
  @IsString()
  @MaxLength(2048)
  siteUrl!: string;
}

class InspectSearchConsoleUrlDto {
  @IsString()
  @MaxLength(2048)
  inspectionUrl!: string;
}

@Controller('seo-autopilot/search-console')
export class SeoSearchConsoleController {
  constructor(private readonly searchConsole: SeoSearchConsoleService) {}

  @Get()
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.searchConsole.summary(user.businessId);
  }

  @Get('keywords')
  keywordPerformance(@CurrentUser() user: AuthenticatedUser) {
    return this.searchConsole.keywordPerformanceSummary(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Audited('refresh', 'seo-search-console-properties')
  @Post('properties/refresh')
  refreshProperties(@CurrentUser() user: AuthenticatedUser) {
    return this.searchConsole.refreshProperties(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Audited('select', 'seo-search-console-property')
  @Post('property')
  selectProperty(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SelectSearchConsolePropertyDto,
  ) {
    return this.searchConsole.selectProperty(user.businessId, dto.siteUrl);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Audited('sync', 'seo-search-console-performance')
  @Post('sync')
  syncPerformance(@CurrentUser() user: AuthenticatedUser) {
    return this.searchConsole.syncPerformance(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Audited('inspect', 'seo-search-console-url')
  @Post('url-inspection')
  inspectUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InspectSearchConsoleUrlDto,
  ) {
    return this.searchConsole.inspectUrl(user.businessId, dto.inspectionUrl);
  }
}
