import { Controller, Get, Param } from '@nestjs/common';
import { DeliveryInsightsService } from './delivery-insights.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

/** Delivery module redesign — real data for every table/panel screen besides Overview/Dispatch. */
@Controller('delivery-insights')
export class DeliveryInsightsController {
  constructor(private readonly insights: DeliveryInsightsService) {}

  @Get('exceptions')
  exceptions(@CurrentUser() user: AuthenticatedUser) {
    return this.insights.exceptions(user.businessId);
  }

  @Get('tracking')
  tracking(@CurrentUser() user: AuthenticatedUser) {
    return this.insights.tracking(user.businessId);
  }

  @Get('pod')
  pod(@CurrentUser() user: AuthenticatedUser) {
    return this.insights.pod(user.businessId);
  }

  @Get('analytics')
  analytics(@CurrentUser() user: AuthenticatedUser) {
    return this.insights.analytics(user.businessId);
  }

  @Get('rider/:riderId')
  rider360(
    @CurrentUser() user: AuthenticatedUser,
    @Param('riderId') riderId: string,
  ) {
    return this.insights.rider360(user.businessId, riderId);
  }

  @Get('routes')
  routes(@CurrentUser() user: AuthenticatedUser) {
    return this.insights.routesSummary(user.businessId);
  }

  @Get('zones')
  zones(@CurrentUser() user: AuthenticatedUser) {
    return this.insights.zonesSummary(user.businessId);
  }

  @Get('automations')
  automations(@CurrentUser() user: AuthenticatedUser) {
    return this.insights.automationsSummary(user.businessId);
  }
}
