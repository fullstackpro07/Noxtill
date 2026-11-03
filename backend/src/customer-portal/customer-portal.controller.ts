import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CustomerPortalService } from './customer-portal.service';
import {
  CustomerPortalAcceptInviteDto,
  CustomerPortalAccountStatusDto,
  CustomerPortalBookAppointmentDto,
  CustomerPortalCommerceSubscriptionActionDto,
  CustomerPortalLayoutDto,
  CustomerPortalLoginDto,
  CustomerPortalMembershipCancelDto,
  CustomerPortalPaginationDto,
  CustomerPortalPasswordResetDto,
  CustomerPortalPasswordResetRequestDto,
  CustomerPortalProfileDto,
  CustomerPortalQueueDto,
  CustomerPortalQuoteResponseDto,
  CustomerPortalRescheduleDto,
  CustomerPortalReturnDto,
  CustomerPortalSettingsDto,
  CustomerPortalWaitlistDto,
} from './customer-portal.dto';
import { QuerySlotsDto } from '../bookings/dto/query-slots.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('customer-portal')
export class CustomerPortalController {
  constructor(private readonly portal: CustomerPortalService) {}

  @Public()
  @Get('business/:slug')
  getPublicBootstrap(@Param('slug') slug: string) {
    return this.portal.getPublicBootstrap(slug);
  }

  @Public()
  @Post('business/:slug/login')
  login(@Param('slug') slug: string, @Body() dto: CustomerPortalLoginDto) {
    return this.portal.login({ ...dto, businessSlug: slug });
  }

  @Public()
  @Post('business/:slug/accept-invite')
  acceptInvite(
    @Param('slug') slug: string,
    @Body() dto: CustomerPortalAcceptInviteDto,
  ) {
    return this.portal.acceptInvite(slug, dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('business/:slug/password-reset')
  requestPasswordReset(
    @Param('slug') slug: string,
    @Body() dto: CustomerPortalPasswordResetRequestDto,
  ) {
    return this.portal.requestPasswordReset(slug, dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('business/:slug/reset-password')
  resetPassword(
    @Param('slug') slug: string,
    @Body() dto: CustomerPortalPasswordResetDto,
  ) {
    return this.portal.resetPassword(slug, dto);
  }

  @Public()
  @Post('logout')
  logout(@Headers('authorization') authorization?: string) {
    return this.portal.logout(authorization);
  }

  @Public()
  @Get('me')
  getMe(@Headers('authorization') authorization?: string) {
    return this.portal.getMe(authorization);
  }

  @Public()
  @Get('me/home')
  getHome(@Headers('authorization') authorization?: string) {
    return this.portal.getHome(authorization);
  }

  @Public()
  @Patch('me/profile')
  updateProfile(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CustomerPortalProfileDto,
  ) {
    return this.portal.executeCustomerMutation(
      authorization,
      'account',
      idempotencyKey,
      'profile:update',
      dto,
      () => this.portal.updateProfile(authorization, dto),
      false,
    );
  }

  @Public()
  @Post('me/data-export')
  requestDataExport(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.portal.executeCustomerMutation(
      authorization,
      'account',
      idempotencyKey,
      'data-export',
      {},
      () => this.portal.requestDataExport(authorization),
    );
  }

  @Public()
  @Get('me/orders')
  getOrders(
    @Headers('authorization') authorization: string | undefined,
    @Query() pagination: CustomerPortalPaginationDto,
  ) {
    return this.portal.getOrders(authorization, pagination);
  }

  @Public()
  @Post('me/orders/:id/reorder')
  createReorderDraft(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') orderId: string,
  ) {
    return this.portal.executeCustomerMutation(
      authorization,
      'orders',
      idempotencyKey,
      `reorder:${orderId}`,
      {},
      () => this.portal.createReorderDraft(authorization, orderId),
    );
  }

  @Public()
  @Post('me/orders/:id/receipt')
  downloadReceipt(
    @Headers('authorization') authorization: string | undefined,
    @Param('id') orderId: string,
  ) {
    return this.portal.downloadReceipt(authorization, orderId);
  }

  @Public()
  @Get('me/bookings')
  getBookings(
    @Headers('authorization') authorization: string | undefined,
    @Query() pagination: CustomerPortalPaginationDto,
  ) {
    return this.portal.getBookings(authorization, pagination);
  }

  @Public()
  @Get('me/bookings/services')
  listBookableServices(@Headers('authorization') authorization?: string) {
    return this.portal.listBookableServices(authorization);
  }

  @Public()
  @Get('me/bookings/slots')
  getBookableSlots(
    @Headers('authorization') authorization: string | undefined,
    @Query() query: QuerySlotsDto,
  ) {
    return this.portal.getBookableSlots(
      authorization,
      query.service,
      query.date,
    );
  }

  @Public()
  @Post('me/bookings')
  createPortalBooking(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CustomerPortalBookAppointmentDto,
  ) {
    return this.portal.executeCustomerMutation(
      authorization,
      'bookings',
      idempotencyKey,
      'booking:create',
      dto,
      () => this.portal.createPortalBooking(authorization, dto),
    );
  }

  @Public()
  @Post('me/bookings/waitlist')
  joinWaitlist(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CustomerPortalWaitlistDto,
  ) {
    return this.portal.executeCustomerMutation(
      authorization,
      'bookings',
      idempotencyKey,
      'waitlist:join',
      dto,
      () => this.portal.joinPortalWaitlist(authorization, dto),
    );
  }

  @Public()
  @Post('me/bookings/queue')
  joinQueue(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CustomerPortalQueueDto,
  ) {
    return this.portal.executeCustomerMutation(
      authorization,
      'bookings',
      idempotencyKey,
      'queue:join',
      dto,
      () => this.portal.joinPortalQueue(authorization, dto.serviceId),
    );
  }

  @Public()
  @Post('me/bookings/:id/cancel')
  cancelBooking(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
  ) {
    return this.portal.executeCustomerMutation(
      authorization,
      'bookings',
      idempotencyKey,
      `booking:cancel:${id}`,
      {},
      () => this.portal.cancelBooking(authorization, id),
    );
  }

  @Public()
  @Post('me/bookings/:id/reschedule')
  rescheduleBooking(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') id: string,
    @Body() dto: CustomerPortalRescheduleDto,
  ) {
    return this.portal.executeCustomerMutation(
      authorization,
      'bookings',
      idempotencyKey,
      `booking:reschedule:${id}`,
      dto,
      () => this.portal.rescheduleBooking(authorization, id, dto.startsAt),
    );
  }

  @Public()
  @Get('me/billing')
  getBilling(
    @Headers('authorization') authorization: string | undefined,
    @Query() pagination: CustomerPortalPaginationDto,
  ) {
    return this.portal.getBilling(authorization, pagination);
  }

  @Public()
  @Post('me/billing/quotes/:id/respond')
  respondToQuote(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') quoteId: string,
    @Body() dto: CustomerPortalQuoteResponseDto,
  ) {
    return this.portal.executeCustomerMutation(
      authorization,
      'billing',
      idempotencyKey,
      `quote:respond:${quoteId}`,
      dto,
      () => this.portal.respondToQuote(authorization, quoteId, dto),
    );
  }

  @Public()
  @Get('me/returns')
  getReturns(
    @Headers('authorization') authorization: string | undefined,
    @Query() pagination: CustomerPortalPaginationDto,
  ) {
    return this.portal.getReturns(authorization, pagination);
  }

  @Public()
  @Post('me/returns')
  requestReturn(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CustomerPortalReturnDto,
  ) {
    return this.portal.executeCustomerMutation(
      authorization,
      'returns',
      idempotencyKey,
      'return:create',
      dto,
      () => this.portal.requestReturn(authorization, dto),
    );
  }

  @Public()
  @Get('me/support')
  getSupport(@Headers('authorization') authorization?: string) {
    return this.portal.getSupport(authorization);
  }

  @Public()
  @Get('me/loyalty')
  getLoyalty(
    @Headers('authorization') authorization: string | undefined,
    @Query() pagination: CustomerPortalPaginationDto,
  ) {
    return this.portal.getLoyalty(authorization, pagination);
  }

  @Public()
  @Post('me/loyalty/members/:id/redeem')
  redeemLoyaltyReward(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') memberId: string,
  ) {
    return this.portal.executeCustomerMutation(
      authorization,
      'loyalty',
      idempotencyKey,
      `loyalty:redeem:${memberId}`,
      {},
      () => this.portal.redeemLoyaltyReward(authorization, memberId),
    );
  }

  @Public()
  @Post('me/loyalty/subscriptions/:id/action')
  updateCommerceSubscription(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') subscriptionId: string,
    @Body() dto: CustomerPortalCommerceSubscriptionActionDto,
  ) {
    return this.portal.executeCustomerMutation(
      authorization,
      'loyalty',
      idempotencyKey,
      `subscription:action:${subscriptionId}`,
      dto,
      () =>
        this.portal.updateCommerceSubscription(
          authorization,
          subscriptionId,
          dto,
        ),
    );
  }

  @Public()
  @Post('me/loyalty/memberships/:id/cancel')
  cancelMembership(
    @Headers('authorization') authorization: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('id') membershipId: string,
    @Body() dto: CustomerPortalMembershipCancelDto,
  ) {
    return this.portal.executeCustomerMutation(
      authorization,
      'loyalty',
      idempotencyKey,
      `membership:cancel:${membershipId}`,
      dto,
      () => this.portal.cancelMembership(authorization, membershipId, dto),
    );
  }

  @Public()
  @Get('me/activity')
  getActivity(@Headers('authorization') authorization?: string) {
    return this.portal.getActivity(authorization);
  }

  @Get('overview')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  getAdminOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.getAdminOverview(user.businessId);
  }

  @Get('settings')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.getSettings(user.businessId);
  }

  @Patch('settings')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CustomerPortalSettingsDto,
  ) {
    return this.portal.executeAdminMutation(
      user.businessId,
      user.sub,
      idempotencyKey,
      'settings:update',
      dto,
      () => this.portal.updateSettings(user.businessId, dto),
    );
  }

  @Get('accounts')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  listAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.listAccounts(user.businessId);
  }

  @Post('accounts/:customerId/invite')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  createInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('customerId') customerId: string,
  ) {
    return this.portal.executeAdminMutation(
      user.businessId,
      user.sub,
      idempotencyKey,
      `invite:create:${customerId}`,
      {},
      () => this.portal.createInvite(user.businessId, user.sub, customerId),
      false,
    );
  }

  @Post('invites/:inviteId/revoke')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  revokeInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('inviteId') inviteId: string,
  ) {
    return this.portal.executeAdminMutation(
      user.businessId,
      user.sub,
      idempotencyKey,
      `invite:revoke:${inviteId}`,
      {},
      () => this.portal.revokeInvite(user.businessId, inviteId),
    );
  }

  @Patch('accounts/:accountId/active')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  setAccountActive(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('accountId') accountId: string,
    @Body() dto: CustomerPortalAccountStatusDto,
  ) {
    return this.portal.executeAdminMutation(
      user.businessId,
      user.sub,
      idempotencyKey,
      `account:active:${accountId}`,
      dto,
      () =>
        this.portal.setAccountActive(user.businessId, accountId, dto.active),
    );
  }

  @Get('layout/versions')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  listLayoutVersions(@CurrentUser() user: AuthenticatedUser) {
    return this.portal.listLayoutVersions(user.businessId);
  }

  @Post('layout/draft')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  saveLayoutDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CustomerPortalLayoutDto,
  ) {
    return this.portal.executeAdminMutation(
      user.businessId,
      user.sub,
      idempotencyKey,
      'layout:save-draft',
      dto,
      () => this.portal.saveLayoutDraft(user.businessId, user.sub, dto),
    );
  }

  @Post('layout/:version/publish')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  publishLayout(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.portal.executeAdminMutation(
      user.businessId,
      user.sub,
      idempotencyKey,
      `layout:publish:${version}`,
      {},
      () => this.portal.publishLayout(user.businessId, version),
    );
  }

  @Post('layout/:version/restore')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  restoreLayout(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.portal.executeAdminMutation(
      user.businessId,
      user.sub,
      idempotencyKey,
      `layout:restore:${version}`,
      {},
      () => this.portal.restoreLayout(user.businessId, user.sub, version),
    );
  }
}
