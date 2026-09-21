import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AdExperimentsService } from './ad-experiments.service';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';

@Controller('ads/experiments')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AdExperimentsController {
  constructor(private readonly experiments: AdExperimentsService) {}

  @Get()
  list() {
    return this.experiments.list();
  }

  @Post()
  create(
    @CurrentTenant() businessId: string,
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
    return this.experiments.create(businessId, body);
  }
}
