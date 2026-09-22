import { Controller, Get, Param, Post } from '@nestjs/common';
import { AdRulesService } from './ad-rules.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('ads/rules')
export class AdRulesController {
  constructor(private readonly rules: AdRulesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.rules.list(user.businessId);
  }

  @Post(':id/toggle')
  toggle(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.rules.toggle(user.businessId, id);
  }
}
