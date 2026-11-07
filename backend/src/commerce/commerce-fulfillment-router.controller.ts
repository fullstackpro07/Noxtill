import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  AssignCommerceRouteDto,
  CancelCommerceRouteDto,
  CommerceRoutingCandidatesQueryDto,
} from './dto/commerce-fulfillment.dto';
import { CommerceFulfillmentRouterService } from './commerce-fulfillment-router.service';

@Controller('commerce/fulfillment-router')
export class CommerceFulfillmentRouterController {
  constructor(private readonly router: CommerceFulfillmentRouterService) {}

  @Get('queue')
  queue(@CurrentUser() user: AuthenticatedUser) {
    return this.router.queue(user.businessId);
  }

  @Get('orders/:orderId/candidates')
  candidates(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Query() query: CommerceRoutingCandidatesQueryDto,
  ) {
    return this.router.candidates(
      user.businessId,
      orderId,
      query.destinationCountry,
    );
  }

  @Get('orders/:orderId/history')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ) {
    return this.router.history(user.businessId, orderId);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('orders/:orderId/assign')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: AssignCommerceRouteDto,
  ) {
    return this.router.assign(user.businessId, user.sub, orderId, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('decisions/:decisionId/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('decisionId') decisionId: string,
    @Body() dto: CancelCommerceRouteDto,
  ) {
    return this.router.cancel(
      user.businessId,
      user.sub,
      decisionId,
      dto.reason,
    );
  }
}
