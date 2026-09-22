import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AdCampaignsService } from './ad-campaigns.service';
import { AdCopyGeneratorService } from './ad-copy-generator.service';
import { CreateAdCampaignDto } from './dto/create-ad-campaign.dto';
import { UpdateAdCampaignDto } from './dto/update-ad-campaign.dto';
import { GenerateAdCopyDto } from './dto/generate-ad-copy.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('ads')
export class AdCampaignsController {
  constructor(
    private readonly campaigns: AdCampaignsService,
    private readonly copyGenerator: AdCopyGeneratorService,
  ) {}

  @Post('generate-copy')
  generateCopy(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateAdCopyDto) {
    return this.copyGenerator.generate(user.businessId, dto);
  }

  @Get('campaigns')
  list() {
    return this.campaigns.list();
  }

  @Get('campaigns/:id')
  findOne(@Param('id') id: string) {
    return this.campaigns.findOne(id);
  }

  /** Fatigue-warning depth fix. */
  @Get('campaigns/:id/fatigue')
  fatigue(@Param('id') id: string) {
    return this.campaigns.getFatigueWarning(id);
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

  @RequireCapability(CAPABILITIES.ADS_MANAGE)
  @Patch('campaigns/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdCampaignDto,
  ) {
    return this.campaigns.update(user.businessId, id, dto, user.role);
  }
}
