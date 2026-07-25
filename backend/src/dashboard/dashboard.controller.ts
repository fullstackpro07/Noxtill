import { Body, Controller, Get, Put } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { UpdateDashboardConfigDto } from './dto/update-dashboard-config.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('config')
  getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getConfig(user.businessId);
  }

  @Put('config')
  updateConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDashboardConfigDto,
  ) {
    return this.dashboardService.updateConfig(user.businessId, dto);
  }

  @Get('today')
  today() {
    return this.dashboardService.today();
  }
}
