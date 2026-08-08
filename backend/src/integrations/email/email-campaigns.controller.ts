import { Controller, Get, Param, Post, Body, Query } from '@nestjs/common';
import { EmailCampaignsService } from './email-campaigns.service';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';

@Controller('integrations/email')
export class EmailCampaignsController {
  constructor(private readonly emailCampaigns: EmailCampaignsService) {}

  @Post('campaigns')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEmailCampaignDto) {
    return this.emailCampaigns.create(user.businessId, dto);
  }

  @Get('campaigns')
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.emailCampaigns.list(user.businessId);
  }

  @Get('campaigns/:id/funnel')
  funnel(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.emailCampaigns.funnel(user.businessId, id);
  }

  @Get('list-health')
  listHealth(@CurrentUser() user: AuthenticatedUser) {
    return this.emailCampaigns.listHealth(user.businessId);
  }

  /** Reached from the unsubscribe email link — no auth available at this point (BE-083). */
  @Public()
  @Get('unsubscribe')
  unsubscribe(@Query('token') token: string) {
    return this.emailCampaigns.unsubscribe(token);
  }
}
