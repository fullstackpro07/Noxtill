import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { SeoAgentWorkspaceService } from './seo-agent-workspace.service';

/** Read-only: approve / reject / apply go through each owning screen's own endpoints. */
@Controller('seo-autopilot/workspace')
export class SeoAgentWorkspaceController {
  constructor(private readonly workspace: SeoAgentWorkspaceService) {}

  @Get()
  queue(@CurrentUser() user: AuthenticatedUser) {
    return this.workspace.queue(user.businessId);
  }

  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.workspace.history(user.businessId);
  }
}
