import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { AutomationCommandCenterService } from './automation-command-center.service';

@Controller('workflows/command-center')
export class AutomationCommandCenterController {
  constructor(private readonly commandCenter: AutomationCommandCenterService) {}

  @Get()
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.commandCenter.overview(user.businessId);
  }
}
