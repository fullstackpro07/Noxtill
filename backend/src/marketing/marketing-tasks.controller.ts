import { Controller, Get } from '@nestjs/common';
import { MarketingTasksService } from './marketing-tasks.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('marketing/tasks')
export class MarketingTasksController {
  constructor(private readonly tasks: MarketingTasksService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.tasks.list(user.businessId);
  }
}
