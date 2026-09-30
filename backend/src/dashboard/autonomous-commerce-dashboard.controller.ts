import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { AutonomousCommerceDashboardService } from './autonomous-commerce-dashboard.service';

@Controller('commerce/dashboard')
export class AutonomousCommerceDashboardController {
  constructor(private readonly dashboard: AutonomousCommerceDashboardService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.summary(user.businessId);
  }
}
