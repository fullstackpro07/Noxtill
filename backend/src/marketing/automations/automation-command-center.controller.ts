import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { AutomationCommandCenterService } from './automation-command-center.service';

@Controller('workflows')
export class AutomationCommandCenterController {
  constructor(private readonly commandCenter: AutomationCommandCenterService) {}

  @Get('command-center')
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.commandCenter.overview(user.businessId);
  }

  @Get('schedules-overview')
  schedules(@CurrentUser() user: AuthenticatedUser) {
    return this.commandCenter.schedules(user.businessId);
  }
}
