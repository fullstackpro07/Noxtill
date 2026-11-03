import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  CommercePreorderCampaignStatus,
  CommerceSubscriptionPlanStatus,
  CommerceSubscriptionStatus,
} from '@prisma/client';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import {
  ChangeCommercePromiseDateDto,
  CommerceReasonDto,
  CreateCommercePreorderCampaignDto,
  CreateCommerceSubscriptionPlanDto,
  ReserveCommercePreorderDto,
  SubscribeCommerceCustomerDto,
} from './dto/commerce-subscription.dto';
import { CommerceSubscriptionsService } from './commerce-subscriptions.service';

@Controller('commerce/subscriptions-preorders')
export class CommerceSubscriptionsController {
  constructor(private readonly service: CommerceSubscriptionsService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.service.summary(user.businessId);
  }

  @Get('plans')
  plans(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listPlans(user.businessId);
  }

  @Get('subscriptions')
  subscriptions(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listSubscriptions(user.businessId);
  }

  @Get('campaigns')
  campaigns(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listCampaigns(user.businessId);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('plans')
  createPlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommerceSubscriptionPlanDto,
  ) {
    return this.service.createPlan(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('plans/:id/archive')
  archivePlan(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.setPlanStatus(
      user.businessId,
      user.sub,
      id,
      CommerceSubscriptionPlanStatus.archived,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('subscriptions')
  subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubscribeCommerceCustomerDto,
  ) {
    return this.service.subscribe(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('subscriptions/process-due')
  processDue(@CurrentUser() user: AuthenticatedUser) {
    return this.service.processDueRenewals(user.businessId, user.sub);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('subscriptions/:id/renew')
  renew(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.processRenewal(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('subscriptions/:id/pause')
  pause(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommerceReasonDto,
  ) {
    return this.service.setSubscriptionStatus(
      user.businessId,
      user.sub,
      id,
      CommerceSubscriptionStatus.paused,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('subscriptions/:id/resume')
  resume(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.setSubscriptionStatus(
      user.businessId,
      user.sub,
      id,
      CommerceSubscriptionStatus.active,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('subscriptions/:id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommerceReasonDto,
  ) {
    return this.service.setSubscriptionStatus(
      user.businessId,
      user.sub,
      id,
      CommerceSubscriptionStatus.cancelled,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('subscriptions/:id/skip-next')
  skip(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.toggleSkip(user.businessId, user.sub, id, true);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('subscriptions/:id/unskip')
  unskip(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.toggleSkip(user.businessId, user.sub, id, false);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('campaigns')
  createCampaign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCommercePreorderCampaignDto,
  ) {
    return this.service.createCampaign(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('campaigns/:id/promise-date')
  changePromise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeCommercePromiseDateDto,
  ) {
    return this.service.changePromiseDate(
      user.businessId,
      user.sub,
      id,
      dto.promisedDate,
      dto.reason,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('campaigns/:id/close')
  close(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.setCampaignStatus(
      user.businessId,
      user.sub,
      id,
      CommercePreorderCampaignStatus.closed,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('campaigns/:id/release')
  release(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.setCampaignStatus(
      user.businessId,
      user.sub,
      id,
      CommercePreorderCampaignStatus.released,
    );
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('campaigns/:id/reserve')
  reserve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReserveCommercePreorderDto,
  ) {
    return this.service.reserve(user.businessId, user.sub, id, dto);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('preorders/:id/fulfill')
  fulfill(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.service.fulfillPreorder(user.businessId, user.sub, id);
  }

  @RequireCapability(CAPABILITIES.COMMERCE_MANAGE)
  @Post('preorders/:id/cancel')
  cancelPreorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CommerceReasonDto,
  ) {
    return this.service.cancelPreorder(
      user.businessId,
      user.sub,
      id,
      dto.reason,
    );
  }
}
