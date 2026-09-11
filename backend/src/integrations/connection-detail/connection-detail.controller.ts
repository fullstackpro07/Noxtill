import { Controller, Get, Param, Post } from '@nestjs/common';
import { ConnectionDetailService } from './connection-detail.service';
import { RequireCapability } from '../../common/decorators/require-capability.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { CAPABILITIES } from '../../common/capabilities/capabilities.constants';

@Controller('integrations')
export class ConnectionDetailController {
  constructor(private readonly connectionDetail: ConnectionDetailService) {}

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Get(':provider')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') provider: string,
  ) {
    return this.connectionDetail.detail(user.businessId, provider);
  }

  @RequireCapability(CAPABILITIES.INTEGRATIONS_MANAGE)
  @Post(':provider/sync')
  sync(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') provider: string,
  ) {
    return this.connectionDetail.triggerSync(user.businessId, provider);
  }
}
