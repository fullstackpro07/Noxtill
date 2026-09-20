import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { DraftCampaignMessageDto } from './dto/draft-campaign-message.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignsService.create(user.businessId, dto);
  }

  @Get()
  list() {
    return this.campaignsService.list();
  }

  @Get(':id/report')
  report(@Param('id') id: string) {
    return this.campaignsService.report(id);
  }

  @Post('draft-message')
  draftMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DraftCampaignMessageDto,
  ) {
    return this.campaignsService.draftMessage(user.businessId, dto);
  }
}
