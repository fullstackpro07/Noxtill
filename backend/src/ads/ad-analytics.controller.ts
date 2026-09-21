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

  @Get('analytics/funnel')
  funnel() {
    return this.analytics.funnel();
  }

  @Get('analytics/product-profitability')
  productProfitability() {
    return this.analytics.productProfitability();
  }

  @Get('analytics/attribution')
  attribution() {
    return this.analytics.attribution();
  }
}
