import { Body, Controller, Get, Patch } from '@nestjs/common';
import { SocialSettingsService } from './social-settings.service';
import { UpdateSocialSettingsDto } from './dto/social-settings.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('social/settings')
export class SocialSettingsController {
  constructor(private readonly settings: SocialSettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.get(user.businessId);
  }

  @RequireCapability(CAPABILITIES.SOCIAL_MANAGE)
  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSocialSettingsDto,
  ) {
    return this.settings.update(user.businessId, dto);
  }
}
