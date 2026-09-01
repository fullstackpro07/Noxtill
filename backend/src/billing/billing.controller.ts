import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { UpdateAddOnsDto } from './dto/update-add-ons.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AddOnKey } from './billing.constants';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.status(user.businessId);
  }

  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckout(user.businessId, dto);
  }

  /** UPD-BE-121 */
  @Get('invoices')
  invoices(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.listInvoices(user.businessId);
  }

  /** UPD-BE-121 */
  @Get('add-ons')
  getAddOns(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.getAddOns(user.businessId);
  }

  /** UPD-BE-121 */
  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Patch('add-ons')
  setAddOns(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAddOnsDto,
  ) {
    return this.billingService.setAddOns(
      user.businessId,
      dto.keys as AddOnKey[],
    );
  }

  /** UPD-BE-121 */
  @RequireCapability(CAPABILITIES.BILLING_MANAGE)
  @Post('cancel')
  cancel(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.cancelOwnSubscription(user.businessId);
  }
}
