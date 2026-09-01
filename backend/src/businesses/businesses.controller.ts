import { Body, Controller, Get, Patch } from '@nestjs/common';
import { BusinessesService } from './businesses.service';
import { UpdateBusinessProfileDto } from './dto/update-business-profile.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Get('me')
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.businesses.getProfile(user.businessId);
  }

  @RequireCapability(CAPABILITIES.BUSINESS_PROFILE_MANAGE)
  @Patch('me')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateBusinessProfileDto,
  ) {
    return this.businesses.updateProfile(user.businessId, dto);
  }
}
