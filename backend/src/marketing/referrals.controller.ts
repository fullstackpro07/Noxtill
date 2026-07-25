import { Body, Controller, Get, Post } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { UpdateReferralSettingsDto } from './dto/update-referral-settings.dto';
import { RedeemReferralDto } from './dto/redeem-referral.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Post('settings')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateReferralSettingsDto,
  ) {
    return this.referralsService.updateSettings(user.businessId, dto);
  }

  @Get('settings')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.referralsService.getSettings(user.businessId);
  }

  @Post('redeem')
  redeem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RedeemReferralDto,
  ) {
    return this.referralsService.redeem(user.businessId, dto);
  }

  @Get('stats')
  stats() {
    return this.referralsService.stats();
  }
}
