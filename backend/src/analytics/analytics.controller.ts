import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { MessageAtRiskDto } from './dto/message-at-risk.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

/** UPD-BE-108 fix-it: no capability gate previously existed on real KPI/cohort/staff-sales data. */
@RequireCapability(CAPABILITIES.PROFIT_VIEW)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('kpis')
  kpis() {
    return this.analyticsService.kpis();
  }

  @Get('revenue-series')
  revenueSeries(@Query('days') days?: string) {
    return this.analyticsService.revenueSeries(days ? Number(days) : undefined);
  }

  /** Business Overview chart fix-it — real per-day bookings count for the 3-series overlay. */
  @Get('bookings-series')
  bookingsSeries(@Query('days') days?: string) {
    return this.analyticsService.bookingsSeries(
      days ? Number(days) : undefined,
    );
  }

  @Get('cohorts')
  cohorts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.analyticsService.cohorts(user.businessId, branchId);
  }

  @Get('customers/new-vs-returning')
  newVsReturning(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.analyticsService.newVsReturningByMonth(
      user.businessId,
      branchId,
    );
  }

  @Get('cohorts/:cohortMonth/customers')
  cohortCustomers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('cohortMonth') cohortMonth: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.analyticsService.cohortCustomers(
      user.businessId,
      cohortMonth,
      branchId,
    );
  }

  @Get('customers/summary')
  customerSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
  ) {
    return this.analyticsService.customerSummary(user.businessId, branchId);
  }

  @Post('customers/message-at-risk')
  messageAtRisk(@Body() dto: MessageAtRiskDto) {
    return this.analyticsService.messageAtRisk(dto.offerText);
  }

  @Get('campaigns')
  campaigns() {
    return this.analyticsService.campaigns();
  }

  @Get('staff')
  staff(
    @CurrentUser() user: AuthenticatedUser,
    @Query('branchId') branchId?: string,
    @Query('month') month?: string,
  ) {
    return this.analyticsService.staff(user.businessId, branchId, month);
  }

  @Get('channels')
  channels(@Query('days') days?: string) {
    return this.analyticsService.channels(days ? Number(days) : undefined);
  }
}
