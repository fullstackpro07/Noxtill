import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AdRulesService } from './ad-rules.service';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';

@Controller('ads/rules')
@UseGuards(JwtAuthGuard, TenantGuard)
export class AdRulesController {
  constructor(private readonly rules: AdRulesService) {}

  @Get()
  list(@CurrentTenant() businessId: string) {
    return this.rules.list(businessId);
  }

  @Post(':id/toggle')
  toggle(@CurrentTenant() businessId: string, @Param('id') id: string) {
    return this.rules.toggle(businessId, id);
  }

  @Post(':id/approve')
  approve(@CurrentTenant() businessId: string, @Param('id') id: string) {
    return this.rules.approve(businessId, id);
  }

  @Post(':id/decline')
  decline(@CurrentTenant() businessId: string, @Param('id') id: string) {
    return this.rules.decline(businessId, id);
  }
}
