import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { BusinessIntelligenceService } from './business-intelligence.service';

@Controller('business-intelligence')
export class BusinessIntelligenceController {
  constructor(private readonly service: BusinessIntelligenceService) {}

  @Get('overview')
  @RequireCapability(CAPABILITIES.PROFIT_VIEW)
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.service.overview(user.businessId);
  }
}
