import { Controller, Get, Param, Post } from '@nestjs/common';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SeoLocalService } from './seo-local.service';

@Controller('seo-autopilot/local')
export class SeoLocalController {
  constructor(private readonly local: SeoLocalService) {}

  @Get('overview')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.local.overview(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('locations/:id/local-page-brief')
  localPageBrief(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.local.createLocalPageBrief(user.businessId, user.sub, id);
  }
}
