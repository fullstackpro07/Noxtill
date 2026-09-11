import { Controller, Get, Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ActivityService } from './activity.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Sse('stream')
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return this.activityService.stream(user.businessId);
  }

  /** Live Activity depth fix — the real "open tables" card's data source. */
  @Get('open-tables-count')
  async openTablesCount(@CurrentUser() user: AuthenticatedUser) {
    return {
      count: await this.activityService.openTablesCount(user.businessId),
    };
  }
}
