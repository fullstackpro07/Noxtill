import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CompetitiveOpportunitiesService } from './competitive-opportunities.service';
import { CompetitiveSettingsService } from './competitive-settings.service';
import { UpdateCompetitiveSettingsDto } from './dto/update-competitive-settings.dto';
import { CompetitorSocialService } from './competitor-social.service';
import { OwnListingCompletenessService } from './own-listing-completeness.service';
import { CompetitiveWeeklyReportService } from './competitive-weekly-report.service';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller('competitive')
export class CompetitiveController {
  constructor(
    private readonly opportunities: CompetitiveOpportunitiesService,
    private readonly settings: CompetitiveSettingsService,
    private readonly competitorSocial: CompetitorSocialService,
    private readonly ownCompleteness: OwnListingCompletenessService,
    private readonly weeklyReport: CompetitiveWeeklyReportService,
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

  /** A competitor's public Instagram posting (Business Discovery) — an explicit status, never a fake zero, when it can't be read. */
  @Get('competitors/:id/social')
  competitorSocialFor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.competitorSocial.get(user.businessId, id);
  }

  /** Your own listing scored on the same public checks as a competitor's Google listing. */
  @Get('listing-completeness')
  listingCompleteness(@CurrentUser() user: AuthenticatedUser) {
    return this.ownCompleteness.get(user.businessId);
  }

  /** Sends the weekly report to the recipient in Competitive Settings right now, so the owner can check the setup. */
  @RequireCapability(CAPABILITIES.COMPETITIVE_MANAGE)
  @Post('weekly-report/send-now')
  sendWeeklyReportNow(@CurrentUser() user: AuthenticatedUser) {
    return this.weeklyReport.sendForBusiness(user.businessId);
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
