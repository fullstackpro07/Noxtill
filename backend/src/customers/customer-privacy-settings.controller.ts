import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CustomerPrivacySettingsService } from './customer-privacy-settings.service';
import { UpdateCustomerPrivacySettingsDto } from './dto/update-customer-privacy-settings.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('customer-privacy-settings')
export class CustomerPrivacySettingsController {
  constructor(private readonly service: CustomerPrivacySettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.service.get(user.businessId);
  }

  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCustomerPrivacySettingsDto,
  ) {
    return this.service.update(user.businessId, dto);
  }
}
