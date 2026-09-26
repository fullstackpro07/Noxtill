import { Controller, Get } from '@nestjs/common';
import { DeveloperOverviewService } from './developer-overview.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

/** Developer tab read model: usage, rate-limit headroom, keys with their request counts, webhooks with their latest delivery. */
@Controller('developer')
export class DeveloperOverviewController {
  constructor(private readonly overview: DeveloperOverviewService) {}

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('overview')
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.overview.overview(user.businessId);
  }

  /** The scopes an API key may be granted (destructive/admin capabilities are never offered). */
  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get('scopes')
  scopes() {
    return this.overview.scopes();
  }
}
