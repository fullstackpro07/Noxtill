import { Controller, Get } from '@nestjs/common';
import { AdAccountsService } from './ad-accounts.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('ads/accounts')
export class AdAccountsController {
  constructor(private readonly accounts: AdAccountsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.accounts.list(user.businessId);
  }
}
