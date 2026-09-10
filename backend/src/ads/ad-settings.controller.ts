import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AdSettingsService } from './ad-settings.service';
import { UpdateAdSettingsDto } from './dto/update-ad-settings.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('ads/settings')
export class AdSettingsController {
  constructor(private readonly settings: AdSettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.get(user.businessId);
  }

  @RequireCapability(CAPABILITIES.ADS_MANAGE)
  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAdSettingsDto,
  ) {
    return this.settings.update(user.businessId, dto);
  }
}
