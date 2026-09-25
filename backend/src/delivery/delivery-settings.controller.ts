import { Body, Controller, Get, Patch } from '@nestjs/common';
import { PoliciesService } from '../common/policies/policies.service';
import { DeliverySettingsService } from './delivery-settings.service';
import { UpdateDeliverySettingsDto } from './dto/update-delivery-settings.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('delivery-settings')
export class DeliverySettingsController {
  constructor(
    private readonly settings: DeliverySettingsService,
    private readonly policies: PoliciesService,
  ) {}

  /** Whether this person may open Zones / Automations / Settings — the real owner-only gate. */
  @Get('access')
  async access() {
    return {
      canConfigure: await this.policies.actorCan(
        CAPABILITIES.DELIVERY_CONFIGURE,
      ),
    };
  }

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.get(user.businessId);
  }

  @RequireCapability(CAPABILITIES.DELIVERY_CONFIGURE)
  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDeliverySettingsDto,
  ) {
    return this.settings.update(user.businessId, dto);
  }
}
