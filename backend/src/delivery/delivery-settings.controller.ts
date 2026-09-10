import { Body, Controller, Get, Patch } from '@nestjs/common';
import { DeliverySettingsService } from './delivery-settings.service';
import { UpdateDeliverySettingsDto } from './dto/update-delivery-settings.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('delivery-settings')
export class DeliverySettingsController {
  constructor(private readonly settings: DeliverySettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.get(user.businessId);
  }

  @RequireCapability(CAPABILITIES.DELIVERY_MANAGE)
  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDeliverySettingsDto,
  ) {
    return this.settings.update(user.businessId, dto);
  }
}
