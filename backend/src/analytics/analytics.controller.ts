import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

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
