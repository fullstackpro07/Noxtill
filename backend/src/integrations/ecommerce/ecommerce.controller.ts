import { Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { EcommerceSyncService } from './ecommerce-sync.service';
import { IntegrationProvider } from '@prisma/client';

@Controller('integrations/ecommerce')
export class EcommerceController {
  constructor(private readonly sync: EcommerceSyncService) {}

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post('sync')
  runSync(@CurrentUser() user: AuthenticatedUser) {
    return this.sync.sync(user.businessId);
  }

  /** E-commerce conflict history depth fix — a real, persisted, browsable conflict log. */
  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('conflicts')
  listConflicts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('provider') provider?: IntegrationProvider,
  ) {
    return this.sync.listConflicts(user.businessId, provider);
  }
}
