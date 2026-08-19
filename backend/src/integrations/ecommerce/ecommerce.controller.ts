import { Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { EcommerceSyncService } from './ecommerce-sync.service';

@Controller('integrations/ecommerce')
export class EcommerceController {
  constructor(private readonly sync: EcommerceSyncService) {}

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post('sync')
  runSync(@CurrentUser() user: AuthenticatedUser) {
    return this.sync.sync(user.businessId);
  }
}
