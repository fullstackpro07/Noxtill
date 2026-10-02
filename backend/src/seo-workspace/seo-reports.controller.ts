import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
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
}
