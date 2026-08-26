import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TimesheetsService } from './timesheets.service';
import { QueryTimesheetsDto } from './dto/query-timesheets.dto';
import { UpdateTimesheetSettingsDto } from './dto/update-timesheet-settings.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

/** UPD-BE-113 fix-it: this whole controller had no capability gate despite returning every
 * staff member's real hours/overtime to any authenticated user, not just their own. */
@RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
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

  @Get('timesheets/settings')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.timesheets.getSettings(user.businessId);
  }

  @Patch('timesheets/settings')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTimesheetSettingsDto,
  ) {
    return this.timesheets.updateSettings(user.businessId, dto);
  }
}
