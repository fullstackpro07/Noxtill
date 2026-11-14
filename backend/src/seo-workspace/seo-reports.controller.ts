import { Controller, Get, ParseIntPipe, Post, Query } from '@nestjs/common';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SeoReportsService } from './seo-reports.service';

@Controller('seo-autopilot/reports')
export class SeoReportsController {
  constructor(private readonly reports: SeoReportsService) {}

  @Get()
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    return this.reports.report(user.businessId, days ?? 30);
  }

  @RequireCapability(CAPABILITIES.SEO_MANAGE)
  @Post('outcome-snapshots')
  saveOutcomeSnapshots(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    return this.reports.saveOutcomeSnapshots(
      user.businessId,
      user.sub,
      days ?? 30,
    );
  }
}
