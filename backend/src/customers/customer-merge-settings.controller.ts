import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CustomerMergeSettingsService } from './customer-merge-settings.service';
import { UpdateCustomerMergeSettingsDto } from './dto/update-customer-merge-settings.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('customer-merge-settings')
export class CustomerMergeSettingsController {
  constructor(private readonly service: CustomerMergeSettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.service.get(user.businessId);
  }

  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCustomerMergeSettingsDto,
  ) {
    return this.service.update(user.businessId, dto);
  }
}
