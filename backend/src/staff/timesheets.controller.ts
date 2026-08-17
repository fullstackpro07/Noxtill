import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { QueryTimesheetsDto } from './dto/query-timesheets.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller()
export class TimesheetsController {
  constructor(private readonly timesheets: TimesheetsService) {}

  @Get('timesheets')
  report(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryTimesheetsDto,
  ) {
    return this.timesheets.report(user.businessId, query.month);
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
  @Post('timesheets/:staffUserId/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('staffUserId') staffUserId: string,
    @Query() query: QueryTimesheetsDto,
  ) {
    return this.timesheets.approve(
      user.businessId,
      staffUserId,
      query.month,
      user.sub,
    );
  }
}
