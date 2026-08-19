import { Controller, Get } from '@nestjs/common';
import { AdAnalyticsService } from './ad-analytics.service';

@Controller('ads')
export class AdAnalyticsController {
  constructor(private readonly analytics: AdAnalyticsService) {}

  @Get('budget')
  budget() {
    return this.analytics.budget();
  }

  @Get('performance')
  performance() {
    return this.analytics.performance();
  }
}
