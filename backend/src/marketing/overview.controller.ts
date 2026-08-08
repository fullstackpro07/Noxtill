import { Controller, Get } from '@nestjs/common';
import { MarketingOverviewService } from './overview.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('marketing')
export class OverviewController {
  constructor(private readonly overview: MarketingOverviewService) {}

  @Get('overview')
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.overview.overview(user.businessId);
  }
}
