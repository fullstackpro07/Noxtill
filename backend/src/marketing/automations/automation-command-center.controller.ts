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

  @Get('agents-overview')
  agents(@CurrentUser() user: AuthenticatedUser) {
    return this.commandCenter.agents(user.businessId);
  }

  @Get('governance-audit')
  audit(@CurrentUser() user: AuthenticatedUser) {
    return this.commandCenter.audit(user.businessId);
  }

  @Get('governance-summary')
  governanceSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.commandCenter.governanceSummary(user.businessId);
  }
}
