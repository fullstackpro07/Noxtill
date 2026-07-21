import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
} from '@nestjs/common';
import { NightlyCloseService } from './nightly-close.service';
import { UpdateNightlyCloseDto } from './dto/update-nightly-close.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller()
export class NightlyCloseController {
  constructor(private readonly nightlyClose: NightlyCloseService) {}

  @Get('day/:date')
  async getDay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('date') date: string,
  ) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date, expected YYYY-MM-DD');
    }
    return this.nightlyClose.composeDayData(user.businessId, parsed);
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
