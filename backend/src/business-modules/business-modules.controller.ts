import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { BusinessModulesService } from './business-modules.service';

/** Read-only for every signed-in user (the sidebar needs it); changes go through Settings → Modules. */
@Controller('business-modules')
export class BusinessModulesController {
  constructor(private readonly modules: BusinessModulesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.modules.list(user.businessId);
  }
}
