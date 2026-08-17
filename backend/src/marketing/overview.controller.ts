import { Controller, Get } from '@nestjs/common';
import { MarketingOverviewService } from './overview.service';

@Controller('marketing')
export class OverviewController {
  constructor(private readonly overview: MarketingOverviewService) {}

  @Get('overview')
  get() {
    return this.overview.overview();
  }
}
