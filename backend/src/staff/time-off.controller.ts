import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TimeOffService } from './time-off.service';
import { CreateTimeOffDto } from './dto/create-time-off.dto';
import { RequireCapability } from '../common/decorators/require-capability.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';

@Controller()
export class TimeOffController {
  constructor(private readonly timeOff: TimeOffService) {}

  @Post('time-off')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTimeOffDto,
  ) {
    return this.timeOff.create(user.businessId, dto);
  }

  @Get('time-off')
  list(@Query('staffUserId') staffUserId?: string) {
    return this.timeOff.list(staffUserId);
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
  @Patch('time-off/:id/approve')
  approve(@Param('id') id: string) {
    return this.timeOff.approve(id);
  }

  @RequireCapability(CAPABILITIES.STAFF_MANAGE_SCHEDULE)
  @Patch('time-off/:id/reject')
  reject(@Param('id') id: string) {
    return this.timeOff.reject(id);
  }
}
