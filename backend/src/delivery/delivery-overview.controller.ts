import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { DeliveryOverviewService } from './delivery-overview.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

/** Delivery module redesign — real aggregations backing the Overview and Live Dispatch screens. */
@Controller('delivery-overview')
export class DeliveryOverviewController {
  constructor(private readonly overview: DeliveryOverviewService) {}

  @Get('kpis')
  kpis(
    @CurrentUser() user: AuthenticatedUser,
    @Query('period') period?: string,
  ) {
    return this.overview.kpis(user.businessId, period);
  }

  @Get('funnel')
  funnel(@CurrentUser() user: AuthenticatedUser) {
    return this.overview.funnel(user.businessId);
  }

  @Get('map')
  map(@CurrentUser() user: AuthenticatedUser) {
    return this.overview.map(user.businessId);
  }

  @Get('intel')
  intel(@CurrentUser() user: AuthenticatedUser) {
    return this.overview.intel(user.businessId);
  }

  @Get('activity')
  activity(@CurrentUser() user: AuthenticatedUser) {
    return this.overview.activityFeed(user.businessId);
  }

  @Get('riders-live')
  ridersLive(@CurrentUser() user: AuthenticatedUser) {
    return this.overview.ridersLive(user.businessId);
  }

  @Get('queue')
  queue(@CurrentUser() user: AuthenticatedUser) {
    return this.overview.queue(user.businessId);
  }

  @Get('delayed')
  delayed(@CurrentUser() user: AuthenticatedUser) {
    return this.overview.delayedDeliveries(user.businessId);
  }

  @Get('freshness')
  freshness(@CurrentUser() user: AuthenticatedUser) {
    return this.overview.freshness(user.businessId);
  }

  @Get('rider/:riderId')
  async riderDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('riderId') riderId: string,
  ) {
    const detail = await this.overview.riderDetail(user.businessId, riderId);
    if (!detail) throw new NotFoundException('Rider not found');
    return detail;
  }
}
