import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CustomerChannelConsentService } from './customer-channel-consent.service';
import { RecordCustomerChannelConsentDto } from './dto/customer-channel-consent.dto';

@Controller('customers')
export class CustomerChannelConsentController {
  constructor(private readonly consents: CustomerChannelConsentService) {}

  @Get(':id/channel-consent')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') customerId: string,
  ) {
    return this.consents.list(user.businessId, customerId);
  }

  @Post(':id/channel-consent')
  @RequireCapability(CAPABILITIES.CUSTOMERS_MANAGE)
  record(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') customerId: string,
    @Body() input: RecordCustomerChannelConsentDto,
  ) {
    return this.consents.record(user.businessId, user.sub, customerId, input);
  }
}
