import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { RequireStepUp } from '../common/decorators/require-step-up.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { SubscriptionService } from './subscription.service';
import { PaymentMethodsService } from './payment-methods.service';
import { ChangePlanDto, PasswordDto, PaymentSetupDto } from './dto/usage.dto';

@Controller()
export class SubscriptionController {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly paymentMethods: PaymentMethodsService,
  ) {}

  /** Plan catalog with the current plan marked (spec §9.1). */
  @Get('plans')
  plans(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.catalog(user.businessId);
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @RequireStepUp()
  @Post('subscription/change-plan')
  changePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePlanDto,
  ) {
    return this.subscriptions.changePlan(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Delete('subscription/scheduled')
  async cancelScheduled(@CurrentUser() user: AuthenticatedUser) {
    await this.subscriptions.cancelScheduled(user.businessId, user.sub);
    return { cancelled: true };
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @RequireStepUp()
  @Post('subscription/cancel')
  cancel(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.cancel(user.businessId, user.sub);
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Get('subscription/payment-methods')
  listMethods(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentMethods.list(user.businessId);
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @RequireStepUp()
  @Post('subscription/payment-methods/setup')
  setup(@CurrentUser() user: AuthenticatedUser, @Body() dto: PaymentSetupDto) {
    return this.paymentMethods.startSetup(user.businessId, user.sub, dto);
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @RequireStepUp()
  @Post('subscription/payment-methods/:id/default')
  makeDefault(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PasswordDto,
  ) {
    return this.paymentMethods.makeDefault(
      user.businessId,
      user.sub,
      id,
      dto.password,
    );
  }
}
