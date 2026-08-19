import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CompetitiveOpportunitiesService } from './competitive-opportunities.service';
import { CompetitiveSettingsService } from './competitive-settings.service';
import { UpdateCompetitiveSettingsDto } from './dto/update-competitive-settings.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('competitive')
export class CompetitiveController {
  constructor(
    private readonly opportunities: CompetitiveOpportunitiesService,
    private readonly settings: CompetitiveSettingsService,
  ) {}

  @Get('opportunities')
  listOpportunities(@CurrentUser() user: AuthenticatedUser) {
    return this.opportunities.list(user.businessId);
  }

  @Get('recommendations')
  listRecommendations(@CurrentUser() user: AuthenticatedUser) {
    return this.opportunities.listRecommendations(user.businessId);
  }

  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Post('opportunities/refresh')
  refreshOpportunities(@CurrentUser() user: AuthenticatedUser) {
    return this.opportunities.generateForBusiness(user.businessId);
  }

  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Post('opportunities/:id/dismiss')
  dismissOpportunity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.opportunities.dismiss(user.businessId, id);
  }

  @Get('settings')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.get(user.businessId);
  }

  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Patch('settings')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateCompetitiveSettingsDto,
  ) {
    return this.settings.update(user.businessId, dto);
  }
}
