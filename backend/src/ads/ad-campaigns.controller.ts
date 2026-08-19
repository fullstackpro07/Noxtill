import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AdCampaignsService } from './ad-campaigns.service';
import { CreateAdCampaignDto } from './dto/create-ad-campaign.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('ads')
export class AdCampaignsController {
  constructor(private readonly campaigns: AdCampaignsService) {}

  @Get('campaigns')
  list() {
    return this.campaigns.list();
  }

  @Get('campaigns/:id')
  findOne(@Param('id') id: string) {
    return this.campaigns.findOne(id);
  }

  @RequireCapability(CAPABILITIES.ADS_MANAGE)
  @Post(':provider/campaigns')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider') provider: string,
    @Body() dto: CreateAdCampaignDto,
  ) {
    return this.campaigns.create(user.businessId, provider, dto);
  }
}
