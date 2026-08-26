import { Controller, Get, Post } from '@nestjs/common';
import { MarketingOverviewService } from './overview.service';

@Controller('marketing')
export class OverviewController {
  constructor(private readonly overview: MarketingOverviewService) {}

  @Get('overview')
  get() {
    return this.overview.overview();
  }

  @Post('overview/reallocation-suggestion')
  suggestReallocation() {
    return this.overview.suggestReallocation();
  }
}
