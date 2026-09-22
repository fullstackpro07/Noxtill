import { Body, Controller, Get, Post } from '@nestjs/common';
import { AdExperimentsService } from './ad-experiments.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('ads/experiments')
export class AdExperimentsController {
  constructor(private readonly experiments: AdExperimentsService) {}

  @Get()
  list() {
    return this.experiments.list();
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body()
    body: {
      name: string;
      provider: any;
      campaignId?: string;
      variantAHeadline: string;
      variantABody: string;
      variantBHeadline: string;
      variantBBody: string;
    },
  ) {
    return this.experiments.create(user.businessId, body);
  }
}
