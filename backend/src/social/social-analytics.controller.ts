import { Controller, Get, Param } from '@nestjs/common';
import { SocialAnalyticsService } from './social-analytics.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { parseSocialPlatform } from './social-platform.util';

@Controller('social/analytics')
export class SocialAnalyticsController {
  constructor(private readonly analytics: SocialAnalyticsService) {}

  @Get()
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.summary(user.businessId);
  }

  @Get(':platform')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('platform') platform: string,
  ) {
    return this.analytics.list(user.businessId, parseSocialPlatform(platform));
  }
}
