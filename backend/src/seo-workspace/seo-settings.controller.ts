import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SeoSettingsService } from './seo-settings.service';

/** Read-only summary; editing goes through Settings → SEO Autopilot (versioned, permission-checked). */
@Controller('seo-autopilot/settings')
export class SeoSettingsController {
  constructor(private readonly settings: SeoSettingsService) {}

  @Get()
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.settings.summary(user.businessId);
  }
}
