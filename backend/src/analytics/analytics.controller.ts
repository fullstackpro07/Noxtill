import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { MessageAtRiskDto } from './dto/message-at-risk.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
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

  @Get('cohorts')
  cohorts() {
    return this.analyticsService.cohorts();
  }

  @Get('cohorts/:cohortMonth/customers')
  cohortCustomers(@Param('cohortMonth') cohortMonth: string) {
    return this.analyticsService.cohortCustomers(cohortMonth);
  }

  @Get('customers/summary')
  customerSummary() {
    return this.analyticsService.customerSummary();
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
  staff() {
    return this.analyticsService.staff();
  }

  @Get('channels')
  channels(@Query('days') days?: string) {
    return this.analyticsService.channels(days ? Number(days) : undefined);
  }
}
