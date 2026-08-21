import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { NightlyCloseService } from './nightly-close.service';
import { UpdateNightlyCloseDto } from './dto/update-nightly-close.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

function parseDate(value: string, label: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${label}, expected YYYY-MM-DD`);
  }
  return parsed;
}

@Controller()
export class NightlyCloseController {
  constructor(private readonly nightlyClose: NightlyCloseService) {}

  @Get('day/:date')
  async getDay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('date') date: string,
  ) {
    return this.nightlyClose.composeDayData(
      user.businessId,
      parseDate(date, 'date'),
    );
  }

  /** UPD-BE-083 */
  @Get('nightly-close/history')
  getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: 'sent' | 'failed',
  ) {
    return this.nightlyClose.getHistory(user.businessId, {
      from: from ? parseDate(from, 'from') : undefined,
      to: to ? parseDate(to, 'to') : undefined,
      status,
    });
  }

  /** UPD-BE-083: preview tonight's close without sending it. */
  @Post('nightly-close/preview')
  preview(@CurrentUser() user: AuthenticatedUser) {
    return this.nightlyClose.preview(user.businessId);
  }

  /** UPD-BE-083: "Send test now" — bypasses the schedule. */
  @Post('nightly-close/test-send')
  testSend(@CurrentUser() user: AuthenticatedUser) {
    return this.nightlyClose.testSend(user.businessId);
  }

  @Patch('settings/nightly-close')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNightlyCloseDto,
  ) {
    return this.nightlyClose.updateSettings(
      user.businessId,
      dto.time,
      dto.channel,
    );
  }
}
