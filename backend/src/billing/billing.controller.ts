import { Body, Controller, Get, Post } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { Role } from '../../generated/prisma';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.billingService.status(user.businessId);
  }

  @Roles(Role.owner)
  @Post('checkout')
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckout(user.businessId, dto);
  }
}
